import { NextResponse } from "next/server";
import { fillSheet } from "@/lib/marketingData";
import { addDays, etDay, weekOf } from "@/lib/marketing";
import { googleStatus } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Monday morning (vercel.json): last week's counts go into the 2026 Marketing Campaign sheet. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!(await googleStatus()).connected) return NextResponse.json({ skipped: "Google not connected" });
  const r = await fillSheet(addDays(weekOf(etDay(Date.now())), -7), "Monday auto-fill");
  return NextResponse.json({ written: r.written.length, error: r.error });
}
