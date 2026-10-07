// Quote-creation course. The lessons, real sold quotes and their finished-install photos come from a "training pack"
// an owner uploads. It holds real prices and house photos, so it lives in the database and photo storage, never in
// the (public) code repo.
import { kvGet, kvSet, kvUpdate } from "./store";

export type Block =
  | { t: "p"; text: string }
  | { t: "tip"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "img"; id: string; caption: string }
  | { t: "gallery"; items: { id: string; caption: string }[] };
export type Check = { q: string; options: string[]; answer: number; why: string };
export type LessonCard = { title: string; blocks: Block[]; check?: Check };
export type Practice = "read" | "drill" | "quotes" | "final";
export type Module = { id: string; title: string; goal: string; practice: Practice; cats?: string[]; cards: LessonCard[] };
export type Band = { cat: string; n: number; p25: number; median: number; p75: number; avg?: number };
export type Rates = {
  rooflinePerFt: number; perStrand: number; pillar: number; wreath: Record<string, number>;
  depositPct: number; taxPct: number; cashDiscountPct: number; returningDiscountPct: number; returningBefore: string; passPct: number;
};
export type Product = { key: string; name: string; desc: string; cat: string; price: number; textOnly?: boolean };
export type QLine = { name: string; raw: string; desc: string; qty: number; unit: number; total: number; cat: string; how: string };
/** A real sold quote and the photo of the finished install. */
export type PQuote = { id: string; quoteId: string; season: string; photos: string[]; lines: QLine[]; included: string[]; total: number; featured: boolean };
export type TreeGroup = { size: string; n: number; avg: number; low: number; high: number };
export type Pack = {
  kind: "ldmv-training-pack"; version: number; builtAt: string; source: string;
  modules: Module[]; bands: Band[]; rates: Rates; catalog: Product[]; treeGroups: TreeGroup[]; quotes: PQuote[];
};

const PACK = "ldmv:training:pack";
const RATES = "ldmv:training:rates";
const IMG = (id: string) => `ldmv:training:img:${id}`;
const IMG_INDEX = "ldmv:training:imgs";
const PROG = (uid: string) => `ldmv:training:progress:${uid}`;
const PROG_INDEX = "ldmv:training:trainees";

const DEFAULT_RATES: Rates = {
  rooflinePerFt: 10, perStrand: 35, pillar: 70, wreath: { "36": 225, "48": 350, "60": 550 },
  depositPct: 50, taxPct: 6, cashDiscountPct: 5, returningDiscountPct: 10, returningBefore: "Oct 15", passPct: 10,
};

let mem: { at: number; pack: Pack | null } | null = null;

export async function loadPack(): Promise<Pack | null> {
  if (mem && Date.now() - mem.at < 60_000) return mem.pack;
  let pack = await kvGet<Pack>(PACK);
  if (pack && (pack.version ?? 1) < 3) pack = null; // earlier drafts' format; needs the new file
  mem = { at: Date.now(), pack };
  return pack;
}

export async function savePack(raw: unknown): Promise<Pack> {
  const p = raw as Partial<Pack> & { imageData?: unknown };
  if (!p || p.kind !== "ldmv-training-pack" || !Array.isArray(p.modules)) throw new Error("That isn't a training pack file.");
  if ((p.version ?? 1) < 3 || !Array.isArray(p.quotes)) throw new Error("That's an old training file. Upload the new training_pack.json.");
  const { imageData: _drop, ...pack } = p;
  await kvSet(PACK, pack);
  mem = { at: Date.now(), pack: pack as Pack };
  return pack as Pack;
}

// ---------- photos (stored once in photo storage; the pack only names them) ----------

export const imageIds = async () => (await kvGet<string[]>(IMG_INDEX)) ?? [];
export const imageUrl = (id: string) => kvGet<string>(IMG(id));
export async function setImage(id: string, url: string) {
  await kvSet(IMG(id), url);
  await kvUpdate<string[]>(IMG_INDEX, [], (ids) => (ids.includes(id) ? ids : [...ids, id]));
}

// ---------- rates ----------

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

export type Mode = "drill" | "quote" | "final";
export type Attempt = { at: number; mode: Mode; module?: string; item: string; run?: string; pctOff: number; lines: { cat: string; pctOff: number }[] };
export type Progress = {
  read: Record<string, number>;               // module id -> when its lesson was finished
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
    p.attempts = p.attempts.filter((a) => a.mode === "drill" || a.mode === "quote" || a.mode === "final"); // drop earlier drafts' attempts
    fn(p);
    p.attempts = p.attempts.slice(-300);
    p.finals = p.finals.slice(-30);
  });
}

