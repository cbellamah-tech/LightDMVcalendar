import { kvDel, kvGet, kvSet } from "./store";
import { clearSampleJobs, crewFor, Job, kindFor, upsertJobs } from "./jobs";
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
export const redirectUri = (origin: string) => `${process.env.APP_URL || origin}/api/jobber/callback`;

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

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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
  if (!res.ok || j.errors?.length) throw new Error(`Jobber API error (${res.status}): ${j.errors?.map((e: any) => e.message).join("; ") || j.message || "unknown"}`);
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
  visits(first: 50, after: $cursor, filter: { startAt: { after: $after, before: $before } }) {
    nodes {
      id
      title
      startAt
      endAt
      assignedUsers { nodes { id name { full } } }
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

type VisitNode = {
  id: string; title?: string; startAt: string; endAt?: string;
  assignedUsers?: { nodes: { id: string; name: { full: string } }[] };
  job?: { id: string; jobNumber?: number; title?: string; client?: { name?: string };
    property?: { address?: { street?: string; city?: string; province?: string; postalCode?: string } } };
};

/** Pull visits from 2 days ago to 21 days ahead into the app's job list. */
export async function syncJobber(): Promise<number> {
  const from = new Date(Date.now() - 2 * 86400_000);
  const to = new Date(Date.now() + 21 * 86400_000);
  try {
    const users = await listUsers();
    const nodes: VisitNode[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const d: { visits: { nodes: VisitNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
        await gql(VISITS_QUERY, { after: from.toISOString(), before: to.toISOString(), cursor });
      nodes.push(...d.visits.nodes);
      if (!d.visits.pageInfo.hasNextPage) break;
      cursor = d.visits.pageInfo.endCursor;
    }
    const jobs: Job[] = nodes.map((v) => {
      const names = v.assignedUsers?.nodes.map((u) => u.name.full) ?? [];
      const a = v.job?.property?.address;
      const title = v.title || v.job?.title || "Job";
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
        kind: kindFor(`${title} ${v.job?.title || ""}`, v.startAt),
        crew: crewFor(names, users),
        assignedNames: names,
        updatedAt: Date.now(),
      };
    });
    await clearSampleJobs();
    await upsertJobs(jobs, { source: "jobber", from: from.toISOString(), to: to.toISOString() });
    await kvSet<SyncStatus>(STATUS, { ...(await getStatus()), lastSyncAt: Date.now(), lastCount: jobs.length, lastError: undefined });
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
  await syncJobber().catch(() => {});
}
