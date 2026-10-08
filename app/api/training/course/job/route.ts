import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";
import { toCourse } from "@/lib/installCourse";
import { getInstallProgress, recordFinal, recordPractice } from "@/lib/installProgress";
import { finalMix, forQuoter, gradeJob, passLines, practiceJobs } from "@/lib/quotePractice";

export const dynamic = "force-dynamic";

async function ctx(module: string | null) {
  const pack = await loadPack();
  const qc = pack?.quote;
  if (!pack || !qc) return null;
  const i = toCourse(qc.modules).findIndex((m) => m.key === module);
  const spec = qc.modules[i]?.practice;
  return spec ? { pack, qc, spec, key: module! } : null;
}

/** ?module=<key>: the next practice item for that module (an intake request, a house, or the final's five houses). */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const c = await ctx(new URL(req.url).searchParams.get("module"));
  if (!c) return NextResponse.json({ error: "No practice in that module" }, { status: 400 });
  const prog = (await getInstallProgress(s.uid, "quote")).modules[c.key]?.practice;
  const done = new Set((prog?.attempts ?? []).map((a) => a.job));
  const fresh = <T extends { id: string }>(xs: T[]) => { const f = xs.filter((x) => !done.has(x.id)); return f.length ? f : xs; };
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  if (c.spec.kind === "intake") {
    const item = pick(fresh(c.qc.intake.items));
    return NextResponse.json({ kind: "intake", routes: c.qc.intake.routes, item: item && { id: item.id, text: item.text } });
  }
  const all = practiceJobs(c.pack);
  if (c.spec.kind === "final") {
    return NextResponse.json({ kind: "final", run: Date.now().toString(36), routes: c.qc.intake.routes, jobs: finalMix(all, c.spec.jobs).map((p) => forQuoter(p)) });
  }
  const cats = c.spec.kind === "lines" ? c.spec.cats : undefined;
  const pool = cats ? all.filter((p) => p.q.lines.some((l) => cats.includes(l.cat))) : all;
  const p = pick(fresh(pool.map((x) => ({ ...x, id: x.j.id }))));
  if (!p) return NextResponse.json({ error: "No practice houses in the file yet" }, { status: 400 });
  return NextResponse.json({ kind: c.spec.kind, routes: c.qc.intake.routes, jobs: [forQuoter(p, cats)] });
}

/** Grades one try. Body: { module, job, run?, route?, offer?, feet?, lines?, prices? } (intake: { module, item, route }). */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const c = await ctx(typeof b.module === "string" ? b.module : null);
  if (!c) return NextResponse.json({ error: "No practice in that module" }, { status: 400 });
  const spec = c.spec;

  if (spec.kind === "intake") {
    const item = c.qc.intake.items.find((x) => x.id === b.item);
    if (!item) return NextResponse.json({ error: "Unknown request" }, { status: 400 });
    const ok = Number(b.route) === item.answer;
    const progress = await recordPractice(s.uid, c.key, { at: Date.now(), job: item.id, pctOff: ok ? 0 : 100, ok, choice: Number(b.route) },
      (t) => t.filter((x) => x.ok).length >= spec.need);
    return NextResponse.json({ ok, answer: item.answer, why: item.why, need: spec.need, progress });
  }

  const p = practiceJobs(c.pack).find((x) => x.j.id === b.job);
  if (!p) return NextResponse.json({ error: "Unknown house" }, { status: 400 });
  const r = gradeJob(p, b, c.qc.pricePct, spec.kind === "lines" ? spec.cats : undefined);
  const run = spec.kind === "final" ? String(b.run || "").slice(0, 20) : undefined;
  const ok = spec.kind === "job" ? r.ok && (r.choice?.ok ?? true) : r.ok;
  let progress = await recordPractice(s.uid, c.key, { at: Date.now(), job: p.j.id, pctOff: r.pctOff, ok, worst: r.worst, feetOff: r.feet?.pctOff ?? null, run },
    spec.kind === "final" ? () => false : passLines(spec.tries, spec.good));
  let final = null;
  if (spec.kind === "final" && run) {
    const mine = (progress.modules[c.key].practice?.attempts ?? []).filter((a) => a.run === run);
    if (mine.length === spec.jobs) {
      const within = mine.filter((a) => a.pctOff <= c.qc.pricePct).length;
      const worst = mine.reduce((w, a) => Math.max(w, a.worst ?? 0), 0);
      final = { within, of: spec.jobs, worst, ok: within >= spec.within && worst <= spec.linePct, need: spec.within, linePct: spec.linePct };
      progress = await recordFinal(s.uid, c.key, { within, of: spec.jobs, ok: final.ok });
    }
  }
  return NextResponse.json({ ...r, ok, pricePct: c.qc.pricePct, final, progress });
}
