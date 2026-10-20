import { randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { kvGet, kvSet, kvUpdate } from "./store";
import { etDay } from "./marketing";
import { expireGhlSnap, getGhlSnap, ghlConfigured, ghlPostNow } from "./ghl";
import { getLibrary, publicCopy } from "./social";
import { usedPhotoIds } from "./media";
import { aiKey } from "./cxSummary";

/* LinkedIn: a post written ahead for each posting day (Tuesday, or Tuesday and Thursday), each with a Drive photo.
   Nothing posts until an owner or the manager taps Approve; approved posts go out on their day through GoHighLevel's
   Social Planner (the 14:00 UTC cron in vercel.json), or straight away with Post now.
   Words come from Claude when the app has a Claude key, otherwise from the starters below. */

export type LiStatus = "draft" | "approved" | "posted" | "skipped" | "failed";
export type LiPost = {
  id: string;
  day: string;                       // the day it goes out (Eastern)
  theme: string;
  text: string;
  photo?: { id: string; name: string };
  status: LiStatus;
  writer: "claude" | "starter";
  approved?: { at: number; by: string };
  posted?: { at: number; by: string; accounts: string[] };
  error?: string;
  edited?: boolean;
};
export type LiSettings = { perWeek: 1 | 2 };

const QUEUE = "ldmv:li:queue";
const SETTINGS = "ldmv:li:settings";
const USED = "ldmv:li:used";        // Drive photo id -> when LinkedIn used it
const AHEAD = 4;                    // posting days kept written ahead
const MODEL = "claude-opus-5-5";

const SITE = "lightdmv.com";
const PHONE = "(703) 951-5100";

/* ---------- What the posts are about ---------- */

type Theme = { id: string; label: string; months: number[]; photo?: RegExp; brief: string; starter: string };
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const THEMES: Theme[] = [
  {
    id: "commercial", label: "Businesses and HOAs", months: [8, 9, 10, 11], photo: /commercial|office|store|shop|restaurant|hoa|entrance|church/i,
    brief: "Holiday lighting for businesses, storefronts, offices and HOA entrances: it draws foot traffic and makes a property stand out. We design, install, maintain and take down.",
    starter: `Holiday lighting is one of the simplest ways for a business to stand out in December.\n\nLight DMV designs and installs commercial-grade lights for storefronts, offices, restaurants and HOA entrances across DC, Maryland and Northern Virginia. We handle the design, the install, any fixes during the season and the takedown in January, so your team never touches a ladder.\n\nIf your property should be lit this year, now is the time to get on the calendar: ${SITE} or ${PHONE}.\n\n#HolidayLighting #CommercialLighting #DMVBusiness #SmallBusiness #PropertyManagement`,
  },
  {
    id: "property_managers", label: "Property managers", months: [8, 9, 10, 11], photo: /commercial|hoa|entrance|community|clubhouse/i,
    brief: "For property managers and HOA boards: one vendor for design, install, maintenance and takedown, insured, on schedule, one invoice.",
    starter: `Property managers and HOA boards: holiday lighting doesn't have to be another project to babysit.\n\nOne call to Light DMV covers the design, commercial-grade lights, install, service calls all season and January takedown. Our crews are trained and insured, and we work around your residents and your schedule.\n\nWe're booking November installs now across DC, MD and VA. ${SITE}\n\n#PropertyManagement #HOA #HolidayLighting #DMV #CommunityManagement`,
  },
  {
    id: "full_service", label: "Design to takedown", months: [9, 10, 11, 12], photo: /whole|house|roofline|finished|night/i,
    brief: "What full service means at Light DMV: custom design, commercial-grade lights we supply, install, timers, free fixes all season, January takedown and storage.",
    starter: `What "done for you" holiday lighting looks like:\n\n1. We design it around your home or building.\n2. We bring commercial-grade lights and timers.\n3. Our crew installs everything safely.\n4. If a strand goes out, we come fix it, all season.\n5. In January we take it all down and store it.\n\nThat's the whole job. You just enjoy it. ${SITE}\n\n#ChristmasLights #HolidayLighting #DMV #HomeServices #LocalBusiness`,
  },
  {
    id: "crew", label: "The crew", months: ALL, photo: /crew|team|install|ladder|truck|van/i,
    brief: "Behind the scenes with our install crews: early starts, ladders, careful work, pride in the finished house. Thank the crew.",
    starter: `Behind every lit-up house is a crew that started before sunrise.\n\nOur install teams spend the season on ladders and rooflines across the DMV, measuring, clipping and testing every run so it looks clean from the street and stays on all season. It's careful, physical work, and they take real pride in the moment a house lights up for the first time.\n\nProud of this team. If you know someone who'd like to join us next season, send them our way.\n\n#Teamwork #SkilledTrades #HolidayLighting #DMV #SmallBusiness`,
  },
  {
    id: "safety", label: "Safety and insurance", months: [9, 10, 11, 12], photo: /ladder|roof|install|crew/i,
    brief: "Why hiring insured, trained installers beats a homeowner on a ladder: ladder falls, overloaded circuits, roof damage. Our crews are trained and insured.",
    starter: `Every December, emergency rooms see a wave of holiday ladder falls.\n\nIt's one of the reasons people hire us. Light DMV crews are trained on ladder safety and roof work, we plan circuits so nothing overloads, and we use clips that don't damage gutters or shingles. And we're insured, so the risk isn't on you.\n\nStay off the ladder this year: ${SITE} or ${PHONE}.\n\n#Safety #HolidayLighting #HomeServices #DMV #ChristmasLights`,
  },
  {
    id: "showcase", label: "A recent install", months: [10, 11, 12], photo: /whole|house|roofline|night|finished|tree/i,
    brief: "Show off the photo: a recent Light DMV install somewhere in the DMV. Describe what's in it (rooflines, trees, wreaths, pillars) in general words. Never a customer's name or street.",
    starter: `Another one lit up in the DMV this week.\n\nRooflines, trees and a few finishing touches, all designed for the house and installed by our crew in a day. It's the part of the job we never get tired of: the first night the timer clicks on.\n\nWant yours on the list? ${SITE}\n\n#ChristmasLights #HolidayLighting #CurbAppeal #DMV #LocalBusiness`,
  },
  {
    id: "booking", label: "Book early", months: [9, 10, 11], photo: /whole|house|night/i,
    brief: "Install dates fill up: November is the sweet spot, December fills fast. Book now to get the date you want. No prices.",
    starter: `A quick heads-up for anyone in DC, Maryland or Virginia planning holiday lights this year: install dates fill up fast.\n\nMost people want their lights up by Thanksgiving weekend, and those November dates go first. Booking early gets you the date you want and more time to plan the design.\n\nFree quotes at ${SITE} or ${PHONE}.\n\n#HolidayLighting #ChristmasLights #DMV #PlanAhead #HomeServices`,
  },
  {
    id: "local", label: "Local company", months: ALL, photo: /whole|house|night|crew/i,
    brief: "Light DMV is a local DC, Maryland and Virginia company: local crews, we know the neighborhoods and the weather, we answer the phone.",
    starter: `Light DMV is a local company, and that matters in this business.\n\nOur crews live and work in DC, Maryland and Northern Virginia. We know the neighborhoods, the HOA rules and what December weather does to a roofline. When something needs a fix, a local crew comes out, and when you call, a real person answers.\n\nThank you to everyone who keeps supporting local. ${SITE}\n\n#ShopLocal #SmallBusiness #DMV #HolidayLighting #Community`,
  },
  {
    id: "thanks", label: "Thank you, season", months: [12, 1], photo: /whole|house|night|crew/i,
    brief: "Thank customers, crews and partners for the season. Warm, short, no sales push.",
    starter: `A big thank you to every family and business that trusted Light DMV this season, and to the crews who made it happen in the cold, the wind and the early dark.\n\nIt's a privilege to help light up so many homes across the DMV. Happy holidays from all of us.\n\n#Gratitude #HolidayLighting #SmallBusiness #DMV #Teamwork`,
  },
  {
    id: "takedown", label: "January takedown", months: [1, 2], photo: /takedown|bin|storage|crew/i,
    brief: "January takedown: we take every light down carefully, label it, and store it, so next year's install is quick.",
    starter: `The part of holiday lighting nobody wants to do: taking it down in January.\n\nThat's on us. Light DMV crews take everything down carefully, check and label it, and store it until next season, so next year's install is faster and nothing gets lost in a garage.\n\n#HolidayLighting #HomeServices #DMV #SmallBusiness #FullService`,
  },
  {
    id: "hiring", label: "Hiring", months: [6, 7, 8, 9, 10], photo: /crew|team|install|ladder/i,
    brief: "We're hiring seasonal installers and crew leads for the holiday season in the DMV: comfortable on ladders, reliable, team players. Apply via the website or by phone.",
    starter: `We're hiring for the holiday season.\n\nLight DMV is looking for installers and crew leads across DC, Maryland and Northern Virginia. If you're comfortable on a ladder, show up on time and like seeing your work light up a neighborhood, we'd like to talk.\n\nSend us a message here, or call ${PHONE}. Please share with anyone who might be a fit.\n\n#Hiring #SeasonalJobs #SkilledTrades #DMVJobs #NowHiring`,
  },
  {
    id: "planning", label: "Plan next season", months: [2, 3, 4, 5, 6, 7], photo: /whole|house|night/i,
    brief: "Off season: plan next season's lights early, returning customers and early birds get the first install dates. No prices.",
    starter: `It might feel early, but this is when the best holiday lighting gets planned.\n\nReturning customers and early bookers get first pick of install dates, and planning ahead leaves time to try a new design: trees, pillars, wreaths, a new color.\n\nThinking about next season? Get on the list at ${SITE}.\n\n#HolidayLighting #PlanAhead #DMV #HomeServices #SmallBusiness`,
  },
];
const theme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/* ---------- Saved state ---------- */

export const getQueue = async () => ((await kvGet<LiPost[]>(QUEUE)) ?? []).sort((a, b) => a.day.localeCompare(b.day));
export const getLiSettings = async (): Promise<LiSettings> => (await kvGet<LiSettings>(SETTINGS)) ?? { perWeek: 1 };
export const setLiSettings = (s: LiSettings) => kvSet(SETTINGS, s);

async function patch(id: string, fn: (p: LiPost) => void) {
  let out: LiPost | undefined;
  await kvUpdate<LiPost[]>(QUEUE, [], (all) => all.map((p) => (p.id === id ? (fn(p), (out = p)) : p)));
  return out;
}

/** The LinkedIn accounts GoHighLevel's Social Planner has (a company page and maybe a personal profile). */
export async function linkedinAccounts() {
  return ((await getGhlSnap())?.accounts ?? []).filter((a) => a.platform.includes("linkedin"));
}

/* ---------- Posting days and drafts ---------- */

const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10);
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** The next posting days from today on: Tuesdays, plus Thursdays at two a week. */
function postingDays(perWeek: 1 | 2, count: number) {
  const want = perWeek === 2 ? [2, 4] : [2];
  const out: string[] = [];
  // After about 10 AM Eastern, today's run has gone: start tomorrow.
  for (let d = etDay(Date.now() + 14 * 3600_000); out.length < count; d = addDays(d, 1)) if (want.includes(dow(d))) out.push(d);
  return out;
}

