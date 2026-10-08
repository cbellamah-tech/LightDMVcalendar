import { randomBytes } from "node:crypto";
import { kvGet, kvSet, kvUpdate } from "./store";
import { gapi, googleStatus } from "./google";
import { getChecklists, getJobs, type Job } from "./jobs";
import { listUsers, type User } from "./users";

/* Google review bonus: $50 to the installer whose review card (ZappyCards NFC tag) the customer tapped.
   ZappyCards has no API or export, so the app tells who tapped by itself: each person's card points at their own
   link on this app (/r/<code>), which notes the tap and sends the phone straight on to Google's review page.
   Google emails info@ every new review ("<name> left a review for Light DMV"); the app reads those from Gmail,
   finds the customer's job by name, and credits the person whose card was tapped there. Anything it can't
   place goes on the Review cards page for the office to assign with one tap. */

export const BONUS = 50;
const CARDS = "ldmv:reviews:cards";   // personId -> card code
const TAPS = "ldmv:reviews:taps";     // newest last
const LIST = "ldmv:reviews:list";     // review id -> Review
const SETTINGS = "ldmv:reviews:settings";

export type Tap = { code: string; personId: string; at: number };
export type Review = {
  id: string; name: string; stars?: number; text?: string; at: number; link?: string;
  status: "credited" | "open" | "skipped";
  jobId?: string; personId?: string; amount?: number;
  how?: string;                          // why this person and job, in plain words
  suggest?: { jobId?: string; personId?: string; why: string };
  by?: string;                           // office person who assigned or changed it
};
type Settings = { reviewUrl?: string; foundUrl?: string; startedAt?: number; scannedAt?: number; error?: string };

export const getSettings = async () => (await kvGet<Settings>(SETTINGS)) ?? {};
const saveSettings = (fn: (s: Settings) => void) => kvUpdate<Settings>(SETTINGS, {}, fn);
export const setReviewUrl = (url: string | null) => saveSettings((s) => { s.reviewUrl = url || undefined; });

export const getReviews = async () => (await kvGet<Record<string, Review>>(LIST)) ?? {};
export const getTaps = async () => (await kvGet<Tap[]>(TAPS)) ?? [];

/* ---------- cards ---------- */

/** Every active person gets a card code the first time anyone looks. */
export async function getCards(users?: User[]): Promise<Record<string, string>> {
  const people = (users ?? (await listUsers())).filter((u) => u.active);
  const cur = (await kvGet<Record<string, string>>(CARDS)) ?? {};
  if (people.every((u) => cur[u.id])) return cur;
  return kvUpdate<Record<string, string>>(CARDS, {}, (all) => {
    for (const u of people) all[u.id] ??= randomBytes(4).toString("hex");
  });
}

/** The card link always points at the live site, so a card programmed from a preview still works. */
export function cardLink(code: string) {
  const prod = process.env.APP_URL?.replace(/\/$/, "") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return `${prod}/r/${code}`;
}

export async function recordTap(code: string): Promise<boolean> {
  const cards = (await kvGet<Record<string, string>>(CARDS)) ?? {};
  const personId = Object.keys(cards).find((id) => cards[id] === code);
  if (!personId) return false;
  const now = Date.now();
  await kvUpdate<Tap[]>(TAPS, [], (all) => {
    const last = all[all.length - 1];
    // A customer's phone often reads the tag twice in a row; one tap is enough.
    if (last && last.personId === personId && now - last.at < 2 * 60_000) return all;
    all.push({ code, personId, at: now });
    return all.slice(-3000);
  });
  return true;
}

