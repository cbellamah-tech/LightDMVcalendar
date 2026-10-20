import { kvGet, kvSet, kvUpdate } from "./store";
import { etDay } from "./marketing";
import { GhlAccount, getGhlSnap, ghl, ghlAccounts, ghlConfigured, expireGhlSnap, loc } from "./ghl";
import { driveFileBytes, driveLibrary, DriveItem, drivePhotoJpeg, googleStatus } from "./google";
import { getMedia, Platform, storage } from "./media";
import { laterOnce } from "./background";
import { postMedia, postToPlatforms, PostResult } from "./autopost";

/* Social posts: GoHighLevel Social Planner's numbers per day, platform and account (the "Total posts" table),
   and the Post screen: pick a daily reel or a Drive photo or video, write the words, tap Post. Nothing posts by itself here. */

export type StatRow = {
  day: string; platform: string; account: string;
  posts: number; likes: number; impressions: number; followers: number;
};
/** GoHighLevel only gives comments, shares and reach as last-7-day totals. */
export type WeekRow = {
  platform: string; account: string;
  posts: number; likes: number; comments: number; shares: number; impressions: number; reach: number; followers: number;
};
export type SocialStats = { at: number; rows: Record<string, StatRow>; week: WeekRow[]; weekEnds?: string; errors: string[] };

const STATS = "ldmv:social:stats";
const LIB = "ldmv:social:library";
const COPIES = "ldmv:social:copies";
const LOG = "ldmv:social:log";

export const getSocialStats = async (): Promise<SocialStats> => (await kvGet<SocialStats>(STATS)) ?? { at: 0, rows: {}, week: [], errors: [] };

const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The dates of GoHighLevel's 7-day series: it labels days by name only, ending today or yesterday. */
function seriesDays(names: string[]): string[] {
  const n = names.length || 7;
  const today = etDay(Date.now());
  const dow = (d: string) => DAY_NAMES[new Date(`${d}T12:00:00Z`).getUTCDay()];
  const back = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) - k * 86400_000).toISOString().slice(0, 10);
  const last = String(names[n - 1] ?? "").slice(0, 3);
  const end = !last || dow(today) === last ? today : dow(back(today, 1)) === last ? back(today, 1) : today;
  return Array.from({ length: n }, (_, i) => back(end, n - 1 - i));
}

const scopeHelp = (e: any) =>
  /\((401|403)\)/.test(e.message)
    ? `GoHighLevel refused the Social Planner numbers. In GoHighLevel, Settings > Private Integrations, edit the app's key and tick the Social Planner statistics box (View Social Planner Statistics).`
    : e.message;

/** One account's last 7 days. */
async function accountStats(a: GhlAccount) {
  const j = await ghl(`/social-media-posting/statistics?locationId=${encodeURIComponent(loc())}`, {
    method: "POST",
    body: { profileIds: [a.profileId || a.id], platforms: [a.platform] },
  });
  const r = j?.results ?? j ?? {};
  const p = a.platform;
  const days = seriesDays(r.dayRange ?? []);
  const series = (x: any) => (Array.isArray(x) ? x.map(num) : []);
  const postsS = series(r.postPerformance?.posts?.[p]);
  const likesS = series(r.platformTotals?.likes?.[p]?.series);
  const implS = series(r.platformTotals?.impressions?.[p]?.series);
  let follS = series(r.platformTotals?.followers?.[p]?.series);
  // Followers may come as a running total per day instead of new followers per day: turn that into the daily change.
  const follTotal = num(r.platformTotals?.followers?.[p]?.total);
  if (follS.length > 1 && follS[follS.length - 1] === follTotal && follS.reduce((s2, x) => s2 + x, 0) > follTotal * 1.5)
    follS = follS.map((x, i) => (i ? x - follS[i - 1] : 0));
  const rows: StatRow[] = days.map((day, i) => ({
    day, platform: p, account: a.name,
    posts: postsS[i] ?? 0, likes: likesS[i] ?? 0, impressions: implS[i] ?? 0, followers: follS[i] ?? 0,
  }));
  const eng = r.breakdowns?.engagement?.[p] ?? {};
  const week: WeekRow = {
    platform: p, account: a.name,
    posts: num(r.breakdowns?.posts?.platforms?.[p]?.value ?? postsS.reduce((s, x) => s + x, 0)),
    likes: num(eng.likes ?? r.platformTotals?.likes?.[p]?.total),
    comments: num(eng.comments), shares: num(eng.shares),
    impressions: num(r.breakdowns?.impressions?.platforms?.[p]?.value ?? r.platformTotals?.impressions?.[p]?.total),
    reach: num(r.breakdowns?.reach?.platforms?.[p]?.value),
    followers: num(r.platformTotals?.followers?.[p]?.total),
  };
  return { rows, week, end: days[days.length - 1] };
}

/** Pull the last 7 days for every account and fold them into the saved history (newer numbers win: likes keep coming in). */
export async function refreshSocialStats(): Promise<SocialStats> {
  const cur = await getSocialStats();
  if (!ghlConfigured()) return cur;
  const errors: string[] = [];
  const accts = await ghlAccounts().catch((e) => { errors.push(e.message); return (getGhlSnap().then((s) => s?.accounts ?? [])); });
  const rows = { ...cur.rows };
  const week: WeekRow[] = [];
  let weekEnds = cur.weekEnds;
  for (const a of accts.filter((x) => !x.expired)) {
    try {
      const s = await accountStats(a);
      for (const r of s.rows) rows[`${r.day}|${r.platform}|${r.account}`] = r;
      week.push(s.week);
      weekEnds = s.end;
    } catch (e: any) {
      const msg = scopeHelp(e);
      if (!errors.includes(msg)) errors.push(msg);
    }
  }
  // Keep about a year and a half.
  const cutoff = etDay(Date.now() - 550 * 86400_000);
  for (const k of Object.keys(rows)) if (k.slice(0, 10) < cutoff) delete rows[k];
  const out: SocialStats = { at: Date.now(), rows, week: week.length ? week : cur.week, weekEnds, errors };
  await kvSet(STATS, out);
  return out;
}

