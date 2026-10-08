import { randomBytes, timingSafeEqual } from "node:crypto";
import { kvGet, kvSet, kvUpdate } from "./store";
import { getVisits } from "./signs";

/* Marketing tab: what went out each week, against the goals in the "2026 Marketing Campaign" sheet.
   Counts come from the app itself (yard sign visits), from people tapping +1, from bots posting to the
   drop box, and from GoHighLevel's Social Planner when it's connected. */

export type ChannelId =
  | "google_posts" | "facebook_posts" | "fb_groups" | "marketplace" | "craigslist" | "linkedin_posts"
  | "linkedin_engage" | "instagram_posts" | "nextdoor" | "blog" | "cold_emails" | "yard_signs"
  | "door_hangers" | "tree_shop_cards" | "eddm" | "door_to_door" | "car_magnets" | "bing_posts"
  | "fb_ads" | "google_ads" | "google_lsa" | "influencers";

export type BoxId = "signs" | "social" | "listings" | "website" | "paid" | "cold";

export type Channel = {
  id: ChannelId;
  label: string;
  sheetRow: string;       // the row's name in column A of the campaign sheet
  monthlyGoal?: number;   // from the sheet's "Monthly project goals" column
  box: BoxId;
  bot?: string;           // the bot that looks after it
  auto?: "signs" | "ghl" | "smartlead" | "ads"; // counted without anyone tapping ("ads" = dollars spent)
  ghlPlatform?: string;   // GoHighLevel Social Planner platform name
  adSource?: "facebook" | "google" | "lsa";
  link?: string;          // where the thing itself lives: tapping its name opens this
};

// Goals as they stood in the 2026 sheet on 2026-10-07.
export const CHANNELS: Channel[] = [
  { id: "yard_signs", label: "Yard signs", sheetRow: "Yard Signs", monthlyGoal: 1200, box: "signs", auto: "signs", link: "/signs" },
  { id: "door_hangers", label: "Door hangers", sheetRow: "Door Hangers", monthlyGoal: 300, box: "signs" },
  { id: "tree_shop_cards", label: "Tree shop business cards", sheetRow: "Christmas Tree Shops Giving Biz cards", monthlyGoal: 20, box: "signs" },
  { id: "eddm", label: "Direct mail (EDDM)", sheetRow: "Direct Mail (EDDM)", box: "signs", link: "https://eddm.usps.com/eddm/select-routes.htm" },
  // In the company SOP (Part 3) but not rows in the 2026 sheet: counted in the app only.
  { id: "door_to_door", label: "Door-to-door after jobs", sheetRow: "Door to Door", box: "signs" },
  { id: "car_magnets", label: "Car magnets out", sheetRow: "Car Magnets", box: "signs" },
  { id: "google_posts", label: "Google Business posts", sheetRow: "Google Image Posting (Automated)", monthlyGoal: 28, box: "social", bot: "SEO", auto: "ghl", ghlPlatform: "google", link: "https://business.google.com/locations" },
  { id: "facebook_posts", label: "Facebook Page posts", sheetRow: "Facebook Account Posting (Automated)", monthlyGoal: 28, box: "social", bot: "CMO", auto: "ghl", ghlPlatform: "facebook", link: "https://business.facebook.com/latest/content_calendar" },
  { id: "instagram_posts", label: "Instagram posts", sheetRow: "Instagram Posting", monthlyGoal: 4, box: "social", bot: "CMO", auto: "ghl", ghlPlatform: "instagram", link: "https://www.instagram.com/" },
  { id: "linkedin_posts", label: "LinkedIn posts", sheetRow: "LinkedIn Posting", monthlyGoal: 4, box: "social", bot: "CMO", auto: "ghl", ghlPlatform: "linkedin", link: "https://www.linkedin.com/feed/" },
  { id: "bing_posts", label: "Bing Places posts", sheetRow: "Bing Posting", box: "social", link: "https://www.bingplaces.com/Dashboard" },
  { id: "linkedin_engage", label: "LinkedIn comments and follows", sheetRow: "LinkedIn Commenting Following", monthlyGoal: 100, box: "social", link: "https://www.linkedin.com/feed/" },
  { id: "fb_groups", label: "Facebook Groups posts", sheetRow: "Facebook Groups Posting", monthlyGoal: 10, box: "listings", link: "https://www.facebook.com/groups/feed/" },
  { id: "marketplace", label: "Marketplace listings", sheetRow: "FB marketplace posting", monthlyGoal: 5, box: "listings", link: "https://www.facebook.com/marketplace/you/selling" },
  { id: "craigslist", label: "Craigslist ads", sheetRow: "Craigslist Posting", monthlyGoal: 5, box: "listings", link: "https://accounts.craigslist.org/login/home" },
  { id: "nextdoor", label: "Nextdoor posts", sheetRow: "Nextdoor Posting", monthlyGoal: 4, box: "listings", link: "https://nextdoor.com/news_feed/" },
  { id: "blog", label: "Blog posts and city pages", sheetRow: "Blog Posting (Automated)", monthlyGoal: 5, box: "website", bot: "Website", link: "https://lightdmv.com/blog" },
  { id: "fb_ads", label: "Facebook ads ($ spent)", sheetRow: "FB Ads", box: "paid", bot: "Paid", auto: "ads", adSource: "facebook", link: "https://adsmanager.facebook.com/adsmanager/manage/campaigns" },
  { id: "google_ads", label: "Google ads ($ spent)", sheetRow: "Google Ads", box: "paid", bot: "Paid", auto: "ads", adSource: "google", link: "https://ads.google.com/aw/overview" },
  { id: "google_lsa", label: "Google Local Services ($ spent)", sheetRow: "Google LSA", box: "paid", bot: "Paid", auto: "ads", adSource: "lsa", link: "https://ads.google.com/localservices/" },
  { id: "influencers", label: "Local influencer sponsorships", sheetRow: "Local Influencer Sponsorships", box: "paid" },
  { id: "cold_emails", label: "Cold emails", sheetRow: "Cold Emails", monthlyGoal: 5000, box: "cold", auto: "smartlead", link: "https://app.smartlead.ai/client-login" },
];

