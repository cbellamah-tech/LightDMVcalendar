import { NextResponse } from "next/server";
import { isConnected, jobberConfigured, syncJobber } from "@/lib/jobber";
import { buildCrewNotes, etDay, nextDay } from "@/lib/crewNotes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every evening (vercel.json): pull tomorrow's visits from Jobber, then write the crew note for tomorrow. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!fromCron) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!jobberConfigured() || !(await isConnected())) return NextResponse.json({ skipped: "Jobber not connected" });
  // Visits only (plus the Drive bin list); each of tomorrow's jobs is re-read from Jobber by the note itself.
  const synced = await syncJobber(0).catch((e) => ({ error: e.message }));
  const day = nextDay(etDay());
  const n = await buildCrewNotes(day, { refresh: true, budgetMs: 30_000 });
  return NextResponse.json({ synced, day, crews: n.crews.map((c) => ({ crew: c.crew, stops: c.jobs.length })) });
}
