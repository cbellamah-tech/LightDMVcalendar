import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";
import { moduleKey } from "@/lib/installCourse";
import { recordQuiz } from "@/lib/installProgress";

export const dynamic = "force-dynamic";

/** Body: { module, answers: number[] }. Grades the module quiz and saves the best score. */
export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const g = (await loadPack())?.install;
  const m = g?.modules?.find((x) => moduleKey(x.title) === b.module);
  if (!m?.quiz?.length || !Array.isArray(b.answers)) return NextResponse.json({ error: "No quiz for that module" }, { status: 400 });
  const passPct = g?.passPct ?? 80;
  const results = m.quiz.map((q, i) => ({ correct: b.answers[i] === q.answer, answer: q.answer, why: q.why }));
  const score = results.filter((r) => r.correct).length;
  const pct = Math.round((score / m.quiz.length) * 100);
  const progress = await recordQuiz(s.uid, b.module, pct, passPct);
  return NextResponse.json({ score, of: m.quiz.length, pct, pass: pct >= passPct, passPct, results, progress });
}
