// Light DMV's insurance map: policies, coverage gaps, lease and lender requirements, certificates.
// Policy numbers, premiums and document links live here, so an owner uploads insurance.json and it is
// kept in the database, never in the (public) code repo.
import { kvGet, kvSet } from "./store";

export type CoverageStatus = "covered" | "partial" | "gap" | "unknown";
export type PolicyStatus = "active" | "check" | "expired" | "missing";
export type Limit = { label: string; amount?: number; text?: string };
export type Doc = { title: string; url: string };

export type Policy = {
  id: string; kind: string; title: string; carrier: string | null; naic?: string;
  broker: { name: string; phone?: string; fax?: string; email?: string; address?: string } | null;
  policyNumber: string | null; status: PolicyStatus;
  effective: string | null; expires: string | null;
  premium: { annual: number; note?: string } | null;
  namedInsured?: string; location?: string; classification?: string;
  limits: Limit[]; deductibles: Limit[]; notes: string[]; sources: Doc[];
  drivers?: string[]; // auto policies: the people listed as drivers (first names are enough)
};
export type Risk = {
  id: string; risk: string; icon: string; status: CoverageStatus; policyIds: string[];
  detail: string; action: string | null;
};
export type Requirement = {
  who: string; source?: Doc;
  items: { text: string; met: "yes" | "no" | "pending" | "unknown"; due?: string }[];
};
export type InsuranceData = {
  generatedAt: string; sourcesNote?: string;
  company: { name: string; address: string; operations?: string };
  policies: Policy[];
  vehicles: { label: string; vinLast6?: string; note?: string; policyId?: string }[];
  coverage: Risk[];
  requirements: Requirement[];
  certificates: { title: string; holder: string; date: string; policyIds: string[]; url: string }[];
  coiRequest?: { to: string; phone?: string; policyId?: string };
  actions: { id: string; priority: "high" | "medium" | "low"; title: string; detail: string; due?: string }[];
};
export type InsuranceView = { data: InsuranceData | null; done: Record<string, string>; updatedAt: string | null };

const KEY = "ldmv:insurance";
const DONE_KEY = "ldmv:insurance:done";

export async function loadInsurance(): Promise<InsuranceView> {
  const [saved, done] = await Promise.all([
    kvGet<{ data: InsuranceData; updatedAt: string }>(KEY),
    kvGet<Record<string, string>>(DONE_KEY),
  ]);
  return { data: saved?.data ?? null, updatedAt: saved?.updatedAt ?? null, done: done ?? {} };
}

const arr = (v: unknown) => (Array.isArray(v) ? v : []);

export async function saveInsurance(raw: unknown): Promise<InsuranceView> {
  const x = raw as Partial<InsuranceData> & { kind?: string };
  if (!x || x.kind !== "ldmv-insurance" || !Array.isArray(x.policies) || !Array.isArray(x.coverage)) {
    throw new Error("That isn't the insurance file (insurance.json).");
  }
  const data: InsuranceData = {
    generatedAt: typeof x.generatedAt === "string" ? x.generatedAt : new Date().toISOString(),
    sourcesNote: x.sourcesNote,
    company: x.company ?? { name: "Light DMV, LLC", address: "" },
    policies: x.policies.filter((p) => p && typeof p.id === "string").map((p) => ({
      ...p, limits: arr(p.limits), deductibles: arr(p.deductibles), notes: arr(p.notes), sources: arr(p.sources),
    })),
    vehicles: arr(x.vehicles),
    coverage: x.coverage.filter((c) => c && typeof c.id === "string").map((c) => ({ ...c, policyIds: arr(c.policyIds) })),
    requirements: arr(x.requirements).map((r: Requirement) => ({ ...r, items: arr(r.items) })),
    certificates: arr(x.certificates),
    coiRequest: x.coiRequest,
    actions: arr(x.actions),
  };
  const updatedAt = new Date().toISOString();
  await kvSet(KEY, { data, updatedAt });
  return { data, updatedAt, done: (await kvGet<Record<string, string>>(DONE_KEY)) ?? {} };
}

