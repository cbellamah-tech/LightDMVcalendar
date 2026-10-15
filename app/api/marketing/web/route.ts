import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { googleStatus } from "@/lib/google";
import { getAdKeywords, getInsights, refreshInsights } from "@/lib/googleInsights";
import { getSitePages, getSiteTags, refreshWebsite, SITE, siteReadAt } from "@/lib/website";
import { laterOnce } from "@/lib/background";
import { adsSummary } from "@/lib/ads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FRESH = 6 * 3600_000;

/** Website pages and Google numbers for the Marketing tab: saved copies at once, re-read in the background. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const [readAt, g] = await Promise.all([siteReadAt(), googleStatus()]);

  if (refresh || !readAt) await refreshWebsite().catch(() => null);
  else if (Date.now() - readAt > FRESH) await laterOnce("website-pages", () => refreshWebsite());

  let insights = await getInsights();
  if (g.connected && (refresh || !insights)) insights = await refreshInsights().catch(() => insights);
  else if (g.connected && Date.now() - (insights?.at ?? 0) > FRESH) await laterOnce("google-insights", () => refreshInsights());

  const [pages, tags, keywords, ads, at] = await Promise.all([getSitePages(), getSiteTags(), getAdKeywords(), adsSummary(), siteReadAt()]);
  return NextResponse.json({
    site: SITE, at,
    pages: Object.values(pages).filter((p) => !p.gone)// Pages with a real launch day first (newest on top), then the ones only known to be live by some day.
      .sort((a, b) => Number(b.publishedExact) - Number(a.publishedExact) || b.published.localeCompare(a.published) || a.path.localeCompare(b.path)),
    tags,
    google: { configured: g.configured, connected: g.connected, email: g.email },
    insights: g.connected ? insights : null,
    adKeywords: keywords,
    adsGoogle: ads.google,
  });
}
