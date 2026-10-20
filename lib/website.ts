import { kvGet, kvSet } from "./store";
import { etDay } from "./marketing";
import LAUNCH from "@/data/website-launch-dates.json";

/* The public website (lightdmv.com, its own repo on Vercel): every page in its sitemap with a title, a picture
   and the day it went live, plus the Google tags the homepage loads. Read from the public site only, so nothing
   to connect. Blog posts carry their own date in the sitemap; other pages use the day they were added to the
   site's repo (data/website-launch-dates.json, from its history) or the day the app first saw them. */

export const SITE = (process.env.WEBSITE_URL?.trim() || "https://lightdmv.com").replace(/\/$/, "");
const PAGES = "ldmv:site:pages";
const TAGS = "ldmv:site:tags";
const AT = "ldmv:site:at";
const REPO_START = "2026-07-27"; // the site's repo began here, so that date means "on the site by then"

export type PageKind = "blog" | "city" | "service" | "location" | "other";
export type SitePage = {
  path: string; url: string; kind: PageKind; service?: string; city?: string;
  title?: string; description?: string; image?: string;
  published: string;       // YYYY-MM-DD
  publishedExact: boolean; // false = "on the site by" that day
  firstSeen: string; metaAt?: number; gone?: string;
};
export type SiteTag = { id: string; kind: "Google Analytics" | "Google Ads" | "Tag Manager" | "Search Console" | "Microsoft Clarity" | "Meta Pixel"; found: boolean };
export type SiteTags = { at: number; tags: SiteTag[]; error?: string };

const SERVICES: Record<string, string> = {
  "holiday-lighting": "Holiday", "permanent-lighting": "Permanent", "bistro-lighting": "Bistro", "diwali-lighting": "Diwali",
};
const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b(\w)/g, (m) => m.toUpperCase());
const cityFrom = (slug: string) => {
  const m = slug.match(/^(.*)-(va|md|dc)$/);
  return m ? `${titleCase(m[1])}, ${m[2].toUpperCase()}` : titleCase(slug);
};

export function kindOf(path: string): Pick<SitePage, "kind" | "service" | "city"> {
  const [a, b] = path.split("/").filter(Boolean);
  if (a === "blog" && b) return { kind: "blog" };
  if (a === "locations" && b) return { kind: "location", city: cityFrom(b) };
  if (a && SERVICES[a] && b && !["residential", "commercial", "compare"].includes(b)) return { kind: "city", service: SERVICES[a], city: cityFrom(b) };
  if (a && SERVICES[a]) return { kind: "service", service: SERVICES[a] };
  return { kind: "other" };
}

/** <url><loc>…</loc><lastmod>…</lastmod></url> entries of a sitemap. */
export function parseSitemap(xml: string): { url: string; lastmod?: string }[] {
  const out: { url: string; lastmod?: string }[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    out.push({ url: decode(loc), lastmod: m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] });
  }
  return out;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
function meta(html: string, key: string) {
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ]) {
    const m = html.match(re);
    if (m) return decode(m[1]);
  }
  return undefined;
}

/** Title, description and preview picture of one page. */
export function pageMeta(html: string, base: string) {
  const head = html.slice(0, 200_000);
  const title = meta(head, "og:title") || decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "") || undefined;
  const description = meta(head, "og:description") || meta(head, "description");
  let image = meta(head, "og:image") || meta(head, "twitter:image");
  if (image) try { image = new URL(image, base).toString(); } catch { image = undefined; }
  return { title: title?.replace(/\s*\|\s*LightDMV\s*$/i, ""), description, image };
}

/** Which Google (and other) tags the homepage loads. */
export function findTags(html: string): SiteTag[] {
  const ids = (re: RegExp) => [...new Set([...html.matchAll(re)].map((m) => m[1]))];
  const tags: SiteTag[] = [
    ...ids(/\b(G-[A-Z0-9]{6,12})\b/g).map((id) => ({ id, kind: "Google Analytics" as const, found: true })),
    ...ids(/\b(AW-\d{6,12})\b/g).map((id) => ({ id, kind: "Google Ads" as const, found: true })),
    ...ids(/\b(GTM-[A-Z0-9]{4,10})\b/g).map((id) => ({ id, kind: "Tag Manager" as const, found: true })),
  ];
  if (/google-site-verification/i.test(html)) tags.push({ id: "verification tag", kind: "Search Console", found: true });
  const clarity = html.match(/clarity\.ms\/tag\/["'+\s]*([a-z0-9]{6,14})/i)?.[1] || html.match(/["']([a-z0-9]{8,12})["']\s*\)?\s*;?\s*\/\/?\s*clarity/i)?.[1];
  if (/clarity/i.test(html)) tags.push({ id: clarity || "loads after cookie OK", kind: "Microsoft Clarity", found: true });
  if (/connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(/.test(html)) tags.push({ id: html.match(/fbq\(\s*["']init["']\s*,\s*["'](\d+)/)?.[1] || "found", kind: "Meta Pixel", found: true });
  return tags;
}

async function get(url: string, ms = 8000) {
  const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(ms), headers: { "user-agent": "LightDMV-app/1.0 (+marketing tab)" } });
  if (!res.ok) throw new Error(`${new URL(url).pathname} answered ${res.status}`);
  return res.text();
}

