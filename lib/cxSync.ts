import { randomBytes, timingSafeEqual } from "crypto";
import { kvGet, kvSet } from "./store";
import { later } from "./background";

/* Keeps the customer database current by itself. A pass reads Jobber (clients, quotes, jobs) and GoHighLevel
   (contacts, conversations, notes) a page at a time. The first pass reads everything; later passes ask only for what
   changed since the last one (with a full re-read once a week, to catch anything an update filter missed).
   One run works for about 40 seconds, then hands the rest to a fresh run of itself (/api/customers/run), so a long
   history never hits the function time limit. Runs start when an owner opens Customers, when anyone opens Jobs,
   and from the daily cron. */

type Cur = { cursor: string | null; done: boolean; count: number };
export type CxState = {
  passStartedAt?: number;        // the pass in progress (or the last one)
  passDoneAt?: number;           // when the last pass finished
  goodStart?: number;            // start of the last pass that finished without errors (the next one reads changes since it)
  fullAt?: number;               // when the last full read finished
  since?: string;                // this pass asks for changes after this (none = full read)
  jobber: Record<"Client" | "Quote" | "Job", Cur>;
  ghl: Record<"contacts" | "convs", Cur>;
  queues?: { messages: number; notes: number };
  builtAt?: number; customers?: number;
  errors: { jobber?: string; ghl?: string };
  jobberTextFields?: string[];   // client fields Jobber's API keeps text messages in (none so far)
  jobberNoFilter?: boolean;
  jobberFullAt?: number;         // last time every Jobber record was read (then, without the filter, every 6 hours at most)      // Jobber refused the "changed since" filter: every pass reads everything
};

const STATE = "ldmv:cx:state";
const LOCK = "ldmv:cx:lock";
const RUNKEY = "ldmv:cx:runkey";
const WEEK = 7 * 86400_000;
const BUDGET = 40_000;

const fresh = (): Cur => ({ cursor: null, done: false, count: 0 });
const blank = (): CxState => ({ jobber: { Client: fresh(), Quote: fresh(), Job: fresh() }, ghl: { contacts: fresh(), convs: fresh() }, errors: {} });
export const getCxState = async () => (await kvGet<CxState>(STATE)) ?? blank();
const passOpen = (s: CxState) => !!s.passStartedAt && (!s.passDoneAt || s.passDoneAt < s.passStartedAt);

/** Run for one budget. Returns whether there is more to do right away. */
export async function runPass(budgetMs = BUDGET): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  const s = await getCxState();
  if (!passOpen(s)) {
    // A new pass: changes since the last good pass began (an hour of overlap), or everything once a week.
    const full = !s.fullAt || !s.goodStart || Date.now() - s.fullAt > WEEK;
    Object.assign(s, { ...blank(), fullAt: s.fullAt, goodStart: s.goodStart, builtAt: s.builtAt, customers: s.customers, jobberNoFilter: s.jobberNoFilter, jobberFullAt: s.jobberFullAt, jobberTextFields: s.jobberTextFields, passDoneAt: s.passDoneAt });
    s.since = full ? undefined : new Date(s.goodStart! - 3600_000).toISOString();
    s.passStartedAt = Date.now();
  }
  s.errors = {};
  await kvSet(STATE, s);
  const failed = (await Promise.all([jobberSteps(s, deadline), ghlSteps(s, deadline)])).some(Boolean);

  const { queueSizes } = await import("./cxGhl");
  s.queues = await queueSizes().catch(() => s.queues);
  const finished = Object.values(s.jobber).every((c) => c.done) && Object.values(s.ghl).every((c) => c.done) && !s.queues?.messages && !s.queues?.notes;
  // A pass stuck on an error (a missing GoHighLevel scope, say) closes after 3 hours so the rest keeps refreshing.
  const stuck = !finished && Date.now() - (s.passStartedAt ?? 0) > 3 * 3600_000;
  if (finished || stuck) s.passDoneAt = Date.now();
  if (finished && !failed) {
    s.goodStart = s.passStartedAt;
    if (!s.since) s.fullAt = s.passStartedAt;
  }
  // The list is rebuilt when the pass ends, and every few minutes during a long first read so customers show up as they arrive.
  if (finished || !s.builtAt || Date.now() - s.builtAt > 4 * 60_000) {
    const { buildCustomers } = await import("./customers");
    s.customers = await buildCustomers();
    s.builtAt = Date.now();
  }
  await kvSet(STATE, s);
  // Then the message summaries of customers whose records just changed, with what's left of this run.
  if (finished) {
    const { summarizeChanged } = await import("./cxSummary");
    await summarizeChanged(deadline).catch((e) => console.error("[cx summaries]", e?.message ?? e));
  }
  // On an error, stop here: the next run (opening Customers or Jobs, or the daily cron) picks up where this one stopped.
  return !finished && !stuck && !failed;
}

