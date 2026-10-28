import { createHash, randomBytes } from "crypto";
import { kvGet, kvGetMany, kvSet, kvUpdate } from "./store";
import { getChecklists, getJobs, type Job } from "./jobs";
import { distanceM } from "./geo";
import { etDay, etHour } from "./crewNotes";
import { listUsers, type User } from "./users";
import { clientFor, pickPhone } from "./onMyWay";
import { rows } from "./jobberSchema";
import { ghlSendSms } from "./ghl";

/* The Santa tracker. The crew lead's phone sends its GPS while the app is open; each crew's day is the day's visits in
   Jobber order. From the homes already done, the one they're on and the drive between, every stop gets an ETA that
   moves as the crew works through the list. Each customer can get a link (/t/<token>) to a page that shows only their
   own ETA, how many homes are ahead of them and the van's rough position, never another customer's name or address.
   Addresses are turned into map points once and kept in the database; nothing here waits on a map service while a
   page loads. */

export type P = { lat: number; lng: number };
export type Ping = P & { acc?: number; at: number; by: string; day: string };
export type StopStatus = "done" | "here" | "next" | "later";
export type Stop = {
  jobId: string; n: number; kind: Job["kind"]; status: StopStatus;
  start: string; client: string; address: string; at?: P;
  arrivedAt?: number; completedAt?: number;
  eta?: number; etaFrom?: number; etaTo?: number; ahead: number; // homes still to do before this one
};
export type CrewDay = { crew: string; day: string; lead: string; stops: Stop[]; van: Ping | null; vanFresh: boolean; started: boolean; trail: [number, number][] };

const TZ = "America/New_York";
const PING = (crew: string) => `ldmv:trk:ping:${crew}`;
const TRAIL = (crew: string, day: string) => `ldmv:trk:trail:${crew}:${day}`;
const GEO = (address: string) => `ldmv:geo:${createHash("sha1").update(norm(address)).digest("hex").slice(0, 20)}`;
const TOKEN = (t: string) => `ldmv:trk:tok:${t}`;
const JOB_TOKEN = (jobId: string) => `ldmv:trk:job:${jobId}`;
const SENT = (jobId: string) => `ldmv:trk:sent:${jobId}`;
const AUTO = (crew: string, day: string) => `ldmv:trk:auto:${crew}:${day}`;
const SETTINGS = "ldmv:trk:settings";

const FRESH_MS = 10 * 60_000;   // a ping older than this isn't "where the van is now"
const HERE_M = 120;             // the van parked this close to a stop counts as there
const MIN = 60_000;

const norm = (a: string) => a.toLowerCase().replace(/\s+/g, " ").trim();
const isMidnight = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) === "00:00";

// ---------- settings ----------

export type TrackSettings = { autoText: boolean; turnedOnBy?: string; turnedOnAt?: number };
export const getSettings = async (): Promise<TrackSettings> => ({ autoText: false, ...(await kvGet<TrackSettings>(SETTINGS)) });
export const saveSettings = (s: TrackSettings) => kvSet(SETTINGS, s);

// ---------- GPS from the crew lead's phone ----------

export async function savePing(crew: string, p: { lat: number; lng: number; acc?: number }, by: string) {
  const day = etDay();
  const ping: Ping = { lat: p.lat, lng: p.lng, acc: p.acc, at: Date.now(), by, day };
  await kvSet(PING(crew), ping);
  // The path for the office map: a point a minute at most, the last 600 of the day.
  await kvUpdate<[number, number, number][]>(TRAIL(crew, day), [], (t) => {
    const last = t[t.length - 1];
    if (last && ping.at - last[2] < 50_000) return t;
    t.push([Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5, ping.at]);
    return t.slice(-600);
  });
  return ping;
}

// ---------- addresses to map points ----------

type Geo = P | { miss: true; at: number };

/** Map points already known for these addresses (one database read). */
export async function geoFor(addresses: string[]): Promise<(P | null)[]> {
  const got = await kvGetMany<Geo>(addresses.map((a) => (a ? GEO(a) : "ldmv:none")));
  return got.map((g) => (g && "lat" in g ? g : null));
}

/** Look up addresses the database doesn't know yet, in the background or a cron (never while a page waits).
 *  US Census first (free, no key, made for US street addresses), then OpenStreetMap, one a second. */
