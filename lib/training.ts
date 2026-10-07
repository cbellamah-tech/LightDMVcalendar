// Quoting course. The lessons, price bands and practice quotes come from a "training pack" an owner uploads
// (built from the Quoting Playbook and sold Jobber quotes, customer names removed). It holds Light DMV's real
// prices, so it lives in the database, never in the (public) code repo.
import { kvGet, kvSet, kvUpdate } from "./store";

export type Block =
  | { t: "p"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] };
export type Lesson = { title: string; blocks: Block[] };
export type Practice = "read" | "intake" | "blind" | "final";
export type Module = { id: string; title: string; goal: string; practice: Practice; lessons: Lesson[] };
export type Band = { cat: string; n: number; p25: number; median: number; p75: number };
export type Rates = {
  rooflinePerFt: number; perStrand: number; pillar: number; wreath: Record<string, number>;
  depositPct: number; taxPct: number; cashDiscountPct: number; returningDiscountPct: number; returningBefore: string; passPct: number;
};
export type Line = { name: string; desc: string; qty: number; unit: number; total: number; cat: string; optional: boolean };
export type Item = { id: string; season: string; title: string; lines: Line[]; included: string[]; total: number };
export type Intake = { routes: string[]; items: { id: string; text: string; answer: number; why: string }[]; note?: string };
export type Pack = { kind: "ldmv-training-pack"; version: number; builtAt: string; source: string; modules: Module[]; bands: Band[]; rates: Rates; intake: Intake; practice: Item[] };

const PACK = "ldmv:training:pack";
const RATES = "ldmv:training:rates";
const PROG = (uid: string) => `ldmv:training:progress:${uid}`;
const PROG_INDEX = "ldmv:training:trainees";

const DEFAULT_RATES: Rates = {
  rooflinePerFt: 10, perStrand: 35, pillar: 70, wreath: { "36": 225, "48": 350, "60": 550, "72": 820 },
  depositPct: 50, taxPct: 6, cashDiscountPct: 5, returningDiscountPct: 10, returningBefore: "Oct 15", passPct: 10,
};

let mem: { at: number; pack: Pack | null } | null = null;

export async function loadPack(): Promise<Pack | null> {
  if (mem && Date.now() - mem.at < 60_000) return mem.pack;
  const pack = await kvGet<Pack>(PACK);
  mem = { at: Date.now(), pack };
  return pack;
}

export async function savePack(raw: unknown): Promise<Pack> {
  const p = raw as Partial<Pack>;
  if (!p || p.kind !== "ldmv-training-pack" || !Array.isArray(p.modules) || !Array.isArray(p.practice)) throw new Error("That isn't a training pack file.");
  const pack = p as Pack;
  await kvSet(PACK, pack);
  mem = { at: Date.now(), pack };
  return pack;
}

export async function getRates(pack?: Pack | null): Promise<Rates> {
  const saved = await kvGet<Partial<Rates>>(RATES);
  return { ...DEFAULT_RATES, ...(pack?.rates ?? {}), ...(saved ?? {}) };
}

export async function saveRates(r: Partial<Rates>): Promise<Rates> {
  const clean: Partial<Rates> = {};
  for (const k of ["rooflinePerFt", "perStrand", "pillar", "depositPct", "taxPct", "cashDiscountPct", "returningDiscountPct", "passPct"] as const) {
    const v = Number(r[k]);
    if (Number.isFinite(v) && v >= 0) clean[k] = v;
  }
  if (r.wreath && typeof r.wreath === "object") {
    clean.wreath = Object.fromEntries(Object.entries(r.wreath).map(([s, v]) => [s, Number(v)]).filter(([, v]) => Number.isFinite(v as number) && (v as number) >= 0));
  }
  if (typeof r.returningBefore === "string") clean.returningBefore = r.returningBefore.slice(0, 20);
  const saved = await kvUpdate<Partial<Rates>>(RATES, {}, (cur) => ({ ...cur, ...clean }));
  return { ...DEFAULT_RATES, ...saved };
}

// ---------- progress ----------

