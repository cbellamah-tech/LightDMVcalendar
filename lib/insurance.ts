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
