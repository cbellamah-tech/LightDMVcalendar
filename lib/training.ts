// Quoting course. The lessons, Light DMV's product list and the practice requests (real past requests with the quote
// we actually sent) come from a "training pack" an owner uploads. It holds real prices and addresses, so it lives in
// the database, never in the (public) code repo.
import { kvGet, kvSet, kvUpdate } from "./store";

export type Block =
  | { t: "p"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] };
export type Check = { q: string; options: string[]; answer: number; why: string };
export type LessonCard = { title: string; blocks: Block[]; check?: Check };
export type Practice = "read" | "intake" | "blind" | "final" | "objections";
export type Module = { id: string; title: string; goal: string; practice: Practice; cards: LessonCard[] };
export type Band = { cat: string; n: number; p25: number; median: number; p75: number; avg?: number };
export type Rates = {
  rooflinePerFt: number; perStrand: number; pillar: number; wreath: Record<string, number>;
  depositPct: number; taxPct: number; cashDiscountPct: number; returningDiscountPct: number; returningBefore: string; passPct: number;
};
export type Product = { key: string; name: string; desc: string; cat: string; price: number; textOnly?: boolean };
export type CaseLine = { name: string; desc: string; qty: number; unit: number; total: number; cat: string; optional: boolean; textOnly: boolean };
export type Case = {
  id: string; season: string;
  request: { title: string; source: string; note: string; street: string; town: string; state: string; zip: string; attachments: number };
  repeat: { prior: number; lastSeason: string | null; last?: { season: string; status: string; lines: { name: string; total: number; optional: boolean }[] } | null };
  quote: { id: string; title: string; lines: CaseLine[]; subtotal: number; total: number; jobberUrl: string };
};
export type Tree = { id: string; quoteId: string; season: string; name: string; desc: string; qty: number; unit: number; total: number; size: string; wrap: string; reference?: boolean };
export type Example = { id: string; quoteId: string; season: string; priority: boolean; photos: string[]; lines: { name: string; desc: string; qty: number; total: number; optional: boolean; textOnly: boolean; cat: string }[]; bought: string; total: number };
export type TreeGroup = { size: string; n: number; avg: number; low: number; high: number };
export type Drill = { id: string; text: string; options?: string[]; answer: number; why: string };
export type Pack = {
  kind: "ldmv-training-pack"; version: number; builtAt: string; source: string;
  modules: Module[]; bands: Band[]; rates: Rates; catalog: Product[];
  intake: { routes: string[]; items: Drill[]; note?: string };
  objections: Drill[]; cases: Case[]; trees: Tree[]; treeGroups: TreeGroup[]; examples?: Example[];
  realPhotos?: Record<string, { fileId: string; caption: string; price: number | null }[]>; averages: { cat: string; n: number; avg: number }[];
};

const PACK = "ldmv:training:pack";
const RATES = "ldmv:training:rates";
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
  if (pack && (pack.version ?? 1) < 2) pack = null; // the first draft's format; needs the new file
  mem = { at: Date.now(), pack };
  return pack;
}

