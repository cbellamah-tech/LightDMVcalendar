import { kvGet, kvSet, kvUpdate } from "./store";
import { getJobs, Job, listMaterials, MaterialRecord } from "./jobs";
import { gql, isConnected } from "./jobber";
import { buildSelection } from "./jobberSchema";
import type { JobDetail } from "./jobDetails";
import { expenseTotal, getAllExpenses } from "./expenses";

/* Owners' cost ledger. Supplier prices, sold prices and stock live only in the database (ldmv_kv):
   the repo is public, so nothing here carries a dollar figure. An owner uploads the supplier cost
   sheet once on the Costs page; crews' material counts come from the install checklist (ldmv:materials). */

/** The materials the ledger knows how to count. Names only; prices come from the uploaded sheet. */
export const MATERIALS = {
  c9: { name: "C9 LED bulb, warm white", unit: "bulb" },
  c7: { name: "C7 bulb", unit: "bulb" },
  clip: { name: "Tulip clip", unit: "clip" },
  male: { name: "SPT1 green male plug", unit: "plug" },
  female: { name: "SPT1 green female plug", unit: "plug" },
  wire: { name: "SPT1 C9 socket wire, 12 in spacing", unit: "ft" },
  ext: { name: "SPT1 green extension cord", unit: "ft" },
  mini: { name: "5 mm mini lights, 100 lights, 33 ft", unit: "strand" },
} as const;
export type MaterialKey = keyof typeof MATERIALS;
export const MATERIAL_KEYS = Object.keys(MATERIALS) as MaterialKey[];

/** One line of a supplier order. `pieces` is in the material's unit (a 1000 ft roll is 1000 ft). */
export type OrderLine = {
  key: MaterialKey;
  description: string;
  qty: number;          // as written on the sheet (pieces or rolls)
  perQty: number;       // units in one qty (1, or 1000 for a 1000 ft roll)
  price: number;        // C&F price per qty
  landed: number;       // adjusted (landed) cost for the whole line
};
export type Order = { id: string; label: string; date?: string; discountPct?: number; lines: OrderLine[]; addedAt: number; addedBy?: string };

export type Settings = {
  bulbsPerFt: number;     // C9 bulbs per foot of roofline (12 in spacing = 1)
  clipsPerBulb: number;
  runFt: number;          // one male + one female plug per run of this many feet
  extFtPerJob: number;    // extension cord per job
  crewPct: number;        // crew pay as % of the sold price (install 15 + takedown 5)
  repeatNewPct: number;   // repeat customers reuse their bin; this % of the material is new, for breakage (chris: 5 to 10%)
  chargePerFt: number;    // what we charge per foot of roofline (quoting rule), for the price check
  chargePerStrand: number;
};
export const DEFAULT_SETTINGS: Settings = { bulbsPerFt: 1, clipsPerBulb: 1, runFt: 50, extFtPerJob: 50, crewPct: 20, repeatNewPct: 7.5, chargePerFt: 10, chargePerStrand: 35 };

export type Logged = { rooflineFt: number; c7Bulbs: number; miniStrands: number; stakeFt?: number; byName?: string; at?: number };
export type Sold = { amount: number; source: "jobber" | "owner"; at: number };

const ORDERS = "ldmv:costs:orders";
const SETTINGS = "ldmv:costs:settings";
const SOLD = "ldmv:costs:sold";

export const getOrders = async () => (await kvGet<Order[]>(ORDERS)) ?? [];
export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...((await kvGet<Partial<Settings>>(SETTINGS)) ?? {}) });
export const getSold = async () => (await kvGet<Record<string, Sold>>(SOLD)) ?? {};
export const saveOrders = (o: Order[]) => kvSet(ORDERS, o);
export const saveSettings = (s: Settings) => kvSet(SETTINGS, s);
export const setSold = (jobId: string, s: Sold | null) =>
  kvUpdate<Record<string, Sold>>(SOLD, {}, (all) => { if (s) all[jobId] = s; else delete all[jobId]; });

const num = (v: unknown) => { const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v); return Number.isFinite(n) ? n : 0; };

