import { NextResponse } from "next/server";
import { ensureRunnerFile, syncSheet } from "@/lib/marketingData";
import { googleStatus } from "@/lib/google";
import { autoPostNext } from "@/lib/autopost";
import { syncMetaAds } from "@/lib/ads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every morning (vercel.json): this week's and last week's counts go into the 2026 Marketing Campaign sheet. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  await autoPostNext().catch(() => null);
  await syncMetaAds(true).catch(() => null); // backup, in case the daily video finished while Auto-post was off
  if (!(await googleStatus()).connected) return NextResponse.json({ skipped: "Google not connected" });
  await ensureRunnerFile(true).catch(() => {});
  const r = await syncSheet("Daily auto-fill");
  return NextResponse.json(r);
}
