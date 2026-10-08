import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getJobs, jobVisibleTo } from "@/lib/jobs";
import { listUsers } from "@/lib/users";
import type { Session } from "@/lib/session";
import { ETA_MINUTES, getOmwLog, leadName, omwText, sendOnMyWay } from "@/lib/onMyWay";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function load(id: string, s: Session) {
  const [jobs, users] = await Promise.all([getJobs(), listUsers()]);
  const job = jobs[id];
  const me = users.find((u) => u.id === s.uid);
  return job && jobVisibleTo(job, s, me) ? { job, lead: leadName(job, users, s.name) } : null;
}

/** The texts already sent on this job and what a new one would say (no customer name or phone). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const x = await load(params.id, s);
  if (!x) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ log: await getOmwLog(params.id), lead: x.lead, sample: omwText(null, x.lead, 30) });
}

/* Body: { minutes: 15 | 30 | 60 } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const x = await load(params.id, s);
  if (!x) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const minutes = Number(b.minutes);
  if (!(ETA_MINUTES as readonly number[]).includes(minutes)) return NextResponse.json({ error: "Pick 15 min, 30 min or 1 hour." }, { status: 400 });
  // A double tap shouldn't text the customer twice.
  const last = (await getOmwLog(params.id)).filter((e) => e.ok).pop();
  if (last && Date.now() - last.at < 60_000) return NextResponse.json({ error: "The customer was just texted. Wait a minute to send another." }, { status: 429 });
  const sent = await sendOnMyWay(x.job, minutes, s.name, x.lead);
  const log = await getOmwLog(params.id);
  if (!sent.ok) return NextResponse.json({ error: `Text not sent: ${sent.error}`, log }, { status: 502 });
  return NextResponse.json({ sent, log });
}
