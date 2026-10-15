import { kvGet, kvSet } from "./store";
import { addDays, etDay } from "./marketing";
import { gapi, googleStatus, grantedScopes, SCOPE_ANALYTICS, SCOPE_SEARCH } from "./google";
import { SITE } from "./website";

/* Search Console and Google Analytics numbers for the Marketing tab, read through the same Google connection as the
   inbox and the sheet. Saved as one snapshot; the tab shows it at once and re-reads Google in the background. */

const SNAP = "ldmv:google:insights";
const KEYWORDS = "ldmv:mkt:adkeywords";
const GA_ID = process.env.GA4_MEASUREMENT_ID?.trim() || "G-Z003M10E55"; // the tag lightdmv.com loads

export type Row = { key: string; clicks: number; impressions: number; ctr: number; position: number; prevClicks?: number; prevPosition?: number };
export type SearchTotals = { clicks: number; impressions: number; ctr: number; position: number };
export type SearchData = {
  site: string; start: string; end: string;
  now: SearchTotals; prev: SearchTotals;
  daily: { day: string; clicks: number; impressions: number }[];
  queries: Row[]; pages: Row[]; devices: Row[];
};
export type GaTotals = { sessions: number; users: number; newUsers: number; engagement: number; keyEvents: number };
export type AnalyticsData = {
  property: string; name: string; start: string; end: string;
  now: GaTotals; prev: GaTotals;
  daily: { day: string; sessions: number; keyEvents: number }[];
  channels: { key: string; sessions: number; keyEvents: number; prevSessions: number }[];
  landing: { key: string; sessions: number; keyEvents: number }[];
  events: { key: string; count: number; prevCount: number }[];
};
/** `need` = the one thing that turns a source on, in plain words (with a link when Google gives one). */
export type Source<T> = { data: T | null; need?: string; link?: string; error?: string; at?: number };
export type Insights = { at: number; search: Source<SearchData>; analytics: Source<AnalyticsData> };

export type AdKeyword = { text: string; match?: string; campaign?: string; clicks: number; impressions: number; cost: number; conversions: number; cpc?: number };
export type AdKeywords = { at: number; days: number; keywords: AdKeyword[]; terms: AdKeyword[] };

export const getInsights = () => kvGet<Insights>(SNAP);
export const getAdKeywords = () => kvGet<AdKeywords>(KEYWORDS);
export const saveAdKeywords = (k: AdKeywords) => kvSet(KEYWORDS, k);

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Turns a Google error into the one step that fixes it. */
export function explain(e: any, what: string): { need?: string; link?: string; error?: string } {
  const m = String(e?.message ?? e);
  const link = m.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s"]+/)?.[0]?.replace(/[.,)]+$/, "");
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m))
    return { need: `Turn on the ${what} API in the app's Google Cloud project (one click).`, link };
  if (/insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(m))
    return { need: "Reconnect Google once so the app can read it." };
  if (/User does not have sufficient permission|forbidden|PERMISSION_DENIED/i.test(m))
    return { need: `Add info@lightdmv.com as a user on the ${what} account (read access is enough).`, error: m };
  return { error: m };
}

/* ---------- Search Console ---------- */

const enc = encodeURIComponent;
async function gsc(site: string, body: object) {
  const j = await gapi(`https://www.googleapis.com/webmasters/v3/sites/${enc(site)}/searchAnalytics/query`, { method: "POST", body });
  return (j.rows ?? []) as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
}

/** The Search Console property for the website: the domain property if there is one, else the matching URL one. */
export async function searchSite(): Promise<string | null> {
  const host = new URL(SITE).hostname.replace(/^www\./, "");
  const j = await gapi("https://www.googleapis.com/webmasters/v3/sites");
  const sites: { siteUrl: string; permissionLevel: string }[] = (j.siteEntry ?? []).filter((s: any) => s.permissionLevel !== "siteUnverifiedUser");
  return sites.find((s) => s.siteUrl === `sc-domain:${host}`)?.siteUrl
    ?? sites.find((s) => s.siteUrl.includes(host))?.siteUrl ?? null;
}

