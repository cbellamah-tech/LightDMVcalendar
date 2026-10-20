import { NextResponse } from "next/server";
import { postDue } from "@/lib/linkedin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Mid-morning Eastern (vercel.json): approved LinkedIn posts whose day has come go out, then the next ones get written. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ posted: await postDue() });
}
