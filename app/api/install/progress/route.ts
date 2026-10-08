import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { getInstallProgress, recordInstall } from "@/lib/installProgress";
import { loadPack } from "@/lib/training";
import { toCourse } from "@/lib/installCourse";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await getInstallProgress(s.uid));
}

/** Body: { module, page, secs?, done? }, sent every few seconds while a lesson page is open. */
export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.module !== "string" || !Number.isInteger(b.page) || b.page < 0 || b.page > 200) return NextResponse.json({ error: "Bad progress" }, { status: 400 });
  const needsQuiz = !!b.done && !!toCourse((await loadPack())?.install?.modules ?? []).find((m) => m.key === b.module)?.quiz;
  return NextResponse.json(await recordInstall(s.uid, { module: b.module.slice(0, 80), page: b.page, secs: b.secs, done: !!b.done, needsQuiz }));
}