export const trainees = async () => (await kvGet<string[]>(PROG_INDEX)) ?? [];

export type Status = "not started" | "in progress" | "passed";
export const DRILL_PASS = { tries: 3, good: 2 };
export const QUOTES_PASS = { tries: 5, good: 3 };

export function moduleStatus(m: Module, p: Progress, passPct: number): { status: Status; detail: string } {
  const read = !!p.read[m.id];
  if (m.practice === "read") return { status: read ? "passed" : "not started", detail: read ? "Done" : "" };
  if (m.practice === "final") {
    const best = p.finals.reduce((b, f) => Math.max(b, f.within), 0);
    if (!p.finals.length) return { status: read ? "in progress" : "not started", detail: "" };
    return { status: p.finals.some((f) => f.within === f.of) ? "passed" : "in progress", detail: `Best run: ${best} of 5 within ${passPct}%` };
  }
  const done = p.attempts.filter((a) => (m.practice === "drill" ? a.mode === "drill" && a.module === m.id : a.mode === "quote"));
  const good = done.filter((a) => a.pctOff <= passPct).length;
  const need = m.practice === "drill" ? DRILL_PASS : QUOTES_PASS;
  if (!done.length) return { status: read ? "in progress" : "not started", detail: read ? "Lesson done" : "" };
  return { status: read && done.length >= need.tries && good >= need.good ? "passed" : "in progress", detail: `${done.length} priced, ${good} within ${passPct}%` };
}

// ---------- practice ----------

export const pctOff = (answer: number, real: number) => (real > 0 ? Math.round((Math.abs(answer - real) / real) * 1000) / 10 : answer > 0 ? 100 : 0);
export const grade = (pct: number, passPct: number) => (pct <= passPct ? "pass" : pct <= 25 ? "close" : "miss");

/** Random picks the trainee hasn't done yet (falls back to any). */
export function pick<T extends { id: string }>(all: T[], done: Set<string>, n: number): T[] {
  const fresh = all.filter((x) => !done.has(x.id));
  const pool = [...(fresh.length >= n ? fresh : all)];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/** Which lines the trainee prices: all of them, or only the module's line types. */
export const askIdx = (q: PQuote, cats?: string[]) => q.lines.map((l, i) => (!cats || cats.includes(l.cat) ? i : -1)).filter((i) => i >= 0);

/** What the trainee sees: the photo and what the customer bought, never the prices. */
export function forTrainee(q: PQuote, cats?: string[]) {
  const ask = askIdx(q, cats);
  return {
    id: q.id, season: q.season, photos: q.photos,
    lines: q.lines.map((l, i) => ({ i, name: l.name, desc: l.desc, qty: l.qty, cat: l.cat, ask: ask.includes(i), price: ask.includes(i) ? null : l.total })),
    included: q.included,
  };
}

/** Compares the trainee's prices with what we charged, line by line. */
export function gradeQuote(q: PQuote, prices: Record<number, number>, passPct: number, cats?: string[]) {
  const ask = askIdx(q, cats);
  const rows = ask.map((i) => {
    const l = q.lines[i], mine = Number(prices[i]) || 0, off = pctOff(mine, l.total);
    return { i, name: l.name, cat: l.cat, qty: l.qty, unit: l.unit, real: l.total, mine, pctOff: off, grade: grade(off, passPct), how: l.how };
  });
  const realTotal = rows.reduce((t, r) => t + r.real, 0), myTotal = rows.reduce((t, r) => t + r.mine, 0);
  const off = pctOff(myTotal, realTotal);
  return { rows, realTotal, myTotal, pctOff: off, grade: grade(off, passPct), quoteTotal: q.total };
}

/** Which quote a mockup reference points at: "pq:<id>" (Jobber quote ids never go to the browser). */
export function mockupRef(pack: Pack, ref: string): { quoteId: string; lines: string[] } | null {
  if (!ref.startsWith("pq:")) return null;
  const q = pack.quotes.find((x) => x.id === ref.slice(3));
  return q ? { quoteId: q.quoteId, lines: q.lines.map((l) => l.raw || l.name) } : null;
}