/** Where a tap goes: the link the office pasted, else Light DMV's own Google review page found once from Maps. */
export async function reviewUrl(): Promise<string> {
  const s = await getSettings();
  if (s.reviewUrl) return s.reviewUrl;
  if (s.foundUrl) return s.foundUrl;
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  if (key) {
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": "places.id,places.displayName" },
        body: JSON.stringify({ textQuery: "Light DMV holiday lighting", locationBias: { circle: { center: { latitude: 38.9, longitude: -77.1 }, radius: 50000 } } }),
        signal: AbortSignal.timeout(4000),
      });
      const j = await res.json().catch(() => ({}));
      const hit = (j.places ?? []).find((p: any) => /light\s*dmv/i.test(p.displayName?.text || ""));
      if (hit?.id) {
        const url = `https://search.google.com/local/writereview?placeid=${hit.id}`;
        await saveSettings((x) => { x.foundUrl = url; });
        return url;
      }
    } catch { /* fall through */ }
    // Keys made before the new Places API only have the classic one.
    try {
      const u = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
      u.searchParams.set("input", "Light DMV"); u.searchParams.set("inputtype", "textquery");
      u.searchParams.set("fields", "place_id,name"); u.searchParams.set("locationbias", "circle:50000@38.9,-77.1"); u.searchParams.set("key", key);
      const j = await (await fetch(u, { signal: AbortSignal.timeout(4000) })).json().catch(() => ({}));
      const hit = (j.candidates ?? []).find((p: any) => /light\s*dmv/i.test(p.name || ""));
      if (hit?.place_id) {
        const url = `https://search.google.com/local/writereview?placeid=${hit.place_id}`;
        await saveSettings((x) => { x.foundUrl = url; });
        return url;
      }
    } catch { /* fall through */ }
  }
  return "https://www.google.com/search?q=Light+DMV+reviews";
}

/* ---------- reading Google's review emails ---------- */

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function plainText(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return b64(part.body.data);
  for (const p of part.parts ?? []) { const t = plainText(p); if (t) return t; }
  if (part.mimeType === "text/html" && part.body?.data) return b64(part.body.data).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|td)>/gi, "\n\n").replace(/<[^>]+>/g, "");
  return "";
}

const STARS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
export type ParsedReview = { id: string; name: string; text?: string; stars?: number; link?: string };

/** Google's "new review" emails, one review or several: each review is the reviewer's name, the text (or "only left
 *  a rating"), then a "Reply to review" link carrying the review's id. */
export function parseReviewEmail(body: string): ParsedReview[] {
  const paras = body.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const one = body.match(/new\s+(\d)-star review/i);
  const many = body.match(/\d+\s+(one|two|three|four|five)-star reviews/i);
  const stars = one ? Number(one[1]) : many ? STARS[many[1].toLowerCase()] : undefined;
  const out: ParsedReview[] = [];
  for (let i = 2; i < paras.length; i++) {
    if (!/^reply to review/i.test(paras[i])) continue;
    const url = paras[i].match(/<(https:\/\/[^>]+\/reviews\/([^?>/]+)[^>]*)>/);
    let name = paras[i - 2], text: string | undefined = paras[i - 1];
    if (/^read review/i.test(name)) { name = paras[i - 1]; text = undefined; } // a rating with no words at all
    if (!url || !name || /[<>]/.test(name) || name.length > 60 || name.split(/\s+/).length > 5) continue;
    if (text && (/only left a rating/i.test(text) || /^read review/i.test(text))) text = undefined;
    out.push({ id: url[2], name, text: text?.replace(/\s+/g, " ").slice(0, 300), stars, link: url[1].split("?")[0] });
  }
  return out;
}

/* ---------- matching a review to a job and a person ---------- */

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !["and", "the", "sample", "mr", "mrs", "ms", "dr"].includes(w));

/** 2 = first and last name both in the Jobber client name, 1 = last name only, 0 = no. */
export function nameScore(reviewer: string, client: string) {
  const r = words(reviewer), c = new Set(words(client));
  if (!r.length || !c.size) return 0;
  const last = r[r.length - 1], first = r[0];
  if (r.length > 1 && c.has(first) && c.has(last)) return 2;
  if (r.length > 1 && c.has(last)) return 1;
  return 0;
}

const DAY = 86400_000;
const onJob = (u: User | undefined, j: Job) =>
  !!u && ((!!u.crew && u.crew === j.crew) || j.assignedNames.some((n) => [u.jobberName, u.name].some((v) => v && v.toLowerCase() === n.toLowerCase())));

type Match = Pick<Review, "status" | "jobId" | "personId" | "how" | "suggest">;

