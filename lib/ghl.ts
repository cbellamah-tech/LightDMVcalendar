import { kvGet, kvSet } from "./store";
import { etDay } from "./marketing";

/* GoHighLevel (LeadConnector API v2) with a Private Integration token for the Light DMV sub-account.
   Env: GHL_API_KEY (the token), GHL_LOCATION_ID (the sub-account / location id).
   Reads social accounts, Social Planner posts, contacts and deals; writes posts and the "instagram" tag on Instagram leads. */

const BASE = "https://services.leadconnectorhq.com";
const SNAP = "ldmv:ghl:snap";

export const ghlConfigured = () => !!process.env.GHL_API_KEY?.trim() && !!process.env.GHL_LOCATION_ID?.trim();
const loc = () => process.env.GHL_LOCATION_ID!.trim();

async function ghl<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${process.env.GHL_API_KEY!.trim()}`,
      version: "2021-07-28",
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GoHighLevel ${path.split("?")[0]} (${res.status}): ${j.message || j.error || "request failed"}`);
  return j as T;
}

/** The first array found under any of these keys, at any depth of 2. GHL wraps lists differently per endpoint. */
function listIn(j: any, keys: string[]): any[] {
  for (const k of keys) if (Array.isArray(j?.[k])) return j[k];
  for (const v of Object.values(j ?? {})) if (v && typeof v === "object") for (const k of keys) if (Array.isArray((v as any)[k])) return (v as any)[k];
  return [];
}

export type GhlAccount = { id: string; platform: string; name: string; expired?: boolean };
export type GhlPost = { platform: string; day: string; text: string; status: string };
export type GhlLead = { id: string; name: string; source: string; tags: string[]; day: string; at: number; phone?: string; email?: string; attr?: string };
/** One deal, slimmed down for attribution: where it came from, how far it got, what it's worth. */
export type GhlOpp = { id: string; name: string; contactId: string; source: string; status: string; stage: string; pipeline: string; value: number; day: string; closedDay?: string };
export type GhlStage = { name: string; count: number; value: number; pipeline?: string };
export type GhlSnap = { at: number; accounts: GhlAccount[]; posts: GhlPost[]; leads: GhlLead[]; pipeline: GhlStage[]; opps?: GhlOpp[]; errors: string[] };

async function accounts(): Promise<GhlAccount[]> {
  const j = await ghl(`/social-media-posting/${loc()}/accounts`);
  return listIn(j, ["accounts"]).map((a: any) => ({
    id: String(a.id ?? a._id ?? a.oauthId ?? ""),
    platform: String(a.platform ?? a.type ?? "unknown").toLowerCase(),
    name: String(a.name ?? a.displayName ?? a.platform ?? ""),
    expired: !!(a.isExpired ?? a.expired),
  }));
}

async function posts(accts: GhlAccount[], since: Date): Promise<GhlPost[]> {
  const j = await ghl(`/social-media-posting/${loc()}/posts/list`, {
    method: "POST",
    body: { type: "all", skip: "0", limit: "200", fromDate: since.toISOString(), toDate: new Date().toISOString(), includeUsers: "false" },
  });
  const byId = new Map(accts.map((a) => [a.id, a.platform]));
  const out: GhlPost[] = [];
  for (const p of listIn(j, ["posts"])) {
    const status = String(p.status ?? "").toLowerCase();
    if (status && !/publish|posted|success/.test(status)) continue;
    const when = p.publishedAt ?? p.scheduleDate ?? p.createdAt;
    if (!when) continue;
    // One Social Planner post can go to several accounts: count it once per platform.
    const plats = new Set<string>();
    if (p.platform) plats.add(String(p.platform).toLowerCase());
    for (const id of p.accountIds ?? []) if (byId.has(id)) plats.add(byId.get(id)!);
    for (const pl of plats) out.push({ platform: pl, day: etDay(new Date(when)), text: String(p.summary ?? p.text ?? "").slice(0, 200), status });
  }
  return out;
}

const attrText = (a: any) => (a ? [a.sessionSource, a.medium, a.utmSource, a.utmMedium, a.utmCampaign, a.gclid ? "gclid" : "", a.fbclid ? "fbclid" : ""] : [])
  .filter(Boolean).join(" ").slice(0, 200);

/** Contacts added in the last 120 days (newest first, up to 2,000). */
async function leads(since: Date): Promise<GhlLead[]> {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    let list: any[];
    try {
      const j = await ghl(`/contacts/search`, {
        method: "POST",
        body: { locationId: loc(), page, pageLimit: 100, sort: [{ field: "dateAdded", direction: "desc" }] },
      });
      list = listIn(j, ["contacts"]);
    } catch (e) {
      if (page > 1) break;
      list = listIn(await ghl(`/contacts/?locationId=${encodeURIComponent(loc())}&limit=100`), ["contacts"]);
      out.push(...list);
      break;
    }
    out.push(...list);
    const last = Date.parse(list[list.length - 1]?.dateAdded ?? "") || 0;
    if (list.length < 100 || (last && last < since.getTime())) break;
  }
  return out
    .map((c: any) => {
      const at = Date.parse(c.dateAdded ?? c.createdAt ?? "") || 0;
      const name = c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.companyName || c.email || c.phone || "Unnamed";
      return {
        id: String(c.id), name: String(name), source: String(c.source ?? c.attributionSource?.medium ?? ""), tags: (c.tags ?? []).map(String),
        day: at ? etDay(at) : "", at, phone: c.phone, email: c.email, attr: attrText(c.attributionSource ?? c.lastAttributionSource),
      };
    })
    .filter((c) => c.at)
    .sort((a, b) => b.at - a.at);
}

