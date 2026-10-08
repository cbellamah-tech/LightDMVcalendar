import { kvGet, kvSet, kvUpdate } from "./store";
import { JobKind, SOPS } from "./sops";
import type { Session } from "./session";
import type { User } from "./users";

export type Job = {
  id: string;               // "jv_<jobber visit id>" or "sample-..."
  source: "jobber" | "sample";
  jobberVisitId?: string;
  jobberJobId?: string;
  jobNumber?: number;
  title: string;
  client: string;
  address: string;
  start: string;            // ISO
  end?: string;
  kind: JobKind;
  crew?: string;            // crew1 / crew2, derived from Jobber assigned users
  assignedNames: string[];
  request?: string;         // fixes: what the customer asked for (the Jobber visit instructions)
  requestedAt?: string;     // fixes: when the service visit was created in Jobber
  doneInJobber?: boolean;   // the visit is marked complete in Jobber
  updatedAt: number;
};

export type CheckEntry = { done: boolean; by?: string; byName?: string; at?: number; photos: string[]; note?: string; counts?: Record<string, number>;
  parts?: Record<string, string>;   // photo url -> part of the job it shows (per-part photos)
  photoBy?: Record<string, string>; // photo url -> who took it
};
/** arrivedAt: the arrival photo (or the first box touched when the checklist has none); completedAt is when the job was marked done. */
export type Checklist = { jobId: string; kind: JobKind; items: Record<string, CheckEntry>; arrivedAt?: number; completedAt?: number; completedBy?: string; rev: number };

const JOBS = "ldmv:jobs";
const checkKey = (jobId: string) => `ldmv:check:${jobId}`;

/** Fixes (service calls) are the Jobber visits or jobs whose title starts with "Service". */
export const isFixTitle = (title?: string) => /^\s*service\b/i.test(title || "");

/** Takedown if the title says so, otherwise install (Jan to Mar defaults to takedown). Fixes are decided by the caller. */
export function kindFor(title: string, start: string): JobKind {
  if (/take ?down|removal|remove|teardown/i.test(title)) return "takedown";
  if (/install/i.test(title)) return "install";
  const m = new Date(start).getMonth();
  return m <= 2 ? "takedown" : "install";
}

/** Which crew a job belongs to, from the names Jobber has assigned. */
export function crewFor(names: string[], users: User[]): string | undefined {
  for (const n of names) {
    const u = users.find((x) => x.crew && [x.jobberName, x.name].some((v) => v && v.toLowerCase() === n.toLowerCase()));
    if (u) return u.crew;
  }
  for (const n of names) {
    const u = users.find((x) => x.crew && n.toLowerCase().includes((x.jobberName || x.name).toLowerCase()));
    if (u) return u.crew;
  }
  return undefined;
}

export const getJobs = async () => (await kvGet<Record<string, Job>>(JOBS)) ?? {};

export async function upsertJobs(jobs: Job[], removeSourceIn?: { source: Job["source"]; from: string; to: string }) {
  await kvUpdate<Record<string, Job>>(JOBS, {}, (all) => {
    if (removeSourceIn) {
      // Drop visits in the synced window that Jobber no longer has (cancelled / moved out).
      const keep = new Set(jobs.map((j) => j.id));
      for (const [id, j] of Object.entries(all)) {
        if (j.source === removeSourceIn.source && j.start >= removeSourceIn.from && j.start < removeSourceIn.to && !keep.has(id)) delete all[id];
      }
    }
    for (const j of jobs) all[j.id] = j;
  });
}

/** Drop fixes dated before the synced window unless Jobber still lists them as late. */
export async function pruneOldFixes(before: string, stillLate: Set<string>) {
  await kvUpdate<Record<string, Job>>(JOBS, {}, (all) => {
    for (const [id, j] of Object.entries(all)) if (j.kind === "fix" && j.source === "jobber" && j.start < before && !stillLate.has(id)) delete all[id];
  });
}

export async function clearSampleJobs() {
  await kvUpdate<Record<string, Job>>(JOBS, {}, (all) => {
    for (const [id, j] of Object.entries(all)) if (j.source === "sample") delete all[id];
  });
}