/** Each returns true when it hit an error. */
async function jobberSteps(s: CxState, deadline: number): Promise<boolean> {
  const { jobberConfigured, isConnected } = await import("./jobber");
  if (!jobberConfigured() || !(await isConnected())) {
    for (const c of Object.values(s.jobber)) c.done = true;
    s.errors.jobber = "Jobber isn't connected.";
    return false;
  }
  // Without the "changed since" filter each read is the whole history, so it runs every 6 hours, not every pass.
  if (s.since && s.jobberNoFilter && s.jobberFullAt && Date.now() - s.jobberFullAt < 6 * 3600_000) {
    for (const c of Object.values(s.jobber)) c.done = true;
    return false;
  }
  const { jobberPage, jobberTextFields } = await import("./cxJobber");
  s.jobberTextFields = await jobberTextFields().catch(() => s.jobberTextFields ?? []);
  for (const kind of ["Client", "Quote", "Job"] as const) {
    const c = s.jobber[kind];
    while (!c.done && Date.now() < deadline - 8_000) {
      try {
        const r = await jobberPage(kind, c.cursor, s.jobberNoFilter ? undefined : s.since);
        c.count += r.count; c.cursor = r.next; c.done = !r.next;
      } catch (e: any) {
        if (s.since && !s.jobberNoFilter && /filter|updatedAt|argument|input/i.test(e.message)) {
          // Jobber doesn't take the "changed since" filter here: read everything from now on.
          s.jobberNoFilter = true;
          continue;
        }
        s.errors.jobber = e.message;
        return true;
      }
      await kvSet(STATE, s);
    }
  }
  if (Object.values(s.jobber).every((c) => c.done) && (!s.since || s.jobberNoFilter)) s.jobberFullAt = s.passStartedAt;
  return false;
}

async function ghlSteps(s: CxState, deadline: number): Promise<boolean> {
  const { ghlConfigured } = await import("./ghl");
  if (!ghlConfigured()) {
    for (const c of Object.values(s.ghl)) c.done = true;
    s.errors.ghl = "GoHighLevel isn't connected.";
    return false;
  }
  const g = await import("./cxGhl");
  try {
    for (const [name, page] of [["contacts", g.ghlContactsPage], ["convs", g.ghlConversationsPage]] as const) {
      const c = s.ghl[name];
      while (!c.done && Date.now() < deadline - 8_000) {
        const r = await page(c.cursor, s.since);
        c.count += r.count; c.cursor = r.next; c.done = !r.next;
        await kvSet(STATE, s);
      }
    }
    if (Date.now() < deadline - 5_000) await g.ghlDrainMessages(deadline - 5_000);
    if (Date.now() < deadline - 5_000) await g.ghlDrainNotes(deadline - 5_000);
  } catch (e: any) {
    s.errors.ghl = g.ghlScopeHint(e);
    return true;
  }
  return false;
}

/* ---------- Starting and chaining runs ---------- */

async function runKey() {
  let k = await kvGet<string>(RUNKEY);
  if (!k) { k = randomBytes(24).toString("hex"); await kvSet(RUNKEY, k); }
  return k;
}
export async function checkRunKey(header: string | null) {
  const k = await kvGet<string>(RUNKEY);
  const got = header?.replace(/^Bearer\s+/i, "").trim();
  return !!k && !!got && got.length === k.length && timingSafeEqual(Buffer.from(got), Buffer.from(k));
}

/** Run one budget in the background (unless a run is going), then hand off to a fresh run if there's more. */
export async function runInBackground(origin: string, force = false) {
  const lock = await kvGet<number>(LOCK);
  if (!force && lock && Date.now() - lock < 70_000) return false;
  await kvSet(LOCK, Date.now());
  later("customers", async () => {
    let more = false;
    try { more = await runPass(); } finally { await kvSet(LOCK, 0); }
    if (more) await chain(origin);
  });
  return true;
}

async function chain(origin: string) {
  const { stableOrigin } = await import("./jobber");
  await fetch(`${stableOrigin(origin)}/api/customers/run`, {
    method: "POST", headers: { authorization: `Bearer ${await runKey()}` }, signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/** Start a pass when the last one is older than `everyMs` (or finish one that stopped part way). */
export async function kickCustomers(origin: string, everyMs = 30 * 60_000) {
  const s = await getCxState();
  if (passOpen(s) || !s.passDoneAt || Date.now() - s.passDoneAt > everyMs) return runInBackground(origin);
  return false;
}