export function matchReview(r: { name: string; at: number }, jobs: Job[], taps: Tap[], users: User[], askedBy: Record<string, string | undefined>): Match {
  const user = (id?: string) => users.find((u) => u.id === id);
  const visits = jobs.filter((j) => j.kind !== "fix");
  // The customer's own visit: their name on a Jobber visit in the 45 days before the review, newest first.
  const named = visits
    .map((j) => ({ j, score: nameScore(r.name, j.client), t: new Date(j.start).getTime() }))
    .filter((x) => x.score > 0 && x.t <= r.at + DAY && x.t >= r.at - 45 * DAY)
    .sort((a, b) => b.score - a.score || b.t - a.t);
  const recentTaps = taps.filter((t) => t.at <= r.at + 5 * 60_000 && t.at >= r.at - 3 * DAY).sort((a, b) => b.at - a.at);

  const job = named[0]?.j;
  if (job) {
    const t0 = new Date(job.start).getTime() - 12 * 3600_000;
    const there = taps.filter((t) => t.at >= t0 && t.at <= r.at + 5 * 60_000).sort((a, b) => b.at - a.at);
    // Someone on that job's crew, or someone with no crew of their own (an owner, the driver) who was there.
    const tap = there.find((t) => onJob(user(t.personId), job)) ?? there.find((t) => !user(t.personId)?.crew);
    if (tap) return { status: "credited", jobId: job.id, personId: tap.personId, how: `${user(tap.personId)?.name ?? "Someone"}'s card was tapped ${fmt(tap.at)}; the review name matches this job's client.` };
    const asked = askedBy[job.id];
    if (asked && user(asked)) return { status: "credited", jobId: job.id, personId: asked, how: `${user(asked)!.name} checked "Ask for Google review" on this job; the review name matches its client.` };
    const lead = users.find((u) => u.active && u.role === "lead" && u.crew && u.crew === job.crew);
    return { status: "open", suggest: { jobId: job.id, personId: lead?.id, why: "The name matches this job's client, but no review card was tapped there." } };
  }
  // No client by that name (a spouse, a nickname): the job the tapping person's crew was at when the card was tapped.
  const tap = recentTaps[0];
  if (tap) {
    const u = user(tap.personId);
    const at = visits.filter((j) => onJob(u, j) && Math.abs(new Date(j.start).getTime() - tap.at) < 14 * 3600_000)
      .sort((a, b) => Math.abs(new Date(a.start).getTime() - tap.at) - Math.abs(new Date(b.start).getTime() - tap.at))[0];
    if (at) return { status: "credited", jobId: at.id, personId: tap.personId, how: `${u?.name ?? "Someone"}'s card was tapped ${fmt(tap.at)} during this job; the review came ${ago(r.at - tap.at)} later.` };
    return { status: "open", suggest: { personId: tap.personId, why: `${u?.name ?? "Someone"}'s card was tapped ${fmt(tap.at)}, but no job of theirs was on that day.` } };
  }
  return { status: "open", suggest: { why: "No job with this name and no review card tapped before it." } };
}

const fmt = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(t);
const ago = (ms: number) => (ms < 3600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 2 * DAY ? `${Math.round(ms / 3600_000)} h` : `${Math.round(ms / DAY)} days`);

/** Scan in the background when the last look is older than 15 minutes (pages call this; it never slows them). */
export async function scanIfStale() {
  const s = await getSettings();
  if (s.scannedAt && Date.now() - s.scannedAt < 15 * 60_000) return;
  const { laterOnce } = await import("./background");
  await laterOnce("reviews", scanReviews);
}