/** The theme for a day: one that fits the month, not used in the last few posts. */
function pickTheme(day: string, recent: string[]) {
  const m = Number(day.slice(5, 7));
  const fits = THEMES.filter((t) => t.months.includes(m));
  const fresh = fits.filter((t) => !recent.slice(-Math.min(fits.length - 1, 6)).includes(t.id));
  const pool = fresh.length ? fresh : fits.length ? fits : THEMES;
  return pool[randomBytes(1)[0] % pool.length];
}

/** A Drive photo nobody has posted lately (not a daily reel, not LinkedIn in the last 6 months), fitting the theme if one does. */
async function pickPhoto(t: Theme, taken: Set<string>) {
  const items = (await getLibrary()).items.filter((x) => x.kind === "photo");
  const liUsed = (await kvGet<Record<string, number>>(USED)) ?? {};
  const reels = await usedPhotoIds();
  const free = items.filter((x) => !taken.has(x.id) && !reels.has(x.id) && !(liUsed[x.id] && Date.now() - liUsed[x.id] < 180 * 86400_000));
  const pool = free.length ? free : items.filter((x) => !taken.has(x.id));
  const fit = t.photo ? pool.filter((x) => t.photo!.test(`${x.name} ${x.folderName ?? ""}`)) : [];
  const from = (fit.length ? fit : pool).slice(0, 40);
  const f = from[randomBytes(1)[0] % Math.max(1, from.length)];
  return f ? { id: f.id, name: f.name, folder: f.folderName } : undefined;
}

