import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { isOffice } from "@/lib/session";
import { Attempt, Built, caseForTrainee, getProgress, getRates, grade, gradeCase, loadPack, pctOff, pick, updateProgress } from "@/lib/training";

export const dynamic = "force-dynamic";

/** ?mode=case: one real past request to quote. final: five. tree: one sold tree. Never includes what we charged. */
export async function GET(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const mode = new URL(req.url).searchParams.get("mode") || "case";
  const p = await getProgress(s.uid);
  const done = new Set(p.attempts.map((a) => a.item));
  if (mode === "tree") {
    const [t] = pick(pack.trees.filter((x) => !x.reference), done, 1);
    return NextResponse.json({ tree: t && { id: t.id, season: t.season, name: t.name, desc: t.desc, qty: t.qty, wrap: t.wrap } });
  }
  const cases = pick(pack.cases, done, mode === "final" ? 5 : 1).map(caseForTrainee);
  return NextResponse.json({ cases, catalog: pack.catalog, real: pack.realPhotos ?? {}, run: mode === "final" ? `${Date.now().toString(36)}` : undefined });
}

/** Grades a quote (or a tree) against what Light DMV really sent and records the attempt. */
export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const rates = await getRates(pack);
  const body = await req.json().catch(() => ({}));
  const band = (cat: string) => pack.bands.find((b) => b.cat === cat) ?? null;

  if (body.mode === "tree") {
    const t = pack.trees.find((x) => x.id === body.item);
    if (!t) return NextResponse.json({ error: "Unknown tree" }, { status: 400 });
    const off = pctOff(Number(body.price) || 0, t.total);
    await updateProgress(s.uid, (p) => { p.attempts.push({ at: Date.now(), mode: "tree", item: t.id, pctOff: off, lines: [{ cat: "tree", pctOff: off }] }); });
    return NextResponse.json({
      real: t.total, unit: t.unit, pctOff: off, grade: grade(off, rates.passPct), perStrand: rates.perStrand,
      realStrands: t.unit % rates.perStrand === 0 ? t.unit / rates.perStrand : null, band: band("tree"), size: t.size,
      group: pack.treeGroups.find((g) => g.size === t.size) ?? null,
    });
  }

  const c = pack.cases.find((x) => x.id === body.case);
  if (!c) return NextResponse.json({ error: "Unknown request" }, { status: 400 });
  const built = body.built as Built;
  if (!built || !Array.isArray(built.lines)) return NextResponse.json({ error: "Nothing to grade" }, { status: 400 });
  const r = gradeCase(c, { title: String(built.title || ""), lines: built.lines.slice(0, 30), answers: built.answers ?? {} }, rates.passPct);
  const mode = body.mode === "final" ? "final" : "case";
  const run = mode === "final" ? String(body.run || "") : undefined;
  const attempt: Attempt = {
    at: Date.now(), mode, item: c.id, run, pctOff: r.pctOff,
    lines: r.rows.map((x) => ({ cat: x.real.cat, pctOff: x.pctOff })), missed: r.rows.filter((x) => !x.mine).map((x) => x.real.cat),
  };
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
  return NextResponse.json({ ...r, jobberUrl: isOffice(s) ? r.jobberUrl : null, bands: pack.bands, passPct: rates.passPct, final });
}