export const BOXES: { id: BoxId; title: string; line: string; bots: string[]; link?: string }[] = [
  { id: "signs", title: "Yard signs and in person", line: "Signs, door hangers, tree lots, door-to-door", bots: [] },
  { id: "social", title: "Social posts", line: "Facebook, Instagram, LinkedIn, Google, via GoHighLevel", bots: ["CMO", "SEO"] },
  { id: "listings", title: "One-tap listings", line: "Craigslist, Marketplace, FB Groups, Nextdoor", bots: [] },
  { id: "website", title: "Website and SEO", line: "LightDMV.com city pages, blog, reviews", bots: ["Website", "SEO"] },
  { id: "paid", title: "Paid ads", line: "Facebook ads (Goohoo) and Google ads", bots: ["Paid"] },
  { id: "cold", title: "Cold email", line: "Smartlead, run by the agency", bots: [], link: "https://app.smartlead.ai/client-login" },
];

export const channel = (id: string) => CHANNELS.find((c) => c.id === id);

/* ---------- Weeks (Monday to Sunday, Eastern time) ---------- */

const ET = "America/New_York";
/** "YYYY-MM-DD" for a moment, in Eastern time. */
export function etDay(t: number | Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  return p; // en-CA formats as YYYY-MM-DD
}
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400_000;
const fromNum = (n: number) => new Date(n * 86400_000).toISOString().slice(0, 10);
/** The Monday that starts the week holding this day. */
export function weekOf(day: string): string {
  const n = dayNum(day);
  const dow = (new Date(n * 86400_000).getUTCDay() + 6) % 7; // Monday = 0
  return fromNum(n - dow);
}
export const addDays = (day: string, k: number) => fromNum(dayNum(day) + k);
export const daysOf = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** The sheet splits each month into 4 week columns; days 29 to 31 go in week 4. */
export const sheetWeek = (day: string) => Math.min(4, Math.ceil(+day.slice(8, 10) / 7));

/* ---------- Logged counts ---------- */

export type CountEvent = { id: string; channel: ChannelId; n: number; day: string; at: number; by: string; note?: string; via: "tap" | "bot" };
const EVENTS = "ldmv:mkt:events";

export const getEvents = async () => (await kvGet<CountEvent[]>(EVENTS)) ?? [];

export async function logCount(e: Omit<CountEvent, "id" | "at" | "day"> & { day?: string }) {
  const ev: CountEvent = { ...e, id: randomBytes(6).toString("hex"), at: Date.now(), day: e.day ?? etDay(Date.now()) };
  await kvUpdate<CountEvent[]>(EVENTS, [], (all) => [ev, ...all].slice(0, 5000));
  return ev;
}