const SYSTEM = `You write LinkedIn posts for Light DMV, a local company that designs, installs, maintains and takes down Christmas and holiday lights for homes and businesses in DC, Maryland and Northern Virginia.
Audience: local business owners, property managers, HOA boards, homeowners and people who might work for us.
Rules:
- 70 to 160 words, plain and warm, like an owner writing. Short paragraphs. No emojis except at most one.
- Never mention prices, discounts in numbers, customer names, street names or addresses.
- Never invent facts, numbers, awards or customers. Speak in general terms about our work.
- End with ${SITE} (and ${PHONE} if it fits), then a blank line and 3 to 5 hashtags.
- Write only the post text.`;

/** Fresh words from Claude for a theme, or null (no key, or it failed: the starter is used then). */
async function claudeWrite(t: Theme, day: string, photo?: { name: string; folder?: string }, avoid: string[] = []) {
  const key = await aiKey();
  if (!key) return null;
  try {
    const client = new Anthropic({ apiKey: key, timeout: 40_000, maxRetries: 0 });
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      output_config: { effort: "low" },
      messages: [{
        role: "user",
        content: `Post date: ${day}.\nTopic: ${t.brief}\n${photo ? `The post carries a photo from our Drive (file "${photo.name}"${photo.folder ? ` in folder "${photo.folder}"` : ""}); refer to it only in general words.\n` : ""}` +
          (avoid.length ? `Recent posts (don't repeat their openings or phrasing):\n${avoid.map((a) => `- ${a.slice(0, 160).replace(/\n/g, " ")}`).join("\n")}\n` : "") +
          `Example of the voice:\n${t.starter}`,
      }],
    });
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return r.stop_reason === "refusal" || text.length < 60 ? null : text.slice(0, 2900);
  } catch (e: any) {
    console.error("[linkedin write]", e?.message ?? e);
    return null;
  }
}

