// Who has gone through the installer course, page by page, and how long they spent (kept on the server).
import { kvGet, kvUpdate } from "./store";
import type { InstallProgress } from "./installCourse";

const KEY = (uid: string) => `ldmv:install:progress:${uid}`;
const PEOPLE = "ldmv:install:people";

export const getInstallProgress = async (uid: string): Promise<InstallProgress> => (await kvGet<InstallProgress>(KEY(uid))) ?? { modules: {} };
export const installPeople = async () => (await kvGet<string[]>(PEOPLE)) ?? [];

/** One beat from an open lesson page: marks it seen and adds the seconds since the last beat (capped). */
export async function recordInstall(uid: string, ev: { module: string; page: number; secs?: number; done?: boolean }) {
  await kvUpdate<string[]>(PEOPLE, [], (ids) => (ids.includes(uid) ? ids : [...ids, uid]));
  return kvUpdate<InstallProgress>(KEY(uid), { modules: {} }, (p) => {
    p.modules ??= {};
    const m = (p.modules[ev.module] ??= { seen: [], secs: {}, started: Date.now() });
    if (!m.seen.includes(ev.page)) m.seen.push(ev.page);
    const add = Math.max(0, Math.min(60, Math.round(Number(ev.secs) || 0)));
    m.secs[ev.page] = (m.secs[ev.page] ?? 0) + add;
    if (ev.done && !m.done) m.done = Date.now();
    p.last = Date.now();
  });
}
