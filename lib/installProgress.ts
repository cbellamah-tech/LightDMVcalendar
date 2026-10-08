// Who has gone through each course (installer, quote), page by page, and how long they spent (kept on the server).
import { kvGet, kvUpdate } from "./store";
import type { CourseId, InstallProgress, ModuleProgress, PracticeTry } from "./installCourse";

const KEY = (uid: string, c: CourseId) => (c === "quote" ? `ldmv:quote:progress:${uid}` : `ldmv:install:progress:${uid}`);
const PEOPLE = (c: CourseId) => (c === "quote" ? "ldmv:quote:people" : "ldmv:install:people");

export const getInstallProgress = async (uid: string, c: CourseId = "install"): Promise<InstallProgress> => (await kvGet<InstallProgress>(KEY(uid, c))) ?? { modules: {} };
export const installPeople = async (c: CourseId = "install") => (await kvGet<string[]>(PEOPLE(c))) ?? [];

function edit(uid: string, c: CourseId, module: string, fn: (m: ModuleProgress, p: InstallProgress) => void) {
  return kvUpdate<InstallProgress>(KEY(uid, c), { modules: {} }, (p) => {
    p.modules ??= {};
    fn((p.modules[module] ??= { seen: [], secs: {}, started: Date.now() }), p);
  });
}
const join = (uid: string, c: CourseId) => kvUpdate<string[]>(PEOPLE(c), [], (ids) => (ids.includes(uid) ? ids : [...ids, uid]));

/** One beat from an open lesson page: marks it seen and adds the seconds since the last beat (capped).
 *  A module only counts as done once its quiz and practice (when it has them) are passed. */
export async function recordInstall(uid: string, ev: { module: string; page: number; secs?: number; done?: boolean; needsQuiz?: boolean; needsPractice?: boolean; video?: string }, c: CourseId = "install") {
  await join(uid, c);
  return edit(uid, c, ev.module, (m, p) => {
    if (!m.seen.includes(ev.page)) m.seen.push(ev.page);
    const add = Math.max(0, Math.min(60, Math.round(Number(ev.secs) || 0)));
    m.secs[ev.page] = (m.secs[ev.page] ?? 0) + add;
    m.lastAt = Date.now();
    if (ev.video && !(m.videos ??= []).includes(ev.video)) m.videos.push(ev.video);
    if (ev.done && !m.done && (!ev.needsQuiz || m.quiz?.passed) && (!ev.needsPractice || m.practice?.passed)) m.done = Date.now();
    p.last = Date.now();
  });
}

/** Grades a module quiz on the server (the browser never gets the answers) and keeps the best score. */
export async function recordQuiz(uid: string, module: string, pct: number, passPct: number, c: CourseId = "install") {
  await join(uid, c);
  return edit(uid, c, module, (m, p) => {
    const q = (m.quiz ??= { tries: 0, best: 0 });
    q.tries += 1; q.best = Math.max(q.best, pct);
    q.attempts = [...(q.attempts ?? []), { at: Date.now(), pct }].slice(-50);
    m.lastAt = Date.now();
    if (pct >= passPct && !q.passed) q.passed = Date.now();
    p.last = Date.now();
  });
}

/** One graded practice try. `pass` decides, from all the tries so far, whether the practice is passed. */
export async function recordPractice(uid: string, module: string, t: PracticeTry, pass: (tries: PracticeTry[]) => boolean, c: CourseId = "quote") {
  await join(uid, c);
  return edit(uid, c, module, (m, p) => {
    const r = (m.practice ??= { tries: 0, good: 0 });
    r.tries += 1; if (t.ok) r.good += 1;
    r.attempts = [...(r.attempts ?? []), t].slice(-100);
    if (!r.passed && pass(r.attempts)) r.passed = Date.now();
    m.lastAt = Date.now();
    p.last = Date.now();
  });
}

/** Saves a finished final run (several jobs graded together). */
export async function recordFinal(uid: string, module: string, run: { within: number; of: number; ok: boolean }, c: CourseId = "quote") {
  return edit(uid, c, module, (m) => {
    const r = (m.practice ??= { tries: 0, good: 0 });
    r.finals = [...(r.finals ?? []), { at: Date.now(), ...run }].slice(-30);
    if (run.ok && !r.passed) r.passed = Date.now();
  });
}

/** A crew lead or owner signs a person off on a module after watching them do it on a real job (or takes it back). */
export async function signOff(uid: string, module: string, by: string, undo = false, c: CourseId = "install") {
  return edit(uid, c, module, (m) => { if (undo) delete m.signedOff; else m.signedOff = { by, at: Date.now() }; });
}