export type Attempt = { at: number; mode: "blind" | "tree" | "final"; item: string; pctOff: number; lines: { cat: string; pctOff: number }[] };
export type Progress = {
  read: Record<string, number>;               // module id -> when marked read
  intake?: { at: number; score: number; of: number; best: number };
  attempts: Attempt[];                        // newest last, capped
  finals: { at: number; within: number; of: number }[];
};
const EMPTY: Progress = { read: {}, attempts: [], finals: [] };

export async function getProgress(uid: string): Promise<Progress> {
  return { ...EMPTY, ...((await kvGet<Progress>(PROG(uid))) ?? {}) };
}

export async function updateProgress(uid: string, fn: (p: Progress) => void): Promise<Progress> {
  await kvUpdate<string[]>(PROG_INDEX, [], (ids) => (ids.includes(uid) ? ids : [...ids, uid]));
  return kvUpdate<Progress>(PROG(uid), structuredClone(EMPTY), (p) => {
    p.read ??= {}; p.attempts ??= []; p.finals ??= [];
    fn(p);
    p.attempts = p.attempts.slice(-300);
    p.finals = p.finals.slice(-30);
  });
}

export const trainees = async () => (await kvGet<string[]>(PROG_INDEX)) ?? [];

export type Status = "not started" | "in progress" | "passed";
export function moduleStatus(m: Module, p: Progress, passPct: number): { status: Status; detail: string } {
  const read = !!p.read[m.id];
  if (m.practice === "read") return { status: read ? "passed" : "not started", detail: read ? "Read" : "" };
  if (m.practice === "intake") {
    const best = p.intake?.best ?? 0, of = p.intake?.of ?? 0;
    if (!p.intake) return { status: read ? "in progress" : "not started", detail: "" };
    return { status: of && best / of >= 0.8 ? "passed" : "in progress", detail: `Best ${best} of ${of}` };
  }
  if (m.practice === "blind") {
    const blind = p.attempts.filter((a) => a.mode === "blind");
    const good = blind.filter((a) => a.pctOff <= passPct).length;
    if (!blind.length) return { status: read ? "in progress" : "not started", detail: "" };
    return { status: blind.length >= 5 && good >= 3 ? "passed" : "in progress", detail: `${blind.length} practice quotes, ${good} within ${passPct}%` };
  }
  const best = p.finals.reduce((b, f) => Math.max(b, f.within), 0);
  if (!p.finals.length) return { status: read ? "in progress" : "not started", detail: "" };
  return { status: p.finals.some((f) => f.within === f.of) ? "passed" : "in progress", detail: `Best run: ${best} of 5 within ${passPct}%` };
}

// ---------- practice ----------

/** What the trainee sees: everything but the prices. */
export function blindItem(it: Item) {
  return {
    id: it.id, season: it.season, title: it.title, included: it.included,
    lines: it.lines.map((l) => ({ name: l.name, desc: l.desc, qty: l.qty, cat: l.cat, optional: l.optional })),
  };
}

export const pctOff = (answer: number, real: number) => (real > 0 ? Math.round((Math.abs(answer - real) / real) * 1000) / 10 : 0);
export const grade = (pct: number, passPct: number) => (pct <= passPct ? "pass" : pct <= 25 ? "close" : "miss");

/** Random picks the trainee hasn't done yet (falls back to any). */
export function pick<T extends { id: string }>(all: T[], done: Set<string>, n: number): T[] {
  const fresh = all.filter((x) => !done.has(x.id));
  const pool = fresh.length >= n ? fresh : all;
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < Math.min(n, pool.length)) {
    const i = Math.floor(Math.random() * pool.length);
    if (!used.has(i)) { used.add(i); out.push(pool[i]); }
  }
  return out;
}

export function treeLines(pack: Pack) {
  const out: { id: string; season: string; line: Line }[] = [];
  for (const it of pack.practice) it.lines.forEach((l, i) => { if (l.cat === "tree") out.push({ id: `${it.id}:${i}`, season: it.season, line: l }); });
  return out;
}