export const getSitePages = async () => (await kvGet<Record<string, SitePage>>(PAGES)) ?? {};
export const getSiteTags = () => kvGet<SiteTags>(TAGS);
export const siteReadAt = async () => (await kvGet<number>(AT)) ?? 0;

/** New blog posts and city pages per day, for the campaign sheet's blog row. Only pages whose launch day is
 *  known (not "on the site by" the repo's first day) count. */
export async function newPageDays(): Promise<{ day: string; n: number }[]> {
  const by: Record<string, number> = {};
  for (const p of Object.values(await getSitePages()))
    if (p.publishedExact && ["blog", "city", "location"].includes(p.kind)) by[p.published] = (by[p.published] ?? 0) + 1;
  return Object.entries(by).map(([day, n]) => ({ day, n }));
}

/** Re-read the sitemap, the homepage's tags, and titles/pictures for new pages (and up to 20 stale ones). */
export async function refreshWebsite(): Promise<{ pages: number; added: string[]; error?: string }> {
  const today = etDay(Date.now());
  const pages = await getSitePages();
  const added: string[] = [];
  const firstRun = !Object.keys(pages).length; // on the first read "first seen today" says nothing about launch day
  let error: string | undefined;
  try {
    const entries = parseSitemap(await get(`${SITE}/sitemap.xml`));
    if (!entries.length) throw new Error("the sitemap is empty");
    const live = new Set<string>();
    for (const e of entries) {
      let path: string;
      try { path = new URL(e.url).pathname.replace(/\/$/, "") || "/"; } catch { continue; }
      live.add(path);
      const k = kindOf(path);
      const cur = pages[path];
      const seed = (LAUNCH as Record<string, string>)[path];
      const blogDay = k.kind === "blog" && e.lastmod ? e.lastmod.slice(0, 10) : undefined;
      const published = blogDay || cur?.published || seed || today;
      const exact = blogDay ? true : cur ? cur.publishedExact : seed ? seed !== REPO_START : !firstRun;
      pages[path] = { ...cur, path, url: `${SITE}${path === "/" ? "" : path}`, ...k, published, publishedExact: exact, firstSeen: cur?.firstSeen || today, gone: undefined };
      if (!cur) added.push(path);
    }
    for (const p of Object.values(pages)) if (!live.has(p.path) && !p.gone) p.gone = today;
  } catch (e: any) { error = `Website sitemap: ${e.message}`; }

  // Titles and pictures: new pages first, then the oldest reads, a few at a time in parallel.
  const due = Object.values(pages).filter((p) => !p.gone && (!p.metaAt || Date.now() - p.metaAt > 7 * 86400_000))
    .sort((a, b) => (a.metaAt ?? 0) - (b.metaAt ?? 0) || b.published.localeCompare(a.published)).slice(0, 40);
  for (let i = 0; i < due.length; i += 8) {
    await Promise.all(due.slice(i, i + 8).map(async (p) => {
      try { Object.assign(p, pageMeta(await get(p.url), p.url), { metaAt: Date.now() }); }
      catch { p.metaAt = Date.now() - 6 * 86400_000; } // try again tomorrow
    }));
  }
  await kvSet(PAGES, pages);

  try {
    await kvSet<SiteTags>(TAGS, { at: Date.now(), tags: findTags(await get(`${SITE}/`)) });
  } catch (e: any) {
    const cur = await getSiteTags();
    await kvSet<SiteTags>(TAGS, { at: Date.now(), tags: cur?.tags ?? [], error: `Homepage: ${e.message}` });
  }
  await kvSet(AT, Date.now());
  return { pages: Object.keys(pages).length, added, error };
}
