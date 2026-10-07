import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { askIdx, Attempt, forTrainee, getProgress, getRates, gradeQuote, loadPack, pick, updateProgress } from "@/lib/training";

export const dynamic = "force-dynamic";

/** ?mode=drill&module=q3: a real job with lines of that module's type to price. quote: one whole job. final: five. */
export async function GET(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const u = new URL(req.url);
  const mode = u.searchParams.get("mode") || "quote";
  const m = pack.modules.find((x) => x.id === u.searchParams.get("module"));
  const cats = mode === "drill" ? m?.cats : undefined;
  if (mode === "drill" && !cats) return NextResponse.json({ error: "Unknown module" }, { status: 400 });
  const p = await getProgress(s.uid);
  const done = new Set(p.attempts.filter((a) => a.mode === (mode === "final" ? "final" : mode)).map((a) => a.item));
  const pool = cats ? pack.quotes.filter((q) => askIdx(q, cats).length) : pack.quotes;
  const jobs = pick(pool, done, mode === "final" ? 5 : 1).map((q) => forTrainee(q, cats));
  return NextResponse.json({ jobs, run: mode === "final" ? Date.now().toString(36) : undefined });
}

/** Grades the trainee's prices against what Light DMV charged and records the attempt. */
export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const rates = await getRates(pack);
  const body = await req.json().catch(() => ({}));
  const q = pack.quotes.find((x) => x.id === body.job);
  if (!q) return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  const mode = body.mode === "final" ? "final" : body.mode === "drill" ? "drill" : "quote";
  const m = mode === "drill" ? pack.modules.find((x) => x.id === body.module) : undefined;
  if (mode === "drill" && !m?.cats) return NextResponse.json({ error: "Unknown module" }, { status: 400 });
  const r = gradeQuote(q, body.prices ?? {}, rates.passPct, m?.cats);
  const run = mode === "final" ? String(body.run || "") : undefined;
  const attempt: Attempt = { at: Date.now(), mode, module: m?.id, item: q.id, run, pctOff: r.pctOff, lines: r.rows.map((x) => ({ cat: x.cat, pctOff: x.pctOff })) };
  let final: { within: number; of: number } | null = null;
  await updateProgress(s.uid, (p) => {
    p.attempts.push(attempt);
    if (run) {
      const mine = p.attempts.filter((a) => a.run === run);
      if (mine.length === 5) {
        final = { within: mine.filter((a) => a.pctOff <= rates.passPct).length, of: 5 };
        p.finals.push({ at: Date.now(), ...final });
      }
    }
  });
  return NextResponse.json({ ...r, passPct: rates.passPct, final });
}
