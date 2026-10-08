import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { courseDef } from "@/lib/courseApi";
import { loadPack } from "@/lib/training";
import { toCourse, unlocked } from "@/lib/installCourse";
import { getInstallProgress } from "@/lib/installProgress";

export const dynamic = "force-dynamic";

/** For the home page: how far this person is in the installer course and what comes next, without the course itself. */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const course = toCourse(courseDef(await loadPack(), "install")?.modules ?? []);
  if (!course.length) return NextResponse.json({ loaded: false });
  const p = await getInstallProgress(s.uid);
  const i = course.findIndex((m, n) => !p.modules[m.key]?.done && unlocked(n, course, p));
  return NextResponse.json({
    loaded: true,
    total: course.length,
    done: course.filter((m) => p.modules[m.key]?.done).length,
    signedOff: course.filter((m) => p.modules[m.key]?.signedOff).length,
    next: i >= 0 ? { n: i + 1, title: course[i].title, started: !!p.modules[course[i].key] } : null,
  });
}
