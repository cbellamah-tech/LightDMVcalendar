import { kvGet, kvUpdate } from "./store";
import { getMedia } from "./media";

/* Craigslist ads, one per area. Craigslist has no posting API and blocks bots (accounts get banned, ads ghosted),
   so the app writes a fresh ad for each area every week, says which one is due, and someone posts it by hand:
   copy, open, paste, add the photos, post, tap Posted. Tapping Posted counts it in the campaign sheet. */

export type ClArea = {
  id: "doc" | "nva" | "mld";
  label: string;
  subarea: string;       // what to pick on Craigslist's "choose the area" step
  zip: string;           // a ZIP for the "postal code" box
  towns: string[];
};
export const CL_AREAS: ClArea[] = [
  { id: "doc", label: "DC", subarea: "district of columbia", zip: "20016",
    towns: ["Georgetown", "Capitol Hill", "Spring Valley", "Chevy Chase DC", "Cleveland Park", "Foxhall", "Woodley Park", "Palisades", "AU Park", "Kent"] },
  { id: "nva", label: "Northern Virginia", subarea: "northern virginia", zip: "22101",
    towns: ["McLean", "Arlington", "Alexandria", "Vienna", "Falls Church", "Great Falls", "Reston", "Ashburn", "Herndon", "Fairfax", "Oakton"] },
  { id: "mld", label: "Maryland", subarea: "maryland", zip: "20814",
    towns: ["Bethesda", "Potomac", "Rockville", "Silver Spring", "Chevy Chase", "Gaithersburg", "Germantown", "North Bethesda", "Kensington", "Olney"] },
];
export const CL_POST_URL = "https://post.craigslist.org/c/wdc";
export const CL_CATEGORY = "service offered, then household services";
export const CL_REPOST_DAYS = 7;
export const clCheckUrl = (a: ClArea) => `https://washingtondc.craigslist.org/search/${a.id}/bbb?query=${encodeURIComponent("light dmv")}`;

const PHONE = "(703) 951-5100";
const SITE = "lightdmv.com";

/* Wording pieces. Each week every area gets a different mix, so no two ads (and no two weeks) read the same:
   Craigslist hides repeated text. */
const TITLES = [
  "Christmas Light Installation in {towns} - Free Quote",
  "Holiday Lights Hung For You - {towns}",
  "Professional Christmas Lights, Installed and Taken Down - {area}",
  "Skip the Ladder: Christmas Light Install in {towns}",
  "Local Holiday Lighting Crew Booking Now - {area}",
  "Roofline, Tree and Wreath Lighting - {towns}",
];
const OPENERS = [
  "Light DMV is a local crew that designs, installs and takes down holiday lights for homes in {towns} and nearby.",
  "Want the house lit up this year without getting on a ladder? Light DMV hangs Christmas lights across {area}.",
  "We're Light DMV, a fully insured local team putting up Christmas lights in {towns} and the rest of {area}.",
  "Booking now for November installs in {towns}. Light DMV handles your holiday lights from start to finish.",
];
const INCLUDED = [
  "Custom design for your home",
  "Commercial-grade LED lights (we bring them)",
  "Timers set so they come on by themselves",
  "Free fixes all season if anything goes out",
  "January takedown and storage until next year",
  "Rooflines, trees, bushes, pillars, railings and wreaths",
  "Fully insured crews",
];
const CLOSERS = [
  "December fills up fast, so book early. Free quote at {site} or call {phone}.",
  "Get a free quote in a day: {site} or call or text {phone}.",
  "Most homes are done in one visit. Free quote at {site}, or call {phone}.",
  "Send us your address for a free quote: {site} or {phone}.",
];

/** Week number since 2026-01-05 (a Monday), Eastern-ish. */
const weekNo = (t: number) => Math.floor((t - Date.UTC(2026, 0, 5, 5)) / (7 * 86400_000));
const pick = <T,>(xs: T[], n: number) => xs[((n % xs.length) + xs.length) % xs.length];

export function clAd(a: ClArea, t = Date.now()) {
  const w = weekNo(t) + CL_AREAS.indexOf(a) * 2;
  const towns = [0, 1, 2].map((k) => pick(a.towns, w * 3 + k)).filter((x, i, xs) => xs.indexOf(x) === i);
  const fill = (s: string) => s.replace("{towns}", towns.slice(0, 2).join(", ")).replace("{area}", a.label).replace("{site}", SITE).replace("{phone}", PHONE);
  const items = [0, 1, 2, 3, 4].map((k) => pick(INCLUDED, w + k));
  const body = [
    fill(pick(OPENERS, w)),
    "",
    "What you get:",
    ...items.map((x) => `- ${x}`),
    "",
    `Serving ${towns.join(", ")} and all of ${a.label}.`,
    fill(pick(CLOSERS, w + 1)),
  ].join("\n");
  return { title: fill(pick(TITLES, w)).slice(0, 70), body };
}

/* ---------- What's been posted ---------- */

export type ClPost = { area: ClArea["id"]; at: number; by: string; title: string };
const KEY = "ldmv:mkt:craigslist";

export const getClPosts = async () => (await kvGet<ClPost[]>(KEY)) ?? [];
export async function addClPost(p: ClPost) {
  await kvUpdate<ClPost[]>(KEY, [], (all) => [p, ...all].slice(0, 300));
}

/** Each area with this week's ad, when it was last posted, and whether it's due again. Photos come from the latest daily reels. */
export async function craigslistView() {
  const [posts, media] = await Promise.all([getClPosts(), getMedia()]);
  const now = Date.now();
  const areas = CL_AREAS.map((a) => {
    const last = posts.find((p) => p.area === a.id);
    const daysSince = last ? Math.floor((now - last.at) / 86400_000) : null;
    return {
      id: a.id, label: a.label, subarea: a.subarea, zip: a.zip, checkUrl: clCheckUrl(a),
      ad: clAd(a, now),
      last: last ? { at: last.at, by: last.by } : null,
      due: daysSince === null || daysSince >= CL_REPOST_DAYS,
      dueIn: daysSince === null ? 0 : Math.max(0, CL_REPOST_DAYS - daysSince),
    };
  });
  const photos = media.flatMap((m) => m.stills ?? []).filter((u, i, xs) => xs.indexOf(u) === i).slice(0, 8);
  const monthStart = new Date(new Date(now).toISOString().slice(0, 7) + "-01T05:00:00Z").getTime();
  return {
    areas, photos, postUrl: CL_POST_URL, category: CL_CATEGORY, phone: PHONE, repostDays: CL_REPOST_DAYS,
    thisMonth: posts.filter((p) => p.at >= monthStart).length,
    recent: posts.slice(0, 10).map((p) => ({ ...p, label: CL_AREAS.find((a) => a.id === p.area)?.label ?? p.area })),
  };
}
