import { NextResponse } from "next/server";
import { runDueBots } from "@/lib/bots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by the morning marketing cron (Vercel allows only four crons): runs every bot that's due today. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ran: await runDueBots() });
}