const totals = (r?: { clicks: number; impressions: number; ctr: number; position: number }): SearchTotals =>
  ({ clicks: num(r?.clicks), impressions: num(r?.impressions), ctr: round(num(r?.ctr) * 100), position: round(num(r?.position)) });

export async function readSearch(): Promise<SearchData | { need: string }> {
  const site = await searchSite();
  if (!site) return { need: `Add info@lightdmv.com to ${new URL(SITE).hostname} in Search Console (Settings, Users and permissions).` };
  // Search Console runs about two days behind: compare the last 28 full days with the 28 before.
  const end = addDays(etDay(Date.now()), -2), start = addDays(end, -27);
  const pEnd = addDays(start, -1), pStart = addDays(pEnd, -27);
  const q = (startDate: string, endDate: string, dimensions: string[], rowLimit = 250) =>
    gsc(site, { startDate, endDate, dimensions, rowLimit, dataState: "final" });
  const [now, prev, daily, queries, pQueries, pages, pPages, devices] = await Promise.all([
    q(start, end, []), q(pStart, pEnd, []), q(addDays(end, -89), end, ["date"], 100),
    q(start, end, ["query"]), q(pStart, pEnd, ["query"], 1000), q(start, end, ["page"], 500), q(pStart, pEnd, ["page"], 1000), q(start, end, ["device"]),
  ]);
  const withPrev = (rows: typeof queries, before: typeof queries, strip = (k: string) => k): Row[] => {
    const old = new Map(before.map((r) => [strip(r.keys[0]), r]));
    return rows.map((r) => {
      const key = strip(r.keys[0]);
      const p = old.get(key);
      return { key, clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr * 100), position: round(r.position), prevClicks: p ? p.clicks : 0, prevPosition: p ? round(p.position) : undefined };
    });
  };
  const path = (u: string) => { try { return new URL(u).pathname.replace(/\/$/, "") || "/"; } catch { return u; } };
  return {
    site, start, end, now: totals(now[0]), prev: totals(prev[0]),
    daily: daily.map((r) => ({ day: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    queries: withPrev(queries, pQueries), pages: withPrev(pages, pPages, path),
    devices: devices.map((r) => ({ key: r.keys[0].toLowerCase(), clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr * 100), position: round(r.position) })),
  };
}

/* ---------- Google Analytics (GA4) ---------- */

async function gaProperty(): Promise<{ id: string; name: string } | null> {
  if (process.env.GA4_PROPERTY_ID?.trim()) return { id: process.env.GA4_PROPERTY_ID.trim().replace(/^properties\//, ""), name: "Google Analytics" };
  const j = await gapi("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
  const props: { property: string; displayName: string }[] = (j.accountSummaries ?? []).flatMap((a: any) => a.propertySummaries ?? []);
  for (const p of props) {
    const s = await gapi(`https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`).catch(() => ({}));
    if ((s.dataStreams ?? []).some((d: any) => d.webStreamData?.measurementId === GA_ID)) return { id: p.property.split("/")[1], name: p.displayName };
  }
  return props.length === 1 ? { id: props[0].property.split("/")[1], name: props[0].displayName } : null;
}

type GaReport = { rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[] };
const report = (id: string, body: object) => gapi<GaReport>(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, { method: "POST", body });

export async function readAnalytics(): Promise<AnalyticsData | { need: string }> {
  const p = await gaProperty();
  if (!p) return { need: `Add info@lightdmv.com as a Viewer on the Google Analytics property for ${GA_ID}.` };
  const end = addDays(etDay(Date.now()), -1), start = addDays(end, -27);
  const pEnd = addDays(start, -1), pStart = addDays(pEnd, -27);
  const both = [{ startDate: start, endDate: end, name: "now" }, { startDate: pStart, endDate: pEnd, name: "prev" }];
  const [tot, daily, ch, land, ev] = await Promise.all([
    report(p.id, { dateRanges: both, metrics: ["sessions", "totalUsers", "newUsers", "engagementRate", "keyEvents"].map((name) => ({ name })) }),
    report(p.id, { dateRanges: [{ startDate: addDays(end, -89), endDate: end }], dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 100 }),
    report(p.id, { dateRanges: both, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }], limit: 40 }),
    report(p.id, { dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: "landingPage" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 40 }),
    report(p.id, { dateRanges: both, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }, { name: "keyEvents" }], limit: 60 }),
  ]);
  // With two date ranges GA adds a "dateRange" dimension at the end of each row.
  const split = (r: GaReport) => {
    const now = new Map<string, number[]>(), prev = new Map<string, number[]>();
    for (const row of r.rows ?? []) {
      const dims = (row.dimensionValues ?? []).map((d) => d.value);
      const range = dims.pop();
      (range === "prev" ? prev : now).set(dims.join(" ") || "all", row.metricValues.map((m) => num(m.value)));
    }
    return { now, prev };
  };
  const t = split(tot);
  const tt = (m?: number[]): GaTotals => ({ sessions: num(m?.[0]), users: num(m?.[1]), newUsers: num(m?.[2]), engagement: round(num(m?.[3]) * 100), keyEvents: num(m?.[4]) });
  const c = split(ch), e = split(ev);
  const keyEventNames = new Set([...e.now, ...e.prev].filter(([, m]) => m[1] > 0).map(([k]) => k));
  return {
    property: p.id, name: p.name, start, end,
    now: tt(t.now.get("all")), prev: tt(t.prev.get("all")),
    daily: (daily.rows ?? []).map((r) => {
      const d = r.dimensionValues![0].value;
      return { day: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, sessions: num(r.metricValues[0].value), keyEvents: num(r.metricValues[1].value) };
    }),
    channels: [...c.now].map(([key, m]) => ({ key, sessions: m[0], keyEvents: m[1], prevSessions: c.prev.get(key)?.[0] ?? 0 })).sort((a, b) => b.sessions - a.sessions),
    landing: (land.rows ?? []).map((r) => ({ key: r.dimensionValues![0].value || "/", sessions: num(r.metricValues[0].value), keyEvents: num(r.metricValues[1].value) })),
    // Leads and other key events (quote form sent, calls) first; the busiest plain events after.
    events: [...e.now].filter(([k]) => keyEventNames.has(k)).map(([key, m]) => ({ key, count: m[1] || m[0], prevCount: (e.prev.get(key)?.[1] || e.prev.get(key)?.[0]) ?? 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ---------- Snapshot ---------- */

async function source<T>(scope: string, what: string, read: () => Promise<T | { need: string }>, cur?: Source<T>): Promise<Source<T>> {
  const scopes = await grantedScopes().catch(() => [] as string[]);
  if (!scopes.includes(scope)) return { data: cur?.data ?? null, need: "Reconnect Google once so the app can read it." };
  try {
    const r = await read();
    if (r && typeof r === "object" && "need" in r) return { data: null, need: (r as { need: string }).need };
    return { data: r as T, at: Date.now() };
  } catch (e) {
    return { data: cur?.data ?? null, at: cur?.at, ...explain(e, what) };
  }
}

export async function refreshInsights(): Promise<Insights | null> {
  if (!(await googleStatus()).connected) return null;
  const cur = await getInsights();
  const [search, analytics] = await Promise.all([
    source(SCOPE_SEARCH, "Google Search Console", readSearch, cur?.search),
    source(SCOPE_ANALYTICS, "Google Analytics Data and Admin", readAnalytics, cur?.analytics),
  ]);
  const next: Insights = { at: Date.now(), search, analytics };
  await kvSet(SNAP, next);
  return next;
}
