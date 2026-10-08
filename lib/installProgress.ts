// Who has gone through the installer course, page by page, and how long they spent (kept on the server).
import { kvGet, kvUpdate } from "./store";
import type { InstallProgress } from "./installCourse";

const KEY = (uid: string) => `ldmv:install:progress:${uid}`;
const PEOPLE = "ldmv:install:people";

export const getInstallProgress = async (uid: string): Promise<InstallProgress> => (await kvGet<InstallProgress>(KEY(uid))) ?? { modules: {} };
export const installPeople = async () => (await kvGet<string[]>(PEOPLE)) ?? [];

/** One beat from an open lesson page: marks it seen and adds the seconds since the last beat (capped). */
export async function recordInstall(uid: string, ev: { module: string; page: number; secs?: number; done?: boolean; needsQuiz?: boolean; video?: string }) {
  await kvUpdate<string[]>(PEOPLE, [], (ids) => (ids.includes(uid) ? ids : [...ids, uid]));
  return kvUpdate<InstallProgress>(KEY(uid), { modules: {} }, (p) => {
    p.modules ??= {};
    const m = (p.modules[ev.module] ??= { seen: [], secs: {}, started: Date.now() });
    if (!m.seen.includes(ev.page)) m.seen.push(ev.page);
    const add = Math.max(0, Math.min(60, Math.round(Number(ev.secs) || 0)));
    m.secs[ev.page] = (m.secs[ev.page] ?? 0) + add;
    m.lastAt = Date.now();
    if (ev.video && !(m.videos ??= []).includes(ev.video)) m.videos.push(ev.video);
    if (ev.done && !m.done && (!ev.needsQuiz || m.quiz?.passed)) m.done = Date.now();
    p.last = Date.now();
  });
}

/** Grades a module quiz on the server (the browser never gets the answers) and keeps the best score. */
export async function recordQuiz(uid: string, module: string, pct: number, passPct: number) {
  await kvUpdate<string[]>(PEOPLE, [], (ids) => (ids.includes(uid) ? ids : [...ids, uid]));
  return kvUpdate<InstallProgress>(KEY(uid), { modules: {} }, (p) => {
    p.modules ??= {};
    const m = (p.modules[module] ??= { seen: [], secs: {}, started: Date.now() });
    const q = (m.quiz ??= { tries: 0, best: 0 });
    q.tries += 1; q.best = Math.max(q.best, pct);
    q.attempts = [...(q.attempts ?? []), { at: Date.now(), pct }].slice(-50);
    m.lastAt = Date.now();
    if (pct >= passPct && !q.passed) q.passed = Date.now();
    p.last = Date.now();
  });
}

/** A crew lead or owner signs a person off on a module after watching them do it on a real job (or takes it back). */
export async function signOff(uid: string, module: string, by: string, undo = false) {
  return kvUpdate<InstallProgress>(KEY(uid), { modules: {} }, (p) => {
    p.modules ??= {};
    const m = (p.modules[module] ??= { seen: [], secs: {}, started: Date.now() });
    if (undo) delete m.signedOff; else m.signedOff = { by, at: Date.now() };
  });
}