export async function geocodeMissing(addresses: string[], budgetMs = 20_000) {
  const started = Date.now();
  const list = [...new Set(addresses.filter(Boolean))];
  const known = await kvGetMany<Geo>(list.map(GEO));
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const k = known[i];
    if (k && ("lat" in k || Date.now() - k.at < 7 * 86400_000)) continue; // a miss is retried after a week
    if (Date.now() - started > budgetMs) break;
    const hit = (await census(list[i]).catch(() => null)) ?? (await osm(list[i]).catch(() => null));
    await kvSet<Geo>(GEO(list[i]), hit ?? { miss: true, at: Date.now() });
    n++;
    await new Promise((r) => setTimeout(r, 1100));
  }
  return n;
}

async function census(address: string): Promise<P | null> {
  const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  u.searchParams.set("address", address);
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("format", "json");
  const d = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
  const c = d?.result?.addressMatches?.[0]?.coordinates;
  return c && Number.isFinite(c.y) && Number.isFinite(c.x) ? { lat: Number(c.y), lng: Number(c.x) } : null;
}

async function osm(address: string): Promise<P | null> {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("q", address);
  u.searchParams.set("limit", "1");
  u.searchParams.set("countrycodes", "us");
  u.searchParams.set("viewbox", "-78.2,39.6,-76.3,38.4");
  const res = await fetch(u, { headers: { "user-agent": "LightDMV-App/1.0 (crew tracker)" }, signal: AbortSignal.timeout(6000) });
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

// ---------- one crew's day, with ETAs ----------

/** The day's stops for a crew in Jobber order (installs, takedowns and fixes). */
export const crewJobs = (all: Record<string, Job>, crew: string, day: string) =>
  Object.values(all).filter((j) => j.crew === crew && etDay(j.start) === day).sort((a, b) => a.start.localeCompare(b.start));

/** Straight line times a road factor at about 25 mph through neighborhoods, plus parking. */
export const driveMs = (a: P, b: P) => ((distanceM(a, b) * 1.35) / 11.2) * 1000 + 3 * MIN;

/** How long the crew should take at a home: the time Jobber has booked, sped up or slowed down by how today's
 *  homes went against their booked time. No booked time: today's average, else an hour and a half. */
function onSiteEstimator(jobs: { job: Job; arrivedAt?: number; completedAt?: number }[]) {
  const planned = (j: Job) => {
    if (!j.end || isMidnight(j.start)) return null;
    const m = (Date.parse(j.end) - Date.parse(j.start)) / MIN;
    return m >= 20 && m <= 360 ? m : null;
  };
  const doneToday = jobs.filter((x) => x.arrivedAt && x.completedAt && x.completedAt > x.arrivedAt);
  const actual = doneToday.map((x) => (x.completedAt! - x.arrivedAt!) / MIN).filter((m) => m >= 10 && m <= 600);
  const ratios = doneToday.map((x) => { const p = planned(x.job); return p ? (x.completedAt! - x.arrivedAt!) / MIN / p : null; })
    .filter((r): r is number => r != null && r > 0.3 && r < 3);
  const pace = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  const avg = actual.length ? actual.reduce((a, b) => a + b, 0) / actual.length : 90;
  return (j: Job) => { const p = planned(j); return (p ? p * pace : avg) * MIN; };
}

export async function crewDay(crew: string, day = etDay(), ctx?: { all?: Record<string, Job>; users?: User[] }): Promise<CrewDay> {
  const [all, users, van, trail] = await Promise.all([
    ctx?.all ?? getJobs(), ctx?.users ?? listUsers(), kvGet<Ping>(PING(crew)), kvGet<[number, number, number][]>(TRAIL(crew, day)),
  ]);
  const jobs = crewJobs(all, crew, day);
  const [lists, pts] = await Promise.all([getChecklists(jobs), geoFor(jobs.map((j) => j.address))]);
  const now = Date.now();
  const vanToday = van && van.day === day ? van : null;
  const vanFresh = !!vanToday && now - vanToday.at < FRESH_MS;
  const lead = users.find((u) => u.active && u.role === "lead" && u.crew === crew)?.name || crew;

  const rowsIn = jobs.map((job, i) => ({ job, at: pts[i] ?? undefined, arrivedAt: lists[i].arrivedAt, completedAt: lists[i].completedAt, done: !!(lists[i].completedAt || job.doneInJobber) }));
  const est = onSiteEstimator(rowsIn);
  // On site: the arrival photo is in, or the van has sat at the house; never a home already done.
  const hereIdx = rowsIn.findIndex((r) => !r.done && (r.arrivedAt || (vanFresh && r.at && distanceM(vanToday!, r.at) < HERE_M)));
  const started = !!vanToday || rowsIn.some((r) => r.done || r.arrivedAt);

  const stops: Stop[] = rowsIn.map((r, i) => ({
    jobId: r.job.id, n: i + 1, kind: r.job.kind, status: r.done ? "done" : i === hereIdx ? "here" : "later",
    start: r.job.start, client: r.job.client, address: r.job.address, at: r.at, arrivedAt: r.arrivedAt, completedAt: r.completedAt, ahead: 0,
  }));

  // Walk the homes still to do: the one they're on first, then the rest in order.
  const order = [...stops.filter((s) => s.status === "here"), ...stops.filter((s) => s.status === "later")];
  let t = now;
  let from: P | null = vanFresh ? vanToday : null;
  if (!started) {
    const first = jobs.find((j) => !isMidnight(j.start));
    t = Math.max(now, first ? Date.parse(first.start) : Date.parse(`${day}T09:00:00${etOffset(day)}`));
    from = null;
  } else if (!from) {
    // No fresh GPS: assume they left the last home they finished.
    const last = [...stops].filter((s) => s.completedAt).sort((a, b) => b.completedAt! - a.completedAt!)[0];
    from = last?.at ?? null;
    if (last?.completedAt) t = Math.max(now, last.completedAt);
  }
  order.forEach((s, k) => {
    const job = all[s.jobId];
    s.ahead = k;
    if (s.status === "here") {
      s.eta = s.arrivedAt ?? now;
      t = Math.max(now + 10 * MIN, (s.arrivedAt ?? now) + est(job));
    } else {
      if (k === 0 && started) s.status = "next";
      else if (k === 1 && order[0].status === "here") s.status = "next";
      const drive = from && s.at ? driveMs(from, s.at) : from || started ? 15 * MIN : 0;
      s.eta = t + drive;
      t = s.eta + est(job);
      // The further down the list, the wider the window: 15 minutes either side, up to 45.
      const spread = Math.min(45, 15 + 10 * Math.max(0, k - 1)) * MIN;
      s.etaFrom = round5(s.eta - spread);
      s.etaTo = round5(s.eta + spread);
    }
    if (s.at) from = s.at;
  });
  return { crew, day, lead, stops, van: vanToday, vanFresh, started, trail: (trail ?? []).map(([a, b]) => [a, b]) };
}

const round5 = (t: number) => Math.round(t / (5 * MIN)) * 5 * MIN;

/** "-04:00" or "-05:00" for a day in Eastern time. */
function etOffset(day: string) {
  const noon = new Date(`${day}T12:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(noon));
  return `-${String(12 - h).padStart(2, "0")}:00`;
}

// ---------- customer links ----------

export function appOrigin(fallback = "") {
  const prod = process.env.APP_URL?.replace(/\/$/, "") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return prod || fallback;
}

type TokenRec = { jobId: string; createdAt: number };

/** The customer's link for one visit, made the first time anyone asks for it. */
export async function linkToken(jobId: string): Promise<string> {
  const have = await kvGet<string>(JOB_TOKEN(jobId));
  if (have) return have;
  const t = randomBytes(9).toString("base64url");
  await kvSet<TokenRec>(TOKEN(t), { jobId, createdAt: Date.now() });
  await kvSet(JOB_TOKEN(jobId), t);
  return t;
}
export async function linkTokens(jobIds: string[]) {
  const have = await kvGetMany<string>(jobIds.map(JOB_TOKEN));
  return Promise.all(jobIds.map((id, i) => have[i] ?? linkToken(id)));
}
export const linkUrl = (token: string, origin = "") => `${appOrigin(origin)}/t/${token}`;

export type PublicView =
  | { state: "gone" }
  | { state: "future"; day: string; start: string; allDay: boolean; kind: Job["kind"]; lead: string }
  | { state: "today"; kind: Job["kind"]; lead: string; status: StopStatus | "waiting"; ahead: number; etaFrom?: number; etaTo?: number; eta?: number;
      doneToday: number; home: P | null; van: (P & { at: number }) | null; arrivedAt?: number; completedAt?: number; updatedAt: number };

/** What a customer's link shows: their own home and ETA, the van to within a mile, and a count of homes. */
export async function publicView(token: string): Promise<PublicView> {
  const rec = await kvGet<TokenRec>(TOKEN(String(token).slice(0, 40)));
  if (!rec) return { state: "gone" };
  const [all, users] = await Promise.all([getJobs(), listUsers()]);
  const job = all[rec.jobId];
  if (!job || !job.crew) return { state: "gone" };
  const today = etDay();
  const day = etDay(job.start);
  const lead = users.find((u) => u.active && u.role === "lead" && u.crew === job.crew)?.name || "Your crew";
  if (day > today) return { state: "future", day, start: job.start, allDay: isMidnight(job.start), kind: job.kind, lead };
  // Two days after the visit the link stops showing anything.
  if (Date.parse(`${day}T12:00:00Z`) < Date.parse(`${today}T12:00:00Z`) - 2 * 86400_000) return { state: "gone" };
  const cd = await crewDay(job.crew, day, { all, users });
  const me = cd.stops.find((s) => s.jobId === job.id);
  if (!me) return { state: "gone" };
  const done = cd.stops.filter((s) => s.status === "done").length;
  if (day < today && me.status !== "done") return { state: "gone" };
  const showVan = day === today && cd.vanFresh && me.status !== "done";
  return {
    state: "today", kind: job.kind, lead, status: me.status === "later" && !cd.started ? "waiting" : me.status,
    ahead: me.ahead, eta: me.eta, etaFrom: me.etaFrom, etaTo: me.etaTo, doneToday: done,
    home: me.at ?? null,
    // Rounded to two decimals (under a mile), so the dot never points at the home they're working on.
    van: showVan ? { lat: Math.round(cd.van!.lat * 100) / 100, lng: Math.round(cd.van!.lng * 100) / 100, at: cd.van!.at } : null,
    arrivedAt: me.arrivedAt, completedAt: me.completedAt, updatedAt: Date.now(),
  };
}

// ---------- the text with the link ----------

const work = (k: Job["kind"]) => (k === "takedown" ? "taking down holiday lights" : k === "fix" ? "coming by to look at your lights" : "putting up holiday lights");

export function linkText(first: string | null, lead: string, kind: Job["kind"], url: string) {
  return `Hi${first ? ` ${first}` : ""}, it's Light DMV. ${lead}'s crew is ${work(kind)} today and your home is on the list. Watch them work through the day and see when they'll get to you: ${url}`;
}

export type LinkSend = { at: number; by: string; ok: boolean; error?: string; auto?: boolean };
export const getSends = async (jobIds: string[]) => (await kvGetMany<LinkSend[]>(jobIds.map(SENT))).map((x) => x ?? []);

export async function sendLink(job: Job, lead: string, by: string, origin = "", auto = false): Promise<LinkSend> {
  const entry: LinkSend = { at: Date.now(), by, ok: false, auto };
  try {
    if (!job.jobberJobId) throw new Error("This job isn't from Jobber, so there's no customer to text.");
    const c = await clientFor(job.jobberJobId);
    if (!c) throw new Error("Jobber didn't return the customer on this job.");
    const phone = pickPhone(rows(c.phones));
    if (!phone) throw new Error("The customer has no phone number in Jobber.");
    const first = c.isCompany ? null : String(c.firstName || String(c.name || "").split(/\s+/)[0] || "").trim() || null;
    const url = linkUrl(await linkToken(job.id), origin);
    await ghlSendSms({ phone, firstName: c.firstName || first || undefined, name: c.name || undefined }, linkText(first, lead, job.kind, url));
    entry.ok = true;
  } catch (e: any) {
    entry.error = String(e.message || e).slice(0, 300);
  }
  await kvUpdate<LinkSend[]>(SENT(job.id), [], (cur) => { cur.push(entry); return cur.slice(-10); });
  return entry;
}

/** When the switch is on: the first time a crew's phone checks in during the day (7 AM to 6 PM), every customer
 *  still to come that day gets their link, once. */
export async function autoTextIfDue(crew: string, origin = "") {
  const day = etDay();
  const h = etHour();
  if (h < 7 || h >= 18) return 0;
  if (!(await getSettings()).autoText || (await kvGet<number>(AUTO(crew, day)))) return 0;
  await kvSet(AUTO(crew, day), Date.now());
  const cd = await crewDay(crew, day);
  const todo = cd.stops.filter((s) => s.status !== "done");
  const sent = await getSends(todo.map((s) => s.jobId));
  const all = await getJobs();
  let n = 0;
  for (let i = 0; i < todo.length; i++) {
    if (sent[i].some((x) => x.ok)) continue;
    const job = all[todo[i].jobId];
    if (job?.source !== "jobber") continue;
    if ((await sendLink(job, cd.lead, "Automatic", origin, true)).ok) n++;
  }
  return n;
}