export const jobVisibleTo = (j: Job, s: Session, me?: User) =>
  s.role === "owner" || s.role === "manager" || (!!s.crew && j.crew === s.crew) ||
  j.assignedNames.some((n) => [me?.jobberName, me?.name].some((v) => v && v.toLowerCase() === n.toLowerCase()));

export async function getChecklist(job: Job): Promise<Checklist> {
  const c = await kvGet<Checklist>(checkKey(job.id));
  if (c && c.kind === job.kind) return c;
  return { jobId: job.id, kind: job.kind, items: {}, rev: 0 };
}

export async function saveChecklist(c: Checklist) {
  await kvSet(checkKey(c.jobId), c);
}

export function checklistProgress(c: Checklist) {
  const items = SOPS[c.kind].items;
  const done = items.filter((i) => c.items[i.id]?.done).length;
  const reqLeft = items.filter((i) => i.required && !c.items[i.id]?.done);
  return { done, total: items.length, requiredLeft: reqLeft.map((i) => i.id) };
}

/** Sample jobs so crews can try the checklist before Jobber is connected. */
export function sampleJobs(): Job[] {
  const day = (offset: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const mk = (n: number, offset: number, hour: number, crew: string, lead: string, title: string, client: string, address: string): Job => ({
    id: `sample-${n}`, source: "sample", title, client, address, start: day(offset, hour), end: day(offset, hour + 3),
    kind: kindFor(title, day(offset, hour)), crew, assignedNames: [lead], updatedAt: Date.now(),
  });
  return [
    mk(1, 0, 9, "crew1", "Gary", "Holiday light install - roofline + 2 trees", "Sample: Johnson", "7401 Wisconsin Ave, Bethesda, MD"),
    mk(2, 0, 13, "crew1", "Gary", "Holiday light install - roofline + wreath", "Sample: Patel", "1200 N Glebe Rd, Arlington, VA"),
    mk(3, 0, 10, "crew2", "Sayed", "Holiday light install - full house", "Sample: Nguyen", "11800 Sunrise Valley Dr, Reston, VA"),
    mk(4, 1, 9, "crew2", "Sayed", "Holiday light install - bushes + columns", "Sample: Williams", "15 E Montgomery Ave, Rockville, MD"),
    mk(5, 1, 14, "crew1", "Gary", "Takedown - roofline + trees", "Sample: Garcia", "6600 Arlington Blvd, Falls Church, VA"),
  ];
}

export async function ensureSampleJobs() {
  const all = await getJobs();
  if (Object.keys(all).length) return;
  if (await kvGet("ldmv:jobber:tokens")) return;
  await upsertJobs(sampleJobs());
}

// ---------- materials used (read later by the inventory ledger sync) ----------

export type MaterialRecord = {
  jobId: string; jobberJobId?: string; jobberVisitId?: string; jobNumber?: number; kind: JobKind; date: string; crew?: string;
  c9Feet: number; c7Bulbs: number; miniStrands: number; stakeFeet?: number; by: string; at: number;
};
const MATERIALS = "ldmv:materials";

export async function recordMaterials(job: Job, counts: Record<string, number>, by: string) {
  const r: MaterialRecord = {
    jobId: job.id, jobberJobId: job.jobberJobId, jobberVisitId: job.jobberVisitId, jobNumber: job.jobNumber, kind: job.kind, date: job.start, crew: job.crew,
    c9Feet: counts.c9Feet ?? 0, c7Bulbs: counts.c7Bulbs ?? 0, miniStrands: counts.miniStrands ?? 0, stakeFeet: counts.stakeFeet ?? 0, by, at: Date.now(),
  };
  await kvUpdate<Record<string, MaterialRecord>>(MATERIALS, {}, (all) => { all[job.id] = r; return all; });
}

export const listMaterials = async () => Object.values((await kvGet<Record<string, MaterialRecord>>(MATERIALS)) ?? {}).sort((a, b) => a.date.localeCompare(b.date));