async function makeDraft(day: string, t: Theme, taken: Set<string>, avoid: string[]): Promise<LiPost> {
  const photo = await pickPhoto(t, taken).catch(() => undefined);
  if (photo) taken.add(photo.id);
  const ai = await claudeWrite(t, day, photo, avoid);
  return {
    id: `li_${day}_${randomBytes(3).toString("hex")}`, day, theme: t.id, text: ai ?? t.starter,
    photo: photo ? { id: photo.id, name: photo.name } : undefined, status: "draft", writer: ai ? "claude" : "starter",
  };
}

/** Keep the next posting days written ahead (a skipped day stays skipped). Drafts for days no longer on the schedule are dropped. */
export async function fillQueue() {
  const s = await getLiSettings();
  const days = postingDays(s.perWeek, AHEAD);
  const today = etDay(Date.now());
  const stale = (p: LiPost) => p.status === "draft" && p.day >= today && !days.includes(p.day) && !p.edited;
  const q = (await getQueue()).filter((p) => !stale(p));
  const have = (list: LiPost[]) => new Set(list.filter((p) => !stale(p)).map((p) => p.day));
  const taken = new Set(q.filter((p) => p.photo && (p.status === "draft" || p.status === "approved")).map((p) => p.photo!.id));
  const made: LiPost[] = [];
  for (const d of days.filter((x) => !have(q).has(x))) {
    const t = pickTheme(d, [...q, ...made].map((p) => p.theme));
    made.push(await makeDraft(d, t, taken, [...q, ...made].slice(-4).map((p) => p.text)));
  }
  // Writing takes a while: merge into whatever is saved now, and keep about a year of history.
  const cutoff = addDays(today, -400);
  await kvUpdate<LiPost[]>(QUEUE, [], (cur) => {
    const kept = cur.filter((p) => !stale(p) && p.day >= cutoff);
    const taken2 = have(kept);
    return [...kept, ...made.filter((m) => !taken2.has(m.day))];
  });
  return getQueue();
}

/* ---------- Changes from the Marketing tab ---------- */

