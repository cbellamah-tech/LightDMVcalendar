// Server side of both courses (installer and quote): the course content without answers, progress beats, graded quizzes,
// sign-offs and the owners' team view. The two courses share all of it; only where the content comes from differs.
import { NextResponse } from "next/server";
import type { Session } from "./session";
import { Block, loadPack, Pack, QuizQ } from "./training";
import { choiceOrder, CourseId, pageCount, Practice, toCourse, totalSecs, pageTitles } from "./installCourse";
import { getInstallProgress, installPeople, recordInstall, recordQuiz, signOff } from "./installProgress";
import { listUsers } from "./users";

type Def = { intro: Block[]; modules: { title: string; blocks: Block[]; quiz?: QuizQ[]; practice?: Practice }[]; passPct: number; ownerTodo: { title: string; blocks: Block[] } | null };

export function courseDef(pack: Pack | null, c: CourseId): Def | null {
  if (c === "quote") {
    const q = pack?.quote;
    return q ? { intro: q.intro, modules: q.modules, passPct: q.passPct ?? 80, ownerTodo: null } : null;
  }
  const g = pack?.install;
  return g ? { intro: g.intro, modules: g.modules, passPct: g.passPct ?? 80, ownerTodo: g.ownerTodo } : null;
}

/** Each person sees a question's choices in their own shuffled order, so the right answer isn't always in the same spot. */
const order = (uid: string, module: string, qi: number, n: number) => choiceOrder(`${uid}|${module}|${qi}`, n);

export async function getCourse(s: Session, c: CourseId, office: boolean) {
  const def = courseDef(await loadPack(), c);
  if (!def) return NextResponse.json({ loaded: false });
  const course = toCourse(def.modules);
  // Quiz answers stay on the server; the quiz route grades them.
  const modules = def.modules.map((m, i) => ({
    ...m,
    quiz: m.quiz?.map(({ q, choices }, qi) => ({ q, choices: order(s.uid, course[i].key, qi, choices.length).map((j) => choices[j]) })),
  }));
  return NextResponse.json({ loaded: true, intro: def.intro, modules, ownerTodo: office ? def.ownerTodo : null });
}

export async function postBeat(s: Session, c: CourseId, req: Request) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.module !== "string" || !Number.isInteger(b.page) || b.page < 0 || b.page > 200) return NextResponse.json({ error: "Bad progress" }, { status: 400 });
  const m = toCourse(courseDef(await loadPack(), c)?.modules ?? []).find((x) => x.key === b.module);
  return NextResponse.json(await recordInstall(s.uid, {
    module: b.module.slice(0, 80), page: b.page, secs: b.secs, done: !!b.done, needsQuiz: !!b.done && !!m?.quiz, needsPractice: !!b.done && !!m?.practice,
    video: typeof b.video === "string" ? b.video.slice(0, 20) : undefined,
  }, c));
}

/** Body: { module, answers: number[] } in the order the person saw the choices. Grades it and keeps the best score. */
export async function postQuiz(s: Session, c: CourseId, req: Request) {
  const b = await req.json().catch(() => ({}));
  const def = courseDef(await loadPack(), c);
  const course = toCourse(def?.modules ?? []);
  const i = course.findIndex((x) => x.key === b.module);
  const m = def?.modules[i];
  if (!m?.quiz?.length || !Array.isArray(b.answers)) return NextResponse.json({ error: "No quiz for that module" }, { status: 400 });
  const passPct = def!.passPct;
  const results = m.quiz.map((q, qi) => {
    const o = order(s.uid, b.module, qi, q.choices.length);
    return { correct: o[b.answers[qi]] === q.answer, answer: o.indexOf(q.answer), why: q.why };
  });
  const score = results.filter((r) => r.correct).length;
  const pct = Math.round((score / m.quiz.length) * 100);
  const progress = await recordQuiz(s.uid, b.module, pct, passPct, c);
  return NextResponse.json({ score, of: m.quiz.length, pct, pass: pct >= passPct, passPct, results, progress });
}

export async function postSignoff(s: Session, c: CourseId, req: Request) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.uid !== "string" || typeof b.module !== "string") return NextResponse.json({ error: "Bad sign-off" }, { status: 400 });
  if (b.uid === s.uid && s.role !== "owner") return NextResponse.json({ error: "Someone else signs you off" }, { status: 403 });
  await signOff(b.uid, b.module.slice(0, 80), s.name, !!b.undo, c);
  return NextResponse.json({ ok: true });
}

/** Each person's course, page by page, with time spent, quiz and practice tries, and sign-offs. */
export async function getTeam(s: Session, c: CourseId) {
  const course = toCourse(courseDef(await loadPack(), c)?.modules ?? []);
  const users = await listUsers();
  const people = [];
  for (const uid of await installPeople(c)) {
    const p = await getInstallProgress(uid, c);
    const u = users.find((x) => x.id === uid);
    people.push({
      uid, name: u?.name ?? uid, role: u?.role, last: p.last ?? null,
      current: course.find((m) => !p.modules[m.key]?.done)?.title ?? "All done",
      secs: Object.values(p.modules).reduce((t, m) => t + totalSecs(m), 0),
      modules: course.map((m) => {
        const mp = p.modules[m.key];
        const titles = pageTitles(m);
        const pr = mp?.practice;
        return {
          key: m.key, title: m.title, pages: titles.length, seen: mp?.seen.length ?? 0, secs: totalSecs(mp), done: mp?.done ?? null,
          quiz: m.quiz ? (mp?.quiz ?? { tries: 0, best: 0 }) : null,
          practice: m.practice ? { tries: pr?.tries ?? 0, good: pr?.good ?? 0, passed: pr?.passed ?? null, finals: pr?.finals ?? [] } : null,
          started: mp?.started ?? null, lastAt: mp?.lastAt ?? null, videos: mp?.videos?.length ?? 0, signedOff: mp?.signedOff ?? null,
          lessons: titles.map((title, i) => ({ title, secs: mp?.secs[i] ?? 0, seen: !!mp?.seen.includes(i) })),
        };
      }),
    });
  }
  people.sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
  return NextResponse.json({ me: s.uid, modules: course.map((m) => ({ key: m.key, title: m.title, pages: pageCount(m) })), people });
}