export async function undoCount(id: string) {
  await kvUpdate<CountEvent[]>(EVENTS, [], (all) => all.filter((e) => e.id !== id));
}

/** Per channel, per day: everything the app knows about. GHL posts and ad spend are passed in by the caller. */
export async function dailyCounts(ghlPosts: { platform: string; day: string }[] = [], adSpend: { source: string; day: string; spend: number }[] = [], events?: CountEvent[]) {
  const out = new Map<string, number>(); // `${channel}|${day}`
  const add = (c: ChannelId, day: string, n: number) => out.set(`${c}|${day}`, (out.get(`${c}|${day}`) ?? 0) + n);
  const [evs, visits] = await Promise.all([events ?? getEvents(), getVisits()]);
  for (const e of evs) add(e.channel, e.day, e.n);
  for (const list of Object.values(visits))
    for (const v of list) if (v.status === "placed" || v.status === "replaced") add("yard_signs", etDay(v.at), 1);
  for (const p of ghlPosts) {
    const c = CHANNELS.find((x) => x.ghlPlatform && p.platform.toLowerCase().includes(x.ghlPlatform));
    if (c) add(c.id, p.day, 1);
  }
  for (const a of adSpend) {
    const c = CHANNELS.find((x) => x.adSource === a.source);
    if (c) add(c.id, a.day, Math.round(a.spend));
  }
  return out;
}

export function weekTotals(daily: Map<string, number>, monday: string) {
  const days = daysOf(monday);
  return Object.fromEntries(CHANNELS.map((c) => [c.id, days.reduce((s, d) => s + (daily.get(`${c.id}|${d}`) ?? 0), 0)])) as Record<ChannelId, number>;
}

/* ---------- Bot drop box ---------- */

export type BotArea = "marketing" | "owners";
// Who reports where (chris's bots as of 2026-10-07). Unknown bots land on Marketing.
export const BOT_AREA: Record<string, BotArea> = {
  CMO: "marketing", SEO: "marketing", Paid: "marketing", Website: "marketing", GHL: "marketing", Inbox: "marketing", Jobber: "marketing",
  CEO: "owners", CFO: "owners", Tax: "owners",
};
export const areaFor = (bot: string) => BOT_AREA[Object.keys(BOT_AREA).find((k) => k.toLowerCase() === bot.toLowerCase()) ?? ""] ?? "marketing";

export type FeedItem = {
  id: string;
  bot: string;
  area: BotArea;
  title: string;
  body?: string;
  link?: string;
  at: number;
  ask?: string;            // a yes/no (or pick one) question for an owner
  options?: string[];
  answer?: { value: string; by: string; at: number; note?: string };
  dismissed?: boolean;
};

const FEED = "ldmv:mkt:feed";
const KEY = "ldmv:mkt:botkey";

export const getFeed = async () => (await kvGet<FeedItem[]>(FEED)) ?? [];

export async function addFeed(item: Omit<FeedItem, "id" | "at" | "area"> & { area?: BotArea }) {
  const it: FeedItem = { ...item, area: item.area ?? areaFor(item.bot), id: randomBytes(6).toString("hex"), at: Date.now() };
  await kvUpdate<FeedItem[]>(FEED, [], (all) => [it, ...all].slice(0, 500));
  return it;
}

export async function answerFeed(id: string, patch: Partial<Pick<FeedItem, "answer" | "dismissed">>) {
  let found: FeedItem | undefined;
  await kvUpdate<FeedItem[]>(FEED, [], (all) => all.map((f) => (f.id === id ? (found = { ...f, ...patch }) : f)));
  return found;
}

/** The drop box key, made the first time an owner looks. Bots send it as "Authorization: Bearer <key>". */
export async function botKey(rotate = false): Promise<string> {
  const cur = await kvGet<string>(KEY);
  if (cur && !rotate) return cur;
  const k = `ldmv_${randomBytes(24).toString("hex")}`;
  await kvSet(KEY, k);
  return k;
}

export async function checkBotKey(header: string | null) {
  const cur = await kvGet<string>(KEY);
  const got = header?.replace(/^Bearer\s+/i, "").trim();
  return !!cur && !!got && got.length === cur.length && timingSafeEqual(Buffer.from(got), Buffer.from(cur));
}