export async function editPost(id: string, by: string, change: { text?: string; approve?: boolean; skip?: boolean; photo?: "new" | "none" | string; rewrite?: boolean }) {
  const q = await getQueue();
  const p = q.find((x) => x.id === id);
  if (!p) throw new Error("That post isn't on the list any more.");
  if (p.status === "posted") throw new Error("That one is already on LinkedIn.");
  let photo = p.photo, text = p.text, writer = p.writer;
  if (change.photo === "none") photo = undefined;
  else if (change.photo === "new") {
    const taken = new Set(q.filter((x) => x.photo && x.id !== id).map((x) => x.photo!.id));
    if (p.photo) taken.add(p.photo.id);
    const f = await pickPhoto(theme(p.theme), taken);
    if (!f) throw new Error("No other Drive photo to swap in. Tap refresh on Social posts first.");
    photo = { id: f.id, name: f.name };
  } else if (typeof change.photo === "string" && change.photo) {
    const f = (await getLibrary()).items.find((x) => x.id === change.photo && x.kind === "photo");
    if (!f) throw new Error("That photo isn't in the Drive list.");
    photo = { id: f.id, name: f.name };
  }
  if (change.rewrite) {
    const ai = await claudeWrite(theme(p.theme), p.day, photo, [p.text]);
    if (ai) { text = ai; writer = "claude"; }
    else {
      // No Claude key: a different starter that fits the month.
      const t = pickTheme(p.day, [p.theme]);
      text = t.starter; writer = "starter";
      p.theme = t.id;
    }
  }
  if (typeof change.text === "string") text = change.text.slice(0, 2900);
  return patch(id, (x) => {
    x.photo = photo; x.text = text; x.writer = writer; x.theme = p.theme; x.error = undefined;
    if (typeof change.text === "string") x.edited = true;
    if (change.approve === true) { x.status = "approved"; x.approved = { at: Date.now(), by }; }
    if (change.approve === false || change.skip === false) { x.status = "draft"; x.approved = undefined; }
    if (change.skip) { x.status = "skipped"; x.approved = undefined; }
  });
}

/** Post one now, to every connected LinkedIn account. */
export async function postNow(id: string, by: string) {
  if (!ghlConfigured()) throw new Error("GoHighLevel isn't connected yet.");
  const p = (await getQueue()).find((x) => x.id === id);
  if (!p) throw new Error("That post isn't on the list any more.");
  if (p.status === "posted") throw new Error("That one is already on LinkedIn.");
  const accts = (await linkedinAccounts()).filter((a) => !a.expired);
  try {
    if (!accts.length) throw new Error("No LinkedIn account is connected in GoHighLevel's Social Planner.");
    const media = [];
    if (p.photo) {
      const item = (await getLibrary()).items.find((x) => x.id === p.photo!.id);
      if (item) { const c = await publicCopy(item); media.push({ url: c.url, type: c.contentType }); }
    }
    await ghlPostNow(accts.map((a) => a.id), p.text, media);
  } catch (e: any) {
    await patch(id, (x) => { x.status = "failed"; x.error = e.message; });
    throw e;
  }
  if (p.photo) await kvUpdate<Record<string, number>>(USED, {}, (u) => { u[p.photo!.id] = Date.now(); });
  await expireGhlSnap(); // the post counts toward "LinkedIn posts" when Social Planner is read next
  return patch(id, (x) => {
    x.status = "posted"; x.error = undefined;
    x.posted = { at: Date.now(), by, accounts: accts.map((a) => a.name) };
    if (!x.approved) x.approved = { at: Date.now(), by };
  });
}

/** The daily run: approved posts whose day has come go out; then the next days get written. */
export async function postDue() {
  const today = etDay(Date.now());
  const due = (await getQueue()).filter((p) => p.status === "approved" && p.day <= today);
  const out: { id: string; ok: boolean; error?: string }[] = [];
  for (const p of due) {
    try { await postNow(p.id, p.approved?.by ?? "Schedule"); out.push({ id: p.id, ok: true }); }
    catch (e: any) { out.push({ id: p.id, ok: false, error: e.message }); }
  }
  await fillQueue().catch((e) => console.error("[linkedin fill]", e?.message ?? e));
  return out;
}