/** Open deals per stage, kept per pipeline (Light DMV runs several: sales, cold leads, permanent lighting...). */
async function pipeline(opps: GhlOpp[] = []): Promise<GhlStage[]> {
  const pj = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(loc())}`);
  const stage = new Map<string, { pipeline: string; name: string; i: number }>();
  for (const p of listIn(pj, ["pipelines"]))
    (p.stages ?? []).forEach((st: any, i: number) => stage.set(st.id, { pipeline: String(p.name ?? "Pipeline"), name: String(st.name), i }));
  const counts = new Map<string, GhlStage & { i: number }>();
  for (let page = 1; page <= 20; page++) {
    const j = await ghl(`/opportunities/search?location_id=${encodeURIComponent(loc())}&limit=100&page=${page}`);
    const list = listIn(j, ["opportunities"]);
    for (const o of list) {
      const st = stage.get(o.pipelineStageId) ?? { pipeline: "Other", name: "Other", i: 99 };
      const key = `${st.pipeline}|${st.name}`;
      const c = counts.get(key) ?? { pipeline: st.pipeline, name: st.name, count: 0, value: 0, i: st.i };
      c.count++; c.value += Number(o.monetaryValue) || 0;
      counts.set(key, c);
      const created = Date.parse(o.createdAt ?? o.dateAdded ?? "") || 0;
      const closed = Date.parse(o.lastStatusChangeAt ?? o.updatedAt ?? "") || 0;
      if (created) opps.push({
        id: String(o.id), name: String(o.contact?.name || o.name || "").slice(0, 80), contactId: String(o.contactId ?? o.contact?.id ?? ""),
        source: [o.source, ...(o.contact?.tags ?? [])].filter(Boolean).join(" ").slice(0, 200),
        status: String(o.status ?? "open").toLowerCase(), stage: st.name, pipeline: st.pipeline, value: Number(o.monetaryValue) || 0,
        day: etDay(created), closedDay: closed ? etDay(closed) : undefined,
      });
    }
    if (list.length < 100) break;
  }
  // Busiest pipeline first, stages in the pipeline's own order.
  const size = new Map<string, number>();
  for (const c of counts.values()) size.set(c.pipeline!, (size.get(c.pipeline!) ?? 0) + c.count);
  return [...counts.values()]
    .sort((a, b) => (size.get(b.pipeline!)! - size.get(a.pipeline!)!) || a.pipeline!.localeCompare(b.pipeline!) || a.i - b.i)
    .map(({ i, ...c }) => c);
}

export const getGhlSnap = () => kvGet<GhlSnap>(SNAP);

/** chris (2026-10-08): every lead from Instagram carries the "instagram" tag in GoHighLevel.
   Instagram DMs (conversations) plus contacts whose source says Instagram; adds the tag where it's missing. */
async function tagInstagram(ls: GhlLead[]): Promise<string | null> {
  const want = new Set(ls.filter((l) => /instagram/i.test(`${l.source} ${l.attr ?? ""}`)).map((l) => l.id));
  try {
    const j = await ghl(`/conversations/search?locationId=${encodeURIComponent(loc())}&lastMessageType=TYPE_INSTAGRAM&limit=100`);
    for (const c of listIn(j, ["conversations"])) if (c.contactId) want.add(String(c.contactId));
  } catch { /* no conversations scope: the source text still works */ }
  const byId = new Map(ls.map((l) => [l.id, l]));
  const todo = [...want].filter((id) => !byId.get(id)?.tags.some((t) => t.toLowerCase() === "instagram")).slice(0, 60);
  for (const id of todo) {
    try {
      await ghl(`/contacts/${encodeURIComponent(id)}/tags`, { method: "POST", body: { tags: ["instagram"] } });
      byId.get(id)?.tags.push("instagram");
    } catch (e: any) {
      return `Couldn't tag Instagram leads in GoHighLevel: ${e.message}. The GoHighLevel key needs the "Edit Contacts" scope.`;
    }
  }
  return null;
}

