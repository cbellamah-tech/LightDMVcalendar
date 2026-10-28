import { kvGet, kvSet } from "./store";
import { etDay } from "./marketing";
import { getGhlSnap, ghlConfigured, loc, refreshGhl, type GhlOpp } from "./ghl";

/* chris (2026-10-28): a weekly reminder to clean up the GoHighLevel master pipeline, and to clear out the
   "Waiting on info" and "Follow up" stages in every pipeline. Read-only: nothing in GoHighLevel is changed. */

const DONE = "ldmv:ghl:cleanup:done";
/** A deal in the master pipeline counts as stuck once it has sat in one stage this long. */
export const MASTER_STALE_DAYS = 7;

const isMaster = (pipeline: string) => /master/i.test(pipeline);
const stuckStage = (stage: string) => /wait.*info|need.*info|info.*need/i.test(stage) ? "Waiting on info" : /follow/i.test(stage) ? "Follow up" : null;

export type CleanupDeal = { id: string; name: string; contactId: string; days: number; value: number };
export type CleanupGroup = { kind: "master" | "Waiting on info" | "Follow up"; pipeline: string; stage: string; deals: CleanupDeal[] };
export type CleanupDone = { week: string; by: string; at: number };
export type Cleanup = {
  configured: boolean; at: number | null; errors: string[]; week: string; done: CleanupDone | null;
  masterFound: boolean; total: number; groups: CleanupGroup[];
  /** GoHighLevel's contact page, the contact id goes on the end. */
  contactUrl: string;
};

/** Monday of this week (Eastern), as YYYY-MM-DD: the week a cleanup belongs to. */
export function cleanupWeek(now = Date.now()): string {
  const d = new Date(`${etDay(now)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function cleanupGroups(opps: GhlOpp[], now = Date.now()): CleanupGroup[] {
  const groups = new Map<string, CleanupGroup>();
  for (const o of opps) {
    if (o.status !== "open") continue;
    const days = Math.max(0, Math.floor((now - (o.stageAt ?? (Date.parse(`${o.day}T12:00:00Z`) || now))) / 86400_000));
    const stuck = stuckStage(o.stage);
    // Waiting on info and Follow up get cleared out in every pipeline, master included; the rest of master only once it's gone stale.
    const kind = stuck ?? (isMaster(o.pipeline) && days >= MASTER_STALE_DAYS ? "master" : null);
    if (!kind) continue;
    const key = `${kind}|${o.pipeline}|${o.stage}`;
    const g = groups.get(key) ?? { kind, pipeline: o.pipeline, stage: o.stage, deals: [] };
    g.deals.push({ id: o.id, name: o.name || "Unnamed", contactId: o.contactId, days, value: o.value });
    groups.set(key, g);
  }
  const order = { master: 0, "Waiting on info": 1, "Follow up": 2 };
  return [...groups.values()]
    .map((g) => ({ ...g, deals: g.deals.sort((a, b) => b.days - a.days) }))
    .sort((a, b) => order[a.kind] - order[b.kind] || b.deals.length - a.deals.length || a.pipeline.localeCompare(b.pipeline));
}

/** The list, from the GoHighLevel copy the marketing page keeps (refreshed when it's over a day old, or now when asked). */
export async function pipelineCleanup(fresh = false): Promise<Cleanup> {
  const week = cleanupWeek();
  const configured = ghlConfigured();
  const errors: string[] = [];
  let snap = await getGhlSnap();
  if (configured) snap = await refreshGhl(fresh ? 60_000 : 86400_000).catch((e) => { errors.push(e.message); return snap; });
  const done = await kvGet<CleanupDone>(DONE);
  const groups = cleanupGroups(snap?.opps ?? []);
  return {
    configured, at: snap?.at ?? null, errors: [...errors, ...(snap?.errors ?? [])], week,
    done: done?.week === week ? done : null,
    masterFound: (snap?.opps ?? []).some((o) => isMaster(o.pipeline)),
    total: groups.reduce((t, g) => t + g.deals.length, 0), groups,
    contactUrl: configured ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(loc())}/contacts/detail/` : "",
  };
}

export async function markCleanupDone(by: string, undo = false) {
  await kvSet<CleanupDone | null>(DONE, undo ? null : { week: cleanupWeek(), by, at: Date.now() });
}