export async function savePack(raw: unknown): Promise<Pack> {
  const p = raw as Partial<Pack>;
  if (!p || p.kind !== "ldmv-training-pack" || !Array.isArray(p.modules)) throw new Error("That isn't a training pack file.");
  if ((p.version ?? 1) < 2 || !Array.isArray(p.cases) || !Array.isArray(p.catalog)) throw new Error("That's the old training file. Upload the new training_pack.json.");
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

export type Attempt = { at: number; mode: "case" | "tree" | "final"; item: string; run?: string; pctOff: number; lines: { cat: string; pctOff: number }[]; missed?: string[] };
export type Progress = {
  read: Record<string, number>;               // module id -> when its cards were all answered
  intake?: { at: number; score: number; of: number; best: number };
  objections?: { at: number; score: number; of: number; best: number };
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
  const quiz = (x?: { best: number; of: number }) => (!x ? { status: (read ? "in progress" : "not started") as Status, detail: read ? "Lesson done" : "" }
    : { status: (read && x.best / x.of >= 0.8 ? "passed" : "in progress") as Status, detail: `${read ? "Lesson done · " : ""}best ${x.best} of ${x.of}` });
  if (m.practice === "read") return { status: read ? "passed" : "not started", detail: read ? "Done" : "" };
  if (m.practice === "intake") return quiz(p.intake);
  if (m.practice === "objections") return quiz(p.objections);
  if (m.practice === "blind") {
    const done = p.attempts.filter((a) => a.mode === "case");
    const good = done.filter((a) => a.pctOff <= passPct).length;
    if (!done.length) return { status: read ? "in progress" : "not started", detail: read ? "Lesson done" : "" };
    return { status: read && done.length >= 5 && good >= 3 ? "passed" : "in progress", detail: `${done.length} practice quotes, ${good} within ${passPct}%` };
  }
  const best = p.finals.reduce((b, f) => Math.max(b, f.within), 0);
  if (!p.finals.length) return { status: read ? "in progress" : "not started", detail: "" };
  return { status: p.finals.some((f) => f.within === f.of) ? "passed" : "in progress", detail: `Best run: ${best} of 5 within ${passPct}%` };
}

// ---------- practice ----------

const mapsQ = (c: Case) => encodeURIComponent(`${c.request.street}, ${c.request.town}, ${c.request.state} ${c.request.zip}`);

/** What the trainee sees before quoting: the request and the house, never the quote we sent. */
export function caseForTrainee(c: Case) {
  return {
    id: c.id, season: c.season,
    request: c.request, repeat: c.repeat,
    links: {
      streetView: `https://www.google.com/maps/search/?api=1&query=${mapsQ(c)}`,
      earth: `https://earth.google.com/web/search/${mapsQ(c)}`,
      listing: `https://www.zillow.com/homes/${mapsQ(c)}_rb/`,
    },
  };
}

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

export type BuiltLine = { key: string; name: string; cat: string; price: number; optional: boolean; mockup: boolean; textOnly?: boolean };
export type Built = { title: string; lines: BuiltLine[]; answers: { repeat?: boolean; inScope?: boolean } };

const isIncluded = (n: string) => /all included|always included|takedown, maint|included in the price/i.test(n);
const isCash = (n: string) => /cash/i.test(n);

/** Compare a trainee's quote with the one Light DMV sent, line by line (matched on type of line). */
export function gradeCase(c: Case, b: Built, passPct: number) {
  const real = c.quote.lines.filter((l) => !l.textOnly && l.total > 0);
  const mine = b.lines.filter((l) => !l.textOnly && l.price > 0);
  // Match each real line to one of the trainee's: same type first, then a close type (roofline vs roofline + pillars).
  const family = (c: string) => (["roofline", "roofline+pillars", "other", "windows"].includes(c) ? "roof" : ["tree", "trees+bushes"].includes(c) ? "tree" : c);
  const used = new Set<number>();
  const match: number[] = real.map(() => -1);
  for (const pass of [0, 1]) real.forEach((r, ri) => {
    if (match[ri] >= 0) return;
    const j = mine.findIndex((m, i) => !used.has(i) && (pass === 0 ? m.cat === r.cat : family(m.cat) === family(r.cat)));
    if (j >= 0) { used.add(j); match[ri] = j; }
  });
  const rows = real.map((r, ri) => {
    const m = match[ri] >= 0 ? mine[match[ri]] : null;
    const off = m ? pctOff(m.price, r.total) : 100;
    return { real: { name: r.name, cat: r.cat, total: r.total, qty: r.qty, unit: r.unit, optional: r.optional }, mine: m && { name: m.name, price: m.price, optional: m.optional }, pctOff: off, grade: m ? grade(off, passPct) : "missed" };
  });
  const extra = mine.filter((_, i) => !used.has(i)).map((m) => ({ name: m.name, price: m.price, cat: m.cat }));
  const realTotal = real.reduce((t, l) => t + l.total, 0);
  const myTotal = mine.reduce((t, l) => t + l.price, 0);
  const off = pctOff(myTotal, realTotal);
  const first = b.lines.find((l) => !l.textOnly && l.price > 0);
  const checks = [
    { label: "Holiday lighting title", ok: /all-inclusive holiday lighting/i.test(b.title) },
    { label: "First line is required (not optional)", ok: !!first && !first.optional },
    { label: "Add-ons after it are optional", ok: mine.slice(1).every((l) => l.optional) || mine.length < 2 },
    { label: "\"All included\" $0 line (takedown, storage, timers, cords)", ok: b.lines.some((l) => isIncluded(l.name)) },
    { label: "5% cash discount line", ok: b.lines.some((l) => isCash(l.name) && (l.textOnly || l.price === 0)) },
    { label: "A mockup for every priced line", ok: mine.length > 0 && mine.every((l) => l.mockup) },
  ];
  const intake = [
    { label: "Previous customer?", yours: b.answers.repeat, right: c.repeat.prior > 0, why: c.repeat.prior > 0 ? `Yes: ${c.repeat.prior} earlier quote${c.repeat.prior > 1 ? "s" : ""}${c.repeat.lastSeason ? `, last in ${c.repeat.lastSeason}` : ""}. Start from last year's design and price.` : "No earlier quotes in Jobber for this client." },
  ];
  return {
    realTotal, myTotal, pctOff: off, grade: grade(off, passPct), rows, extra, checks, intake,
    realQuote: { title: c.quote.title, lines: c.quote.lines, subtotal: c.quote.subtotal, total: c.quote.total },
    jobberUrl: c.quote.jobberUrl,
  };
}

/** Which quote line a mockup reference points at: "case:<id>" or "tree:<id>" (quote ids never go to the browser). */
export function mockupRef(pack: Pack, ref: string): { quoteId: string; lines: string[] } | null {
  const [kind, id] = ref.split(":", 2).length === 2 ? [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)] : ["", ""];
  if (kind === "case") { const c = pack.cases.find((x) => x.id === id); return c ? { quoteId: c.quote.id, lines: c.quote.lines.map((l) => l.name) } : null; }
  if (kind === "ex") { const e = pack.examples?.find((x) => x.id === id); return e ? { quoteId: e.quoteId, lines: e.lines.map((l) => l.name) } : null; }
  if (kind === "tree") { const t = pack.trees.find((x) => x.id === id); return t ? { quoteId: t.quoteId, lines: [t.name] } : null; }
  return null;
}
