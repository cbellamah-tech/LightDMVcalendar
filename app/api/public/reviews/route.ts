import { NextResponse } from "next/server";
import { publicStats, refreshReviewStats } from "@/lib/reviewStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Public: the Google review count and star average, nothing else. LightDMV.com's review-count bot reads this. */
export async function GET() {
  try {
    const s = await refreshReviewStats();
    return NextResponse.json(publicStats(s), { headers: { "cache-control": "public, max-age=0, s-maxage=600" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Couldn't read the review count" }, { status: 502 });
  }
}