/* ---------- The library: daily reels plus Drive photos and videos ---------- */

export type Library = { at: number; items: DriveItem[]; error?: string };
export const getLibrary = async (): Promise<Library> => (await kvGet<Library>(LIB)) ?? { at: 0, items: [] };

export async function refreshLibrary(): Promise<Library> {
  const cur = await getLibrary();
  if (!(await googleStatus()).connected) return { ...cur, error: "Google isn't connected (Setup at the bottom of Marketing)." };
  try {
    const out = { at: Date.now(), items: await driveLibrary() };
    await kvSet(LIB, out);
    return out;
  } catch (e: any) {
    const out = { ...cur, at: Date.now(), error: e.message };
    await kvSet(LIB, out);
    return out;
  }
}

/** Saved numbers and list straight away; anything older than a few hours refreshes after the answer goes out. */
export async function socialPage(force = false) {
  const [stats, lib] = await Promise.all([getSocialStats(), getLibrary()]);
  const stale = (at: number, ms: number) => Date.now() - at > ms;
  if (force || stale(stats.at, 3 * 3600_000)) await laterOnce("social-stats", refreshSocialStats);
  if (force || stale(lib.at, 6 * 3600_000)) await laterOnce("social-library", refreshLibrary);
  return { stats, lib, refreshing: force || stale(stats.at, 3 * 3600_000) || stale(lib.at, 6 * 3600_000) };
}

/* ---------- Posting a Drive file ---------- */

const MAX_VIDEO = 100 * 1024 * 1024;

/** GoHighLevel needs a public link: copy the Drive file into the app's photo store once, then reuse the link. */
export async function publicCopy(item: DriveItem): Promise<{ url: string; contentType: string }> {
  const copies = (await kvGet<Record<string, { url: string; contentType: string }>>(COPIES)) ?? {};
  if (copies[item.id]) return copies[item.id];
  const s = storage();
  if (!s) throw new Error("The app's photo store isn't set up, so it can't share the file.");
  let body: ArrayBuffer, contentType: string, ext: string;
  if (item.kind === "photo") {
    const r = await drivePhotoJpeg(item.id, 2048);
    body = await r.arrayBuffer(); contentType = "image/jpeg"; ext = "jpg";
  } else {
    if ((item.bytes ?? 0) > MAX_VIDEO) throw new Error("That video is over 100 MB. Trim it on the phone and drop the shorter one in Drive.");
    body = await driveFileBytes(item.id, MAX_VIDEO);
    contentType = item.mimeType || "video/mp4"; ext = /quicktime/.test(contentType) ? "mov" : "mp4";
  }
  const path = `social/${item.id}.${ext}`;
  const { error } = await s.upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Couldn't copy the file for posting: ${error.message}`);
  const out = { url: s.getPublicUrl(path).data.publicUrl, contentType };
  await kvUpdate<Record<string, { url: string; contentType: string }>>(COPIES, {}, (c) => { c[item.id] = out; });
  return out;
}

export type SocialLog = { at: number; by: string; source: "drive" | "reel"; id: string; title: string; thumb: string; platforms: string[]; errors?: string };
export const getSocialLog = async () => (await kvGet<SocialLog[]>(LOG)) ?? [];

export async function postFromLibrary(src: { source: "drive" | "reel"; id: string }, want: Platform[], captions: Partial<Record<Platform, string>>, by: string): Promise<PostResult[]> {
  if (!want.length) throw new Error("Pick at least one place to post.");
  let results: PostResult[], title: string, thumb: string;
  const fallback = captions.facebook || Object.values(captions).find(Boolean) || "";
  if (src.source === "reel") {
    const m = (await getMedia()).find((x) => x.id === src.id && x.status === "ready");
    if (!m) throw new Error("That reel isn't ready.");
    title = m.title; thumb = m.stills?.[0] ?? "";
    // Through the reel itself, so Today's post shows it as posted and Auto-post never sends it again.
    results = await postMedia(m, want, by, Object.fromEntries(want.map((p) => [p, String(captions[p] || fallback || m.captions[p] || m.title)])));
  } else {
    const item = (await getLibrary()).items.find((x) => x.id === src.id);
    if (!item) throw new Error("That file isn't in the Drive list any more. Tap refresh and pick again.");
    title = item.name; thumb = `/api/marketing/social/thumb?id=${encodeURIComponent(item.id)}`;
    const media = await publicCopy(item);
    results = await postToPlatforms(media, want, (p) => String(captions[p] || fallback));
    await expireGhlSnap();
  }
  const ok = results.filter((r) => r.ok).map((r) => r.platform);
  const errors = results.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error}`).join("; ");
  await kvUpdate<SocialLog[]>(LOG, [], (l) => [{ at: Date.now(), by, source: src.source, id: src.id, title, thumb, platforms: ok, errors: errors || undefined }, ...l].slice(0, 200));
  return results;
}