/** Owners tick off to-dos; the tick survives a re-upload because it is keyed by the to-do id. */
export async function setDone(id: string, on: boolean, by: string): Promise<Record<string, string>> {
  const done = (await kvGet<Record<string, string>>(DONE_KEY)) ?? {};
  if (on) done[id] = `${by} · ${new Date().toISOString()}`;
  else delete done[id];
  await kvSet(DONE_KEY, done);
  return done;
}

/* ---------- 1099 subcontractors ----------
   Each sub needs: a signed hold harmless, their own workers' comp + employer's liability, and a general liability
   certificate with limits at least ours, waiver of subrogation, and Light DMV as additional insured. */
export type SubDoc = { onFile: boolean; date?: string; expires?: string; carrier?: string; url?: string };
export type SubCoi = SubDoc & { eachOccurrence?: number; aggregate?: number; waiver?: boolean; additionalInsured?: boolean };
export type Sub = {
  id: string; name: string; company?: string; phone?: string; email?: string; active: boolean; notes?: string;
  holdHarmless: SubDoc; workersComp: SubDoc; gl: SubCoi; updatedAt: string;
};
const SUBS_KEY = "ldmv:insurance:subs";

export async function loadSubs(): Promise<Sub[]> {
  return (await kvGet<Sub[]>(SUBS_KEY)) ?? [];
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);
const num = (v: unknown) => (v === "" || v == null || !isFinite(Number(v)) ? undefined : Math.max(0, Number(v)));
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const doc = (v: any): SubDoc => ({ onFile: !!v?.onFile, date: date(v?.date), expires: date(v?.expires), carrier: str(v?.carrier), url: str(v?.url) });

export async function saveSub(raw: any): Promise<Sub[]> {
  const name = str(raw?.name);
  if (!name) throw new Error("Give the subcontractor a name.");
  const sub: Sub = {
    id: str(raw.id) ?? Math.random().toString(36).slice(2, 10),
    name, company: str(raw.company), phone: str(raw.phone), email: str(raw.email), notes: str(raw.notes),
    active: raw.active !== false,
    holdHarmless: doc(raw.holdHarmless),
    workersComp: doc(raw.workersComp),
    gl: { ...doc(raw.gl), eachOccurrence: num(raw.gl?.eachOccurrence), aggregate: num(raw.gl?.aggregate), waiver: !!raw.gl?.waiver, additionalInsured: !!raw.gl?.additionalInsured },
    updatedAt: new Date().toISOString(),
  };
  const subs = await loadSubs();
  const i = subs.findIndex((s) => s.id === sub.id);
  if (i >= 0) subs[i] = sub; else subs.push(sub);
  await kvSet(SUBS_KEY, subs);
  return subs;
}

export async function deleteSub(id: string): Promise<Sub[]> {
  const subs = (await loadSubs()).filter((s) => s.id !== id);
  await kvSet(SUBS_KEY, subs);
  return subs;
}

/* ---------- team classification ----------
   Owners mark each person as owner, W-2 employee or 1099 sub; the tab works out who is covered by what. */
export type WorkerClass = "owner" | "w2" | "1099" | "unset";
const TEAM_KEY = "ldmv:insurance:team";
const CLASSES: WorkerClass[] = ["owner", "w2", "1099", "unset"];

export async function loadTeam(): Promise<Record<string, WorkerClass>> {
  return (await kvGet<Record<string, WorkerClass>>(TEAM_KEY)) ?? {};
}

export async function setClass(userId: string, cls: unknown): Promise<Record<string, WorkerClass>> {
  if (!CLASSES.includes(cls as WorkerClass)) throw new Error("Pick owner, W-2 or 1099.");
  const team = await loadTeam();
  team[userId] = cls as WorkerClass;
  await kvSet(TEAM_KEY, team);
  return team;
}
