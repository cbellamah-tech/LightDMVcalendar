import { NextResponse } from "next/server";
import { isConnected, jobberConfigured, syncJobber } from "@/lib/jobber";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily sync from Vercel Cron (vercel.json). Vercel signs it with CRON_SECRET when that's set. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!jobberConfigured() || !(await isConnected())) return NextResponse.json({ skipped: "Jobber not connected" });
  try {
    return NextResponse.json({ count: await syncJobber(40) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
