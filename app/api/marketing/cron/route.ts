import { NextResponse } from "next/server";
import { ensureRunnerFile, syncSheet } from "@/lib/marketingData";
import { googleStatus } from "@/lib/google";
import { autoPostNext } from "@/lib/autopost";
import { syncMetaAds } from "@/lib/ads";
import { refreshWebsite } from "@/lib/website";
import { refreshInsights } from "@/lib/googleInsights";
import { refreshGbp } from "@/lib/gbp";
import { refreshReviewStats } from "@/lib/reviewStats";
import { refreshLibrary, refreshSocialStats } from "@/lib/social";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every morning (vercel.json): every week's counts since July go into the 2026 Marketing Campaign sheet first,
 *  then the slower refreshes run (so a slow one running out of time never skips the sheet). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  await autoPostNext().catch(() => null);
  await refreshReviewStats(true).catch(() => null); // Google review count (backup to the website bot, which asks every few hours)
  await refreshWebsite().catch(() => null); // new pages and blog posts on lightdmv.com (the sheet's blog row)
  const google = (await googleStatus()).connected;
  const r = google ? await syncSheet("Daily auto-fill") : { skipped: "Google not connected" };
  await syncMetaAds(true).catch(() => null); // backup, in case the daily video finished while Auto-post was off
  await refreshSocialStats().catch(() => null); // yesterday's likes, views and posts per platform
  if (!google) return NextResponse.json(r);
  await ensureRunnerFile(true).catch(() => {});
  await refreshInsights().catch(() => null);
  await refreshGbp().catch(() => null);
  await refreshLibrary().catch(() => null);
  return NextResponse.json(r);
}
