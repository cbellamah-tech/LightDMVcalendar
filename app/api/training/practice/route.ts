import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { Attempt, blindItem, getProgress, getRates, grade, loadPack, pctOff, pick, treeLines, updateProgress } from "@/lib/training";

export const dynamic = "force-dynamic";

/** Past sold quotes with the prices hidden: ?mode=blind (one quote), tree (one tree), final (five quotes). */
export async function GET(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const mode = new URL(req.url).searchParams.get("mode") || "blind";
  const p = await getProgress(s.uid);
  const done = new Set(p.attempts.map((a) => a.item));
  if (mode === "tree") {
    const [t] = pick(treeLines(pack), done, 1);
    return NextResponse.json({ tree: t && { id: t.id, season: t.season, name: t.line.name, desc: t.line.desc, qty: t.line.qty } });
  }
  return NextResponse.json({ items: pick(pack.practice, done, mode === "final" ? 5 : 1).map(blindItem) });
}

type Answer = { item: string; lines?: number[]; strands?: number; price?: number };

/** Grades answers against what Light DMV really charged and records the attempt. */
export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const rates = await getRates(pack);
  const body = (await req.json().catch(() => ({}))) as { mode?: string; answers?: Answer[] };
  const mode = body.mode === "tree" ? "tree" : body.mode === "final" ? "final" : "blind";
  const band = (cat: string) => pack.bands.find((b) => b.cat === cat) ?? null;
  const attempts: Attempt[] = [];

  if (mode === "tree") {
    const a = body.answers?.[0];
    const t = a && treeLines(pack).find((x) => x.id === a.item);
    if (!a || !t) return NextResponse.json({ error: "Unknown tree" }, { status: 400 });
    const off = pctOff(Number(a.price) || 0, t.line.total);
    attempts.push({ at: Date.now(), mode, item: t.id, pctOff: off, lines: [{ cat: "tree", pctOff: off }] });
    await updateProgress(s.uid, (p) => { p.attempts.push(...attempts); });
    return NextResponse.json({
      real: t.line.total, unit: t.line.unit, pctOff: off, grade: grade(off, rates.passPct),
      byRule: (Number(a.strands) || 0) * rates.perStrand, perStrand: rates.perStrand,
      realStrands: t.line.unit % rates.perStrand === 0 ? t.line.unit / rates.perStrand : null, band: band("tree"),
    });
  }

  const results = [];
  for (const a of body.answers ?? []) {
    const it = pack.practice.find((x) => x.id === a.item);
    if (!it) continue;
    const lines = it.lines.map((l, i) => {
      const ans = Number(a.lines?.[i]) || 0;
      const off = pctOff(ans, l.total);
      return { answer: ans, real: l.total, unit: l.unit, qty: l.qty, cat: l.cat, pctOff: off, grade: grade(off, rates.passPct), band: band(l.cat) };
    });
    const ansTotal = lines.reduce((t, l) => t + l.answer, 0);
    const off = pctOff(ansTotal, it.total);
    attempts.push({ at: Date.now(), mode, item: it.id, pctOff: off, lines: lines.map((l) => ({ cat: l.cat, pctOff: l.pctOff })) });
    results.push({ item: it.id, total: it.total, answerTotal: ansTotal, pctOff: off, grade: grade(off, rates.passPct), lines });
  }
  if (!results.length) return NextResponse.json({ error: "Nothing to grade" }, { status: 400 });
  const within = results.filter((r) => r.pctOff <= rates.passPct).length;
  await updateProgress(s.uid, (p) => {
    p.attempts.push(...attempts);
    if (mode === "final") p.finals.push({ at: Date.now(), within, of: results.length });
  });
  return NextResponse.json({ results, within, of: results.length, passPct: rates.passPct });
}
