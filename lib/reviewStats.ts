import { kvGet, kvSet } from "./store";
import { gapi, googleStatus, grantedScopes, SCOPE_BUSINESS } from "./google";
import { getReviews, scanReviews } from "./reviews";
import { ghl, ghlConfigured, listIn, loc } from "./ghl";
import { etDay } from "./marketing";

/* The live Google review count and star average, for LightDMV.com and GoHighLevel.
   Best source first: the Business Profile API (needs Reconnect Google plus Google's API approval), then the
   Places API (GOOGLE_MAPS_KEY), then Google's own "left a review" emails to info@ counted on top of a known
   starting point. The website's review-count bot reads /api/public/reviews every few hours, so a new review
   shows on every page, in the schema and in llms.txt within hours. With GHL sync on, the same numbers go to
   the GoHighLevel custom values "Google Review Count" and "Google Rating" for templates and widgets. */

const STATS = "ldmv:reviews:stats";
const BASE = "ldmv:reviews:base";
const GHL_SYNC = "ldmv:reviews:ghlsync";

export type ReviewStats = { count: number; rating: number; at: number; source: "google" | "places" | "emails"; ghlAt?: number; ghlError?: string };
type Base = { count: number; rating: number; at: number; by?: string };
type GhlSync = { on: boolean; by?: string; at?: number };

// What every page said when the count was last set by hand (lightdmv-site PR #71, 2026-10-06).
const START: Base = { count: 165, rating: 5, at: Date.parse("2026-10-06T04:21:52Z") };

export const getReviewStats = () => kvGet<ReviewStats>(STATS);
export const getBase = async () => (await kvGet<Base>(BASE)) ?? START;
export const getGhlSync = async () => (await kvGet<GhlSync>(GHL_SYNC)) ?? { on: false };
export const setGhlSync = (on: boolean, by: string) => kvSet(GHL_SYNC, { on, by, at: Date.now() });

/** An owner types the count Google shows today; email counting carries on from there. */
export async function setBase(count: number, rating: number, by: string) {
  await kvSet(BASE, { count, rating, at: Date.now(), by });
  return refreshReviewStats(true);
}

async function fromBusinessProfile(): Promise<{ count: number; rating: number } | null> {
  if (!(await grantedScopes().catch(() => [] as string[])).includes(SCOPE_BUSINESS)) return null;
  const acc = await gapi("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20");
  for (const a of acc.accounts ?? []) {
    const j = await gapi(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?pageSize=100&readMask=name,title`);
    const l = (j.locations ?? []).find((x: any) => /light\s*dmv/i.test(x.title || "")) ?? j.locations?.[0];
    if (!l) continue;
    const r = await gapi(`https://mybusiness.googleapis.com/v4/${a.name}/${l.name}/reviews?pageSize=1`);
    if (Number.isFinite(r.totalReviewCount)) return { count: Number(r.totalReviewCount), rating: Number(r.averageRating) || 5 };
  }
  return null;
}

async function fromPlaces(): Promise<{ count: number; rating: number } | null> {
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  if (!key) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": "places.displayName,places.rating,places.userRatingCount" },
    body: JSON.stringify({ textQuery: "Light DMV holiday lighting", locationBias: { circle: { center: { latitude: 38.9, longitude: -77.1 }, radius: 50000 } } }),
    signal: AbortSignal.timeout(5000),
  });
  const j = await res.json().catch(() => ({}));
  const hit = (j.places ?? []).find((p: any) => /light\s*dmv/i.test(p.displayName?.text || ""));
  return hit?.userRatingCount ? { count: Number(hit.userRatingCount), rating: Number(hit.rating) || 5 } : null;
}

/** The starting point plus every review email since. Stars come from the email; a missing one counts as 5. */
async function fromEmails(): Promise<{ count: number; rating: number }> {
  const base = await getBase();
  if ((await googleStatus()).connected) await scanReviews().catch(() => {});
  const since = Object.values(await getReviews()).filter((r) => r.at > base.at);
  const count = base.count + since.length;
  const stars = base.rating * base.count + since.reduce((t, r) => t + (r.stars ?? 5), 0);
  return { count, rating: count ? stars / count : 5 };
}

/** Fresh numbers at most every 30 minutes (force skips the wait). Never goes down on the email count alone. */
export async function refreshReviewStats(force = false): Promise<ReviewStats> {
  const cur = await getReviewStats();
  if (!force && cur && Date.now() - cur.at < 30 * 60_000) return cur;
  let got: { count: number; rating: number } | null = null, source: ReviewStats["source"] = "google";
  try { got = await fromBusinessProfile(); } catch { got = null; }
  if (!got) { source = "places"; try { got = await fromPlaces(); } catch { got = null; } }
  if (!got) {
    source = "emails";
    got = await fromEmails();
    if (cur && cur.source === "emails" && got.count < cur.count && !force) got = { count: cur.count, rating: cur.rating };
  }
  const next: ReviewStats = { count: got.count, rating: Math.round(got.rating * 100) / 100, at: Date.now(), source, ghlAt: cur?.ghlAt, ghlError: cur?.ghlError };
  const changed = !cur || cur.count !== next.count || cur.rating !== next.rating;
  if ((await getGhlSync()).on && (changed || !cur?.ghlAt)) {
    try { await pushToGhl(next); next.ghlAt = Date.now(); next.ghlError = undefined; }
    catch (e: any) { next.ghlError = e.message; }
  }
  await kvSet(STATS, next);
  return next;
}

/** GoHighLevel custom values: {{custom_values.google_review_count}} and {{custom_values.google_rating}}. */
async function pushToGhl(s: ReviewStats) {
  if (!ghlConfigured()) throw new Error("GoHighLevel isn't connected");
  const want: Record<string, string> = { "Google Review Count": String(s.count), "Google Rating": s.rating.toFixed(1) };
  const have = listIn(await ghl(`/locations/${loc()}/customValues`), ["customValues"]);
  for (const [name, value] of Object.entries(want)) {
    const cv = have.find((c: any) => String(c.name).toLowerCase() === name.toLowerCase());
    if (cv && String(cv.value) === value) continue;
    if (cv) await ghl(`/locations/${loc()}/customValues/${cv.id}`, { method: "PUT", body: { name, value } });
    else await ghl(`/locations/${loc()}/customValues`, { method: "POST", body: { name, value } });
  }
}

/** What the website reads: no names, only the two numbers. */
export const publicStats = (s: ReviewStats) => ({ count: s.count, rating: Math.round(s.rating * 10) / 10, updatedAt: etDay(s.at), source: s.source });

