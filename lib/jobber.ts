import { kvDel, kvGet, kvSet } from "./store";
import { clearSampleJobs, crewFor, isFixTitle, Job, kindFor, pruneOldFixes, upsertJobs } from "./jobs";
import { listUsers } from "./users";

/* Jobber GraphQL API with OAuth (authorization code flow).
   Env: JOBBER_CLIENT_ID, JOBBER_CLIENT_SECRET, optional JOBBER_API_VERSION.
   Redirect URL to register in the Jobber Developer Center: <your site>/api/jobber/callback */

const AUTH_URL = "https://api.getjobber.com/api/oauth/authorize";
const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const GQL_URL = "https://api.getjobber.com/api/graphql";
const VERSION = process.env.JOBBER_API_VERSION || "2025-04-16";

const TOKENS = "ldmv:jobber:tokens";
const STATUS = "ldmv:jobber:status";

type Tokens = { access_token: string; refresh_token: string; expires_at: number };
export type SyncStatus = { lastSyncAt?: number; lastError?: string; lastCount?: number; connectedAt?: number };

export const jobberConfigured = () => !!process.env.JOBBER_CLIENT_ID && !!process.env.JOBBER_CLIENT_SECRET;
/** The one address Jobber knows about. Every Vercel deployment also has its own unique URL,
 *  so use the branch URL on previews and the main domain in production, never the request's host. */
export function stableOrigin(origin: string) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_BRANCH_URL;
  return host ? `https://${host}` : origin;
}
export const redirectUri = (origin: string) => `${stableOrigin(origin)}/api/jobber/callback`;

export function authorizeUrl(origin: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.JOBBER_CLIENT_ID || "");
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.JOBBER_CLIENT_ID || "",
      client_secret: process.env.JOBBER_CLIENT_SECRET || "",
      ...params,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Jobber token request failed (${res.status}): ${j.error_description || j.error || "no token"}`);
  // Access tokens last 60 minutes; refresh a few minutes early.
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + 55 * 60_000 };
}

export async function exchangeCode(code: string, origin: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  await kvSet(TOKENS, t);
  await kvSet<SyncStatus>(STATUS, { ...(await getStatus()), connectedAt: Date.now(), lastError: undefined });
}

async function accessToken(): Promise<string> {
  const t = await kvGet<Tokens>(TOKENS);
  if (!t) throw new Error("Jobber is not connected.");
  if (t.expires_at > Date.now()) return t.access_token;
  // Jobber may rotate refresh tokens, so always store the new one.
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  await kvSet(TOKENS, { ...fresh, refresh_token: fresh.refresh_token || t.refresh_token });
  return fresh.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jobber meters queries by cost and answers "Throttled" when the bucket is low; wait for it to refill and retry. */
export async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await gqlOnce<T>(query, variables);
    } catch (e: any) {
      if (attempt >= 4 || !/throttl/i.test(e.message)) throw e;
      await sleep(e.waitMs ?? 2000 * (attempt + 1));
    }
  }
}

async function gqlOnce<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await accessToken()}`,
      "X-JOBBER-GRAPHQL-VERSION": VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.errors?.length) {
    const err: any = new Error(`Jobber API error (${res.status}): ${j.errors?.map((e: any) => e.message).join("; ") || j.message || "unknown"}`);
    // Wait long enough for the bucket to refill to this query's cost.
    const c = j.extensions?.cost;
    const t = c?.throttleStatus;
    if (t?.restoreRate && c?.requestedQueryCost) err.waitMs = Math.min(15000, Math.max(1000, ((c.requestedQueryCost - t.currentlyAvailable) / t.restoreRate) * 1000 + 500));
    throw err;
  }
  return j.data as T;
}

export const isConnected = async () => !!(await kvGet(TOKENS));
export const getStatus = async () => (await kvGet<SyncStatus>(STATUS)) ?? {};
export async function disconnect() {
  await kvDel(TOKENS);
}

