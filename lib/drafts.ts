import { kvGet, kvSet } from "./store";

/* Ready-to-paste posts for the places with no posting API (Marketplace, Craigslist, Facebook Groups, Nextdoor,
   LinkedIn comments, Bing). The daily run rewrites them each morning; these starters are used until it does. */

export type Draft = { title?: string; body: string; at?: number };
export const DRAFT_CHANNELS = ["marketplace", "craigslist", "fb_groups", "nextdoor", "linkedin_engage", "bing_posts"] as const;
export type DraftChannel = (typeof DRAFT_CHANNELS)[number];
export const POST_URL: Record<DraftChannel, string> = {
  marketplace: "https://www.facebook.com/marketplace/create/item",
  craigslist: "https://post.craigslist.org/",
  fb_groups: "https://www.facebook.com/groups/feed/",
  nextdoor: "https://nextdoor.com/news_feed/",
  linkedin_engage: "https://www.linkedin.com/feed/",
  bing_posts: "https://www.bingplaces.com/Dashboard",
};

const CTA = "Free quote at lightdmv.com or call (703) 951-5100.";
const STARTERS: Record<DraftChannel, Draft> = {
  marketplace: {
    title: "Professional Christmas Light Installation - DC, MD, VA",
    body: `Light DMV designs, installs and takes down your holiday lights.\nAll included: custom design, commercial-grade lights, timers, free maintenance all season, January takedown and storage.\nServing DC, Maryland and Northern Virginia. Fully insured.\n${CTA}`,
  },
  craigslist: {
    title: "Christmas light installation - free quote (DC/MD/VA)",
    body: `Light DMV installs holiday lights on homes and businesses across DC, Maryland and Virginia.\nWe bring the lights, hang them, keep them working all season and take them down in January.\nBook early, December fills up fast.\n${CTA}`,
  },
  fb_groups: {
    body: `Hi neighbors! We're Light DMV, a local crew that installs Christmas lights so you don't have to get on the ladder. Design, install, free fixes all season, and we take them down in January. Booking now for November. ${CTA}`,
  },
  nextdoor: {
    title: "Local Christmas light installers booking now",
    body: `Hi neighbors, we're Light DMV, a local team that hangs holiday lights on homes around DC, Maryland and Virginia. We handle design, install, maintenance and January takedown. Happy to send a free quote: lightdmv.com or (703) 951-5100.`,
  },
  linkedin_engage: {
    body: `Comment on 5 posts from local business owners, property managers or HOAs today, and follow 5 more. A comment to start from:\n"Great to see this! If you're planning holiday lighting for the property this year, our team at Light DMV handles design, install and takedown across the DMV. Happy to help."`,
  },
  bing_posts: {
    body: `Holiday lighting season is here. Light DMV designs, installs, maintains and takes down Christmas lights for homes and businesses in DC, Maryland and Virginia. ${CTA}`,
  },
};

const KEY = "ldmv:mkt:drafts";
export async function getDrafts(): Promise<Record<DraftChannel, Draft>> {
  const saved = (await kvGet<Partial<Record<DraftChannel, Draft>>>(KEY)) ?? {};
  return Object.fromEntries(DRAFT_CHANNELS.map((c) => [c, saved[c]?.body ? saved[c]! : STARTERS[c]])) as Record<DraftChannel, Draft>;
}
export async function saveDrafts(next: Partial<Record<string, Draft>>) {
  const saved = (await kvGet<Partial<Record<DraftChannel, Draft>>>(KEY)) ?? {};
  for (const c of DRAFT_CHANNELS) {
    const d = next[c];
    if (d && typeof d.body === "string" && d.body.trim())
      saved[c] = { title: typeof d.title === "string" ? d.title.slice(0, 150) : undefined, body: d.body.slice(0, 4000), at: Date.now() };
  }
  await kvSet(KEY, saved);
}
