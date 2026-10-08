import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";
import { toCourse, totalSecs } from "@/lib/installCourse";
import { getInstallProgress, installPeople } from "@/lib/installProgress";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Owners and crew leads: each person's installer course, page by page, with time spent, quiz tries and sign-offs. */
export async function GET() {
  const s = await requireRole("owner", "manager", "lead");
  if (s instanceof NextResponse) return s;
  const course = toCourse((await loadPack())?.install?.modules ?? []);
  const users = await listUsers();
  const people = [];
  for (const uid of await installPeople()) {
    const p = await getInstallProgress(uid);
    const u = users.find((x) => x.id === uid);
    people.push({
      uid, name: u?.name ?? uid, role: u?.role, last: p.last ?? null,
      current: course.find((m) => !p.modules[m.key]?.done)?.title ?? "All done",
      secs: Object.values(p.modules).reduce((t, m) => t + totalSecs(m), 0),
      modules: course.map((m) => {
        const mp = p.modules[m.key];
        const titles = [...m.lessons.map((l) => l.title), ...(m.quiz ? ["Quiz"] : [])];
        return { key: m.key, title: m.title, pages: titles.length, seen: mp?.seen.length ?? 0, secs: totalSecs(mp), done: mp?.done ?? null, quiz: m.quiz ? (mp?.quiz ?? { tries: 0, best: 0 }) : null,
          started: mp?.started ?? null, lastAt: mp?.lastAt ?? null, videos: mp?.videos?.length ?? 0, signedOff: mp?.signedOff ?? null,
          lessons: titles.map((title, i) => ({ title, secs: mp?.secs[i] ?? 0, seen: !!mp?.seen.includes(i) })) };
      }),
    });
  }
  people.sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
  return NextResponse.json({ me: s.uid, modules: course.map((m) => ({ key: m.key, title: m.title, pages: m.lessons.length + (m.quiz ? 1 : 0) })), people });
}
