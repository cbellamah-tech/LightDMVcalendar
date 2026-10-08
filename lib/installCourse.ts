// Installer course shape shared by the Install pages and the progress backend (no server imports here).
import type { Block } from "./training";

export type Lesson = { title: string; blocks: Block[] };
export type Practice =
  | { kind: "intake"; need: number }
  | { kind: "lines"; cats: string[]; tries: number; good: number }
  | { kind: "job"; tries: number; good: number }
  | { kind: "final"; jobs: number; within: number; linePct: number };
export type CourseModule = { key: string; title: string; lessons: Lesson[]; quiz?: { q: string; choices: string[] }[]; practice?: Practice };
export type CourseId = "install" | "quote";

export const moduleKey = (title: string) => title.toLowerCase().replace(/^module\s*\d+\.?\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "module";

const isCheck = (b: Block) => b.t === "tip" && /^\*\*(Quiz|Mistakes|Sign-off)/.test(b.text);

/** Splits a module into lesson pages. "###" subheadings start a page; without them the module becomes
 *  Learn it (everything up to the step list), Watch (the videos), Real jobs (what follows the steps). Mistakes, quiz and
 *  sign-off always end the module on a Check yourself page. */
export function toCourse(mods: { title: string; blocks: Block[]; quiz?: { q: string; choices: string[] }[]; practice?: Practice }[]): CourseModule[] {
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
    return { key: moduleKey(m.title), title: m.title, lessons, quiz: m.quiz?.length ? m.quiz.map(({ q, choices }) => ({ q, choices })) : undefined, practice: m.practice };
  });
}

export type QuizResult = { tries: number; best: number; passed?: number; attempts?: { at: number; pct: number }[] };
export type PracticeTry = { at: number; job: string; pctOff: number; ok: boolean; worst?: number; feetOff?: number | null; choice?: number; run?: string };
export type PracticeResult = { tries: number; good: number; passed?: number; attempts?: PracticeTry[]; finals?: { at: number; within: number; of: number; ok: boolean }[] };
export type ModuleProgress = {
  seen: number[]; secs: Record<number, number>; started: number; lastAt?: number; done?: number; quiz?: QuizResult;
  practice?: PracticeResult; videos?: string[]; signedOff?: { by: string; at: number };
};
/** Pages in a module: its lessons, then practice (if any), then the quiz (if any). */
export const pageCount = (m: CourseModule) => m.lessons.length + (m.practice ? 1 : 0) + (m.quiz ? 1 : 0);
export const pageTitles = (m: CourseModule) => [...m.lessons.map((l) => l.title), ...(m.practice ? ["Practice"] : []), ...(m.quiz ? ["Quiz"] : [])];

/** The order a person sees a question's choices in: shuffled, the same each time for that person and module. */
export function choiceOrder(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** Modules 1 to 6 (the basics and safety) come first: the rest open once those six are done. */
export const BASICS = 6;
export const unlocked = (i: number, course: { key: string; practice?: Practice }[], p: InstallProgress, id: CourseId = "install") =>
  id === "quote"
    ? course[i]?.practice?.kind !== "final" || course.slice(0, i).every((m) => p.modules[m.key]?.done) // the final opens once everything before it is done
    : i < BASICS || course.slice(0, BASICS).every((m) => p.modules[m.key]?.done);
/** Says what has to happen before a locked module opens. */
export const lockedWhy = (id: CourseId) => (id === "quote" ? "Opens after every other module" : `Opens after modules 1 to ${BASICS}`);
export type InstallProgress = { modules: Record<string, ModuleProgress>; last?: number };

export const totalSecs = (p?: ModuleProgress) => Object.values(p?.secs ?? {}).reduce((t, s) => t + s, 0);
export const fmtTime = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