/** Accepts the cost sheet as JSON ({ label, discountPct, lines: [...] }) and checks every line. */
export function parseOrder(raw: any): Omit<Order, "id" | "addedAt" | "addedBy"> {
  const lines: OrderLine[] = [];
  for (const l of raw?.lines ?? []) {
    const key = String(l.key ?? "") as MaterialKey;
    if (!MATERIALS[key]) throw new Error(`Unknown material "${l.key}". Use one of: ${MATERIAL_KEYS.join(", ")}`);
    const line = { key, description: String(l.description ?? MATERIALS[key].name), qty: num(l.qty), perQty: num(l.perQty) || 1, price: num(l.price), landed: num(l.landed) };
    if (line.qty <= 0) throw new Error(`${line.description}: quantity missing`);
    if (!line.landed) line.landed = line.qty * line.price;
    lines.push(line);
  }
  if (!lines.length) throw new Error("The sheet has no lines");
  return { label: String(raw.label || "Supplier order"), date: raw.date ? String(raw.date) : undefined, discountPct: raw.discountPct != null ? num(raw.discountPct) : undefined, lines };
}

/** Landed cost per unit (bulb, clip, plug, foot, strand), averaged over every order by quantity. */
export function unitCosts(orders: Order[]) {
  const acc: Partial<Record<MaterialKey, { units: number; landed: number; cf: number }>> = {};
  for (const o of orders) for (const l of o.lines) {
    const a = (acc[l.key] ??= { units: 0, landed: 0, cf: 0 });
    a.units += l.qty * l.perQty; a.landed += l.landed; a.cf += l.qty * l.price;
  }
  const out: Partial<Record<MaterialKey, { perUnit: number; bought: number; landed: number; cf: number }>> = {};
  for (const k of MATERIAL_KEYS) { const a = acc[k]; if (a && a.units) out[k] = { perUnit: a.landed / a.units, bought: a.units, landed: a.landed, cf: a.cf }; }
  return out;
}
export type UnitCosts = ReturnType<typeof unitCosts>;

/** Units of each material a job uses, from what the crew logged. */
export function usage(m: Logged, s: Settings): Partial<Record<MaterialKey, number>> {
  const ft = m.rooflineFt || 0;
  const bulbs = Math.round(ft * s.bulbsPerFt);
  const runs = ft > 0 ? Math.max(1, Math.ceil(ft / s.runFt)) : 0;
  const anything = ft > 0 || m.c7Bulbs > 0 || m.miniStrands > 0;
  return {
    c9: bulbs, clip: Math.round((bulbs + (m.c7Bulbs || 0)) * s.clipsPerBulb), wire: ft,
    male: runs, female: runs, c7: m.c7Bulbs || 0, mini: m.miniStrands || 0, ext: anything ? s.extFtPerJob : 0,
  };
}

export function costOf(use: Partial<Record<MaterialKey, number>>, uc: UnitCosts) {
  let total = 0; const missing: MaterialKey[] = [];
  for (const [k, n] of Object.entries(use) as [MaterialKey, number][]) {
    if (!n) continue;
    const c = uc[k];
    if (!c) { missing.push(k); continue; }
    total += n * c.perUnit;
  }
  return { total, missing };
}

const toLogged = (m: MaterialRecord): Logged =>
  ({ rooflineFt: m.c9Feet || 0, c7Bulbs: m.c7Bulbs || 0, miniStrands: m.miniStrands || 0, stakeFt: m.stakeFeet || 0, byName: m.by, at: m.at });

/** Sold price for Jobber jobs we haven't priced yet, a few per call so a page load stays quick. */
export async function fetchSoldFromJobber(jobs: Job[], limit = 15) {
  if (!(await isConnected())) return 0;
  const sold = await getSold();
  // One sold price per Jobber job, even when the job has more than one install visit.
  const priced = new Set(jobs.filter((j) => sold[j.id]).map((j) => j.jobberJobId));
  const todo = jobs.filter((j) => j.jobberJobId && !priced.has(j.jobberJobId) && (priced.add(j.jobberJobId), true)).slice(0, limit);
  if (!todo.length) return 0;
  const sel = await buildSelection(gql, "Job", { total: true, amounts: { sel: { total: true, subtotal: true } } });
  if (!sel) return 0;
  let n = 0;
  for (const j of todo) {
    try {
      const d = await gql<{ job: any }>(`query LdmvJobTotal($id: EncodedId!) { job(id: $id) ${sel} }`, { id: j.jobberJobId });
      const amt = num(d.job?.total ?? d.job?.amounts?.subtotal ?? d.job?.amounts?.total);
      if (amt > 0) { await setSold(j.id, { amount: amt, source: "jobber", at: Date.now() }); n++; }
    } catch { break; } // rate-limited or schema change: try again next load
  }
  return n;
}