// Scheduled visits in a date window, with who is assigned and where.
// If Jobber renames a field, the error shows on the Jobber settings page; adjust it here.
const VISITS_QUERY = `
query LdmvVisits($after: ISO8601DateTime!, $before: ISO8601DateTime!, $cursor: String) {
  visits(first: 25, after: $cursor, filter: { startAt: { after: $after, before: $before } }) {
    nodes {
      id
      title
      startAt
      endAt
      createdAt
      instructions
      isComplete
      assignedUsers(first: 10) { nodes { id name { full } } }
      job {
        id
        jobNumber
        title
        client { name }
        property { address { street city province postalCode } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Visits Jobber marks late (past their date, not completed). Only the fixes are kept from these, so a
// service call that was missed stays on the schedule until someone completes it.
const LATE_VISITS_QUERY = VISITS_QUERY
  .replace("query LdmvVisits($after: ISO8601DateTime!, $before: ISO8601DateTime!, $cursor: String)", "query LdmvLateVisits($cursor: String)")
  .replace("filter: { startAt: { after: $after, before: $before } }", "filter: { status: LATE }");

type VisitNode = {
  id: string; title?: string; startAt: string; endAt?: string; createdAt?: string; instructions?: string | null; isComplete?: boolean;
  assignedUsers?: { nodes: { id: string; name: { full: string } }[] };
  job?: { id: string; jobNumber?: number; title?: string; client?: { name?: string };
    property?: { address?: { street?: string; city?: string; province?: string; postalCode?: string } } };
};

/** Pull visits from 2 days ago to 21 days ahead into the app's job list. */
export async function syncJobber(detailLimit = 25): Promise<number> {
  const from = new Date(Date.now() - 2 * 86400_000);
  const to = new Date(Date.now() + 21 * 86400_000);
  try {
    const users = await listUsers();
    const nodes: VisitNode[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 40; page++) {
      const d: { visits: { nodes: VisitNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
        await gql(VISITS_QUERY, { after: from.toISOString(), before: to.toISOString(), cursor });
      nodes.push(...d.visits.nodes);
      if (!d.visits.pageInfo.hasNextPage) break;
      cursor = d.visits.pageInfo.endCursor;
    }
    // Late fixes from before the window. If Jobber refuses the filter, the sync still runs without them.
    let late: VisitNode[] | null = [];
    try {
      cursor = null;
      for (let page = 0; page < 10; page++) {
        const d: { visits: { nodes: VisitNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } = await gql(LATE_VISITS_QUERY, { cursor });
        late.push(...d.visits.nodes.filter((v) => isFixTitle(v.title) || isFixTitle(v.job?.title)));
        if (!d.visits.pageInfo.hasNextPage) break;
        cursor = d.visits.pageInfo.endCursor;
      }
    } catch {
      late = null;
    }
    const seen = new Set(nodes.map((v) => v.id));
    for (const v of late ?? []) if (!seen.has(v.id)) { nodes.push(v); seen.add(v.id); }
    const jobs: Job[] = nodes.map((v) => {
      const names = v.assignedUsers?.nodes.map((u) => u.name.full) ?? [];
      const a = v.job?.property?.address;
      const title = v.title || v.job?.title || "Job";
      const fix = isFixTitle(v.title) || isFixTitle(v.job?.title);
      return {
        id: `jv_${v.id}`,
        source: "jobber",
        jobberVisitId: v.id,
        jobberJobId: v.job?.id,
        jobNumber: v.job?.jobNumber,
        title,
        client: v.job?.client?.name || "",
        address: [a?.street, a?.city, a?.province, a?.postalCode].filter(Boolean).join(", "),
        start: v.startAt,
        end: v.endAt,
        kind: fix ? "fix" : kindFor(`${title} ${v.job?.title || ""}`, v.startAt),
        crew: crewFor(names, users),
        assignedNames: names,
        ...(fix ? {
          request: (v.instructions || title.replace(/^\s*service\s*[-—–:]*\s*/i, "")).trim().slice(0, 500),
          requestedAt: v.createdAt,
        } : {}),
        doneInJobber: !!v.isComplete,
        updatedAt: Date.now(),
      };
    });
    await clearSampleJobs();
    await upsertJobs(jobs, { source: "jobber", from: from.toISOString(), to: to.toISOString() });
    // Fixes from before the window that are no longer late were completed (or deleted) in Jobber.
    if (late) await pruneOldFixes(from.toISOString(), new Set(late.map((v) => `jv_${v.id}`)));
    // Every fix goes to the Service Requested Sheet once. Never let the sheet stop the sync.
    const { logFixesToSheet } = await import("./serviceSheet");
    await logFixesToSheet(jobs.filter((j) => j.kind === "fix")).catch(() => {});
    await kvSet<SyncStatus>(STATUS, { ...(await getStatus()), lastSyncAt: Date.now(), lastCount: jobs.length, lastError: undefined });
    // Notes, line items and client history for each job, a batch at a time (oldest first).
    const { refreshStaleDetails } = await import("./jobDetails");
    // Bin lists and takedown / install photos straight from Drive first, so each job's photos match on this pass.
    const { syncDriveIndex } = await import("./driveSync");
    await syncDriveIndex().catch(() => {});
    await refreshStaleDetails(jobs.map((j) => j.jobberJobId!).filter(Boolean), detailLimit).catch(() => {});
    return jobs.length;
  } catch (e: any) {
    await kvSet<SyncStatus>(STATUS, { ...(await getStatus()), lastError: e.message });
    throw e;
  }
}

/** Sync at most every 5 minutes when someone opens the jobs list. */
export async function syncIfStale() {
  if (!jobberConfigured() || !(await isConnected())) return;
  const s = await getStatus();
  if (s.lastSyncAt && Date.now() - s.lastSyncAt < 5 * 60_000) return;
  await syncJobber(4).catch(() => {});
}

// Quotes with line items, one page per call so a long history never hits the function time limit.
const QUOTES_QUERY = `
query LdmvQuotes($cursor: String) {
  quotes(first: 10, after: $cursor) {
    nodes {
      id
      quoteNumber
      quoteStatus
      title
      createdAt
      updatedAt
      client { name }
      property { address { street city province postalCode } }
      amounts { subtotal total }
      lineItems(first: 50) { nodes { name description quantity unitPrice totalPrice } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

type QuoteNode = {
  id: string; quoteNumber?: string | number; quoteStatus?: string; title?: string; createdAt?: string; updatedAt?: string;
  client?: { name?: string };
  property?: { address?: { street?: string; city?: string; province?: string; postalCode?: string } };
  amounts?: { subtotal?: number; total?: number };
  lineItems?: { nodes: { name?: string; description?: string; quantity?: number; unitPrice?: number; totalPrice?: number }[] };
};

export type QuoteRow = Record<string, string | number>;

export async function quotesPage(cursor: string | null): Promise<{ rows: QuoteRow[]; quotes: number; next: string | null }> {
  const d: { quotes: { nodes: QuoteNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
    await gql(QUOTES_QUERY, { cursor });
  const rows: QuoteRow[] = [];
  for (const q of d.quotes.nodes) {
    const a = q.property?.address;
    const base = {
      quote_number: q.quoteNumber ?? "",
      status: q.quoteStatus ?? "",
      title: q.title ?? "",
      client: q.client?.name ?? "",
      property_address: [a?.street, a?.city, a?.province, a?.postalCode].filter(Boolean).join(", "),
      created_at: q.createdAt ?? "",
      updated_at: q.updatedAt ?? "",
      quote_subtotal: q.amounts?.subtotal ?? "",
      quote_total: q.amounts?.total ?? "",
    };
    const items = q.lineItems?.nodes ?? [];
    if (!items.length) rows.push({ ...base, line_name: "", line_description: "", quantity: "", unit_price: "", line_total: "" });
    for (const li of items)
      rows.push({ ...base, line_name: li.name ?? "", line_description: li.description ?? "", quantity: li.quantity ?? "",
        unit_price: li.unitPrice ?? "", line_total: li.totalPrice ?? "" });
  }
  return { rows, quotes: d.quotes.nodes.length, next: d.quotes.pageInfo.hasNextPage ? d.quotes.pageInfo.endCursor : null };
}