/** Read new review emails and credit or queue each one. Reviews already placed are never redone. */
export async function scanReviews(): Promise<{ added: number }> {
  const g = await googleStatus();
  if (!g.connected) return { added: 0 };
  const s = await getSettings();
  // Only reviews from the day this started: older ones were never collected with a card.
  const startedAt = s.startedAt ?? Date.now() - 7 * DAY;
  if (!s.startedAt) await saveSettings((x) => { x.startedAt = startedAt; });
  const days = Math.min(60, Math.max(2, Math.ceil((Date.now() - startedAt) / DAY) + 1));
  try {
    const q = encodeURIComponent(`from:businessprofile-noreply@google.com newer_than:${days}d`);
    const list = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${q}`);
    const known = await getReviews();
    const seenMsgs = new Set((await kvGet<string[]>("ldmv:reviews:msgs")) ?? []);
    const fresh: (ParsedReview & { at: number })[] = [];
    for (const m of list.messages ?? []) {
      if (seenMsgs.has(m.id)) continue;
      const msg = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`);
      const at = Number(msg.internalDate) || Date.now();
      seenMsgs.add(m.id);
      if (at < startedAt) continue;
      for (const p of parseReviewEmail(plainText(msg.payload))) if (!known[p.id]) fresh.push({ ...p, at });
    }
    await kvSet("ldmv:reviews:msgs", [...seenMsgs].slice(-1000));
    if (fresh.length) {
      const [jobsById, taps, users] = await Promise.all([getJobs(), getTaps(), listUsers()]);
      const jobs = Object.values(jobsById);
      const checks = await getChecklists(jobs);
      const askedBy: Record<string, string | undefined> = {};
      checks.forEach((c, i) => { const e = c.items.review; if (e?.done) askedBy[jobs[i].id] = e.by; });
      await kvUpdate<Record<string, Review>>(LIST, {}, (all) => {
        for (const p of fresh) {
          if (all[p.id]) continue;
          const m = matchReview(p, jobs, taps, users, askedBy);
          all[p.id] = { ...p, ...m, amount: m.status === "credited" ? BONUS : undefined };
        }
      });
    }
    await saveSettings((x) => { x.scannedAt = Date.now(); x.error = undefined; });
    return { added: fresh.length };
  } catch (e: any) {
    await saveSettings((x) => { x.scannedAt = Date.now(); x.error = e.message; });
    throw e;
  }
}

/** The office assigns, moves, changes the amount of, or sets aside a review. */
export async function changeReview(id: string, b: { jobId?: string | null; personId?: string | null; amount?: number | null; skip?: boolean; reopen?: boolean }, by: string) {
  const all = await kvUpdate<Record<string, Review>>(LIST, {}, (all) => {
    const r = all[id];
    if (!r) return;
    if (b.skip) { r.status = "skipped"; r.amount = undefined; }
    else if (b.reopen) { r.status = "open"; r.amount = undefined; r.jobId = undefined; r.personId = undefined; }
    else {
      if (b.jobId !== undefined) r.jobId = b.jobId || undefined;
      if (b.personId !== undefined) r.personId = b.personId || undefined;
      if (b.amount !== undefined) r.amount = b.amount ?? BONUS;
      if (r.jobId && r.personId) { r.status = "credited"; r.amount ??= BONUS; r.how = r.how && b.jobId === undefined && b.personId === undefined ? r.how : `Assigned by ${by}.`; }
    }
    r.by = by;
  });
  return all[id];
}

/* ---------- what shows on pay ---------- */

export type ReviewBonus = { reviewId: string; personId: string; person: string; amount: number; reviewer: string; at: number; how?: string };

/** Credited reviews by job id. */
export async function bonusesByJob(users?: User[]): Promise<Record<string, ReviewBonus[]>> {
  const [all, people] = await Promise.all([getReviews(), users ?? listUsers()]);
  const out: Record<string, ReviewBonus[]> = {};
  for (const r of Object.values(all)) {
    if (r.status !== "credited" || !r.jobId || !r.personId) continue;
    (out[r.jobId] ??= []).push({
      reviewId: r.id, personId: r.personId, person: people.find((u) => u.id === r.personId)?.name ?? "Unknown",
      amount: r.amount ?? BONUS, reviewer: firstName(r.name), at: r.at, how: r.how,
    });
  }
  return out;
}
export const bonusTotal = (b?: ReviewBonus[]) => (b ?? []).reduce((t, x) => t + x.amount, 0);
const firstName = (n: string) => n.split(/\s+/)[0];