/** Refresh from GoHighLevel if the copy is older than `maxAgeMs`. Each part fails on its own. */
export async function refreshGhl(maxAgeMs = 10 * 60_000): Promise<GhlSnap | null> {
  if (!ghlConfigured()) return null;
  const cur = await getGhlSnap();
  if (cur && Date.now() - cur.at < maxAgeMs) return cur;
  const errors: string[] = [];
  const since = new Date(Date.now() - 120 * 86400_000); // back to early June: the whole campaign season
  const accts = await accounts().catch((e) => { errors.push(e.message); return cur?.accounts ?? []; });
  const ps = await posts(accts, since).catch((e) => { errors.push(e.message); return cur?.posts ?? []; });
  const ls = await leads(since).catch((e) => { errors.push(e.message); return cur?.leads ?? []; });
  const tagErr = await tagInstagram(ls).catch((e) => e.message as string);
  if (tagErr) errors.push(tagErr);
  const opps: GhlOpp[] = [];
  const pl = await pipeline(opps).catch((e) => { errors.push(e.message); return cur?.pipeline ?? []; });
  const snap: GhlSnap = { at: Date.now(), accounts: accts, posts: ps, leads: ls, pipeline: pl, opps: opps.length ? opps : cur?.opps ?? [], errors };
  await kvSet(SNAP, snap);
  return snap;
}

/** "Facebook ad" / "google" / tags like "src: yard sign": a short source name for the Leads panel. */
export function leadSource(l: GhlLead): string {
  const all = [l.source, ...l.tags].join(" ").toLowerCase();
  const rules: [RegExp, string][] = [
    [/yard|sign/, "Yard sign"], [/craigslist/, "Craigslist"], [/marketplace/, "Marketplace"], [/nextdoor/, "Nextdoor"],
    [/lsa|local service/, "Google LSA"], [/google|gbp|gmb/, "Google"], [/facebook|meta|fb|instagram|ig\b/, "Facebook / Instagram"],
    [/linkedin/, "LinkedIn"], [/smartlead|cold ?email|headline theory/, "Cold email"], [/cold .*leads?|re-?engage/, "Old leads texted again"], [/referr/, "Referral"], [/website|form|site/, "Website"],
    [/door/, "Door hanger"], [/mail|eddm/, "Direct mail"], [/repeat|return|previous/, "Returning customer"],
  ];
  for (const [re, name] of rules) if (re.test(all)) return name;
  return l.source || "Unknown";
}

/* ---------- Posting ---------- */

/** GoHighLevel wants a user on every post: the first admin on the account, remembered. */
async function ghlUserId(): Promise<string> {
  const key = "ldmv:ghl:userid";
  const cur = await kvGet<string>(key);
  if (cur) return cur;
  const j = await ghl(`/users/?locationId=${encodeURIComponent(loc())}`);
  const users = listIn(j, ["users"]);
  const u = users.find((x: any) => /admin/i.test(x.roles?.role ?? x.role ?? "")) ?? users[0];
  if (!u?.id) throw new Error("GoHighLevel has no user to post as (the key needs View Users).");
  await kvSet(key, String(u.id));
  return String(u.id);
}

/** Post now to the given Social Planner accounts. */
export async function ghlPostNow(accountIds: string[], text: string, media: { url: string; type: string }[]) {
  if (!accountIds.length) throw new Error("Pick at least one account.");
  return ghl(`/social-media-posting/${loc()}/posts`, {
    method: "POST",
    body: { accountIds, summary: text, media, type: "post", status: "published", userId: await ghlUserId() },
  });
}

/** Clear the cached copy so the next read shows a post that was just made. */
export const expireGhlSnap = async () => {
  const cur = await getGhlSnap();
  if (cur) await kvSet(SNAP, { ...cur, at: 0 });
};

/* ---------- Texting a customer ---------- */

/** GoHighLevel answers 401/403 when the Private Integration key is missing a scope. */
const scopeHint = (e: any, what: string) =>
  /\((401|403)\)/.test(e.message) ? new Error(`GoHighLevel refused to ${what}. In GoHighLevel, Settings > Private Integrations, edit the app's key and tick "Edit Contacts" and "Edit Conversation Messages".`) : e;

/** The GoHighLevel contact with this phone, created if there isn't one (upsert matches on phone). */
export async function ghlContactId(c: { phone: string; firstName?: string; name?: string }): Promise<string> {
  const [first, ...rest] = (c.name ?? "").trim().split(/\s+/);
  const j = await ghl(`/contacts/upsert`, {
    method: "POST",
    body: { locationId: loc(), phone: c.phone, firstName: c.firstName || first || undefined, lastName: rest.join(" ") || undefined, source: "Light DMV app" },
  }).catch((e) => { throw scopeHint(e, "find or add the customer"); });
  const id = j?.contact?.id ?? j?.id;
  if (!id) throw new Error("GoHighLevel didn't return a contact for the customer's phone.");
  return String(id);
}

/** Text a customer from the GoHighLevel number, in the same conversation as their other texts. */
export async function ghlSendSms(c: { phone: string; firstName?: string; name?: string }, message: string) {
  if (!ghlConfigured()) throw new Error("GoHighLevel isn't connected, so the app can't send texts.");
  const contactId = await ghlContactId(c);
  return ghl(`/conversations/messages`, { method: "POST", body: { type: "SMS", contactId, message } })
    .catch((e) => { throw scopeHint(e, "send the text"); });
}
