// Installer course shape shared by the Install pages and the progress backend (no server imports here).
import type { Block } from "./training";

export type Lesson = { title: string; blocks: Block[] };
export type CourseModule = { key: string; title: string; lessons: Lesson[] };

export const moduleKey = (title: string) => title.toLowerCase().replace(/^module\s*\d+\.?\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "module";

const isCheck = (b: Block) => b.t === "tip" && /^\*\*(Quiz|Mistakes|Sign-off)/.test(b.text);

/** Splits a module into lesson pages. "###" subheadings start a page; without them the module becomes
 *  Learn it (everything up to the step list), Watch (the videos), Real jobs (what follows the steps). Mistakes, quiz and
 *  sign-off always end the module on a Check yourself page. */
export function toCourse(mods: { title: string; blocks: Block[] }[]): CourseModule[] {
  return mods.map((m) => {
    const check = m.blocks.filter(isCheck), body = m.blocks.filter((b) => !isCheck(b));
    const lessons: Lesson[] = [];
    if (body.some((b) => b.t === "h")) {
      let cur: Lesson = { title: "Start here", blocks: [] };
      for (const b of body) {
        if (b.t === "h") { if (cur.blocks.length) lessons.push(cur); cur = { title: b.text, blocks: [] }; }
        else cur.blocks.push(b);
      }
      if (cur.blocks.length) lessons.push(cur);
    } else {
      const learn: Block[] = [], watch: Block[] = [], real: Block[] = [];
      const firstList = body.findIndex((b) => b.t === "ol" || b.t === "ul");
      body.forEach((b, i) => (b.t === "videos" ? watch : firstList < 0 ? (watch.length ? real : learn) : i <= firstList ? learn : real).push(b));
      if (learn.length) lessons.push({ title: "Learn it", blocks: learn });
      if (watch.length) lessons.push({ title: "Watch", blocks: watch });
      if (real.length) lessons.push({ title: "Real jobs", blocks: real });
    }
    if (check.length) lessons.push({ title: "Check yourself", blocks: check });
    if (!lessons.length) lessons.push({ title: "Start here", blocks: [] });
    return { key: moduleKey(m.title), title: m.title, lessons };
  });
}

export type ModuleProgress = { seen: number[]; secs: Record<number, number>; started: number; done?: number };
export type InstallProgress = { modules: Record<string, ModuleProgress>; last?: number };

export const totalSecs = (p?: ModuleProgress) => Object.values(p?.secs ?? {}).reduce((t, s) => t + s, 0);
export const fmtTime = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
