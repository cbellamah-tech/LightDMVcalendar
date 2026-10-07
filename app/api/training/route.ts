import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { getProgress, getRates, loadPack, moduleStatus, saveRates, updateProgress } from "@/lib/training";

export const dynamic = "force-dynamic";

/** Course home: modules with this person's status, plus the rates and price bands for the price helper. */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  const rates = await getRates(pack);
  if (!pack) return NextResponse.json({ loaded: false, rates });
  const p = await getProgress(s.uid);
  return NextResponse.json({
    loaded: true, builtAt: pack.builtAt, rates, bands: pack.bands, practiceCount: pack.cases.length,
    modules: pack.modules.map((m) => ({ id: m.id, title: m.title, goal: m.goal, practice: m.practice, ...moduleStatus(m, p, rates.passPct) })),
  });
}

export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const pack = await loadPack();

  if (body.action === "rates") {
    if (s.role !== "owner") return NextResponse.json({ error: "Only owners can change rates" }, { status: 403 });
    return NextResponse.json(await saveRates(body.rates ?? {}));
  }
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });

  if (body.action === "read") {
    const id = String(body.module || "");
    if (!pack.modules.some((m) => m.id === id)) return NextResponse.json({ error: "Unknown module" }, { status: 400 });
    await updateProgress(s.uid, (p) => { p.read[id] = Date.now(); });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "intake" || body.action === "objections") {
    const kind = body.action as "intake" | "objections";
    const answers = (body.answers ?? {}) as Record<string, number>;
    const items = kind === "intake" ? pack.intake.items : pack.objections;
    const results = items.map((q) => ({ id: q.id, picked: answers[q.id], answer: q.answer, why: q.why, right: answers[q.id] === q.answer }));
    const score = results.filter((r) => r.right).length, of = results.length;
    await updateProgress(s.uid, (p) => { p[kind] = { at: Date.now(), score, of, best: Math.max(score, p[kind]?.best ?? 0) }; });
    return NextResponse.json({ score, of, results });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