export type LedgerRow = {
  id: string; jobNumber?: number; title: string; client: string; start: string; kind: Job["kind"]; crew?: string;
  repeat?: boolean; logged: Logged | null; use: Partial<Record<MaterialKey, number>>; materials: number; fromBin: boolean;
  missing: MaterialKey[]; sold?: Sold; crewPay: number; expenses: number; left?: number; marginPct?: number;
};

export async function ledger(opts: { from?: string; to?: string; refreshSold?: boolean } = {}) {
  const [orders, settings] = await Promise.all([getOrders(), getSettings()]);
  const uc = unitCosts(orders);
  const inRange = (d: string) => (!opts.from || d >= opts.from) && (!opts.to || d < opts.to);
  const jobs = await getJobs();
  const mats = new Map((await listMaterials()).map((m) => [m.jobId, m]));
  const spent = await getAllExpenses(); // crews' out-of-pocket expenses (receipts) per visit
  // Every install visit and any visit with crew expenses, plus any counted job that has since dropped out of the synced window.
  const all: Job[] = Object.values(jobs).filter((j) => (j.kind === "install" || mats.has(j.id) || spent[j.id]?.items.length) && inRange(j.start));
  for (const m of mats.values()) if (!jobs[m.jobId] && inRange(m.date)) all.push({
    id: m.jobId, source: "jobber", jobberJobId: m.jobberJobId, jobberVisitId: m.jobberVisitId, jobNumber: m.jobNumber,
    title: m.jobNumber ? `Job #${m.jobNumber}` : "Job", client: "", address: "", start: m.date, kind: m.kind, crew: m.crew, assignedNames: [], updatedAt: m.at,
  });
  all.sort((a, b) => b.start.localeCompare(a.start));
  if (opts.refreshSold) await fetchSoldFromJobber(all.filter((j) => j.kind === "install"));
  const sold = await getSold();

  const rows: LedgerRow[] = await Promise.all(all.map(async (j) => {
    const m = mats.get(j.id);
    const logged = m ? toLogged(m) : null;
    const d = j.jobberJobId ? await kvGet<JobDetail>(`ldmv:jobdetail:${j.jobberJobId}`) : null;
    const repeat = d ? d.repeat : undefined;
    const use = logged ? usage(logged, settings) : {};
    const fromBin = !!repeat;
    const share = fromBin ? settings.repeatNewPct / 100 : 1;
    if (share !== 1) for (const k of Object.keys(use) as MaterialKey[]) use[k] = (use[k] ?? 0) * share;
    const { total, missing } = costOf(use, uc);
    const materials = total;
    const s = sold[j.id];
    const crewPay = s ? (s.amount * settings.crewPct) / 100 : 0;
    const expenses = expenseTotal(spent[j.id]);
    const left = s ? s.amount - materials - crewPay - expenses : undefined;
    return {
      id: j.id, jobNumber: j.jobNumber, title: j.title, client: j.client, start: j.start, kind: j.kind, crew: j.crew,
      repeat, logged, use, materials, fromBin, missing, sold: s, crewPay, expenses, left,
      marginPct: s && s.amount ? ((left ?? 0) / s.amount) * 100 : undefined,
    };
  }));

  // Stock: bought minus what jobs used (repeat jobs only their breakage share).
  const used: Partial<Record<MaterialKey, number>> = {};
  for (const r of rows) for (const [k, n] of Object.entries(r.use) as [MaterialKey, number][]) used[k] = (used[k] ?? 0) + n;
  const stock = MATERIAL_KEYS.filter((k) => uc[k] || used[k]).map((k) => {
    const bought = uc[k]?.bought ?? 0, u = used[k] ?? 0;
    return { key: k, name: MATERIALS[k].name, unit: MATERIALS[k].unit, bought, used: u, onHand: bought - u, value: (bought - u) * (uc[k]?.perUnit ?? 0) };
  });

  return { orders, settings, unitCosts: uc, rows, stock };
}
