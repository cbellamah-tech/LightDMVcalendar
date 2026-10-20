import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { buildCrewNotes, dayNotesFresh, noteDay } from "@/lib/crewNotes";
import { listUsers } from "@/lib/users";
import { getJobs, jobVisibleTo } from "@/lib/jobs";
import { isOffice, type Session } from "@/lib/session";
import type { DayNotes } from "@/lib/crewNoteFormat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Crews see only their own stops (the same rule as the Jobs list); owners and the manager see every crew. */
async function forSession(n: DayNotes | null, s: Session) {
  if (!n || isOffice(s)) return n;
  const [jobs, users] = await Promise.all([getJobs(), listUsers()]);
  const me = users.find((u) => u.id === s.uid);
  const mine = (id: string) => !!jobs[id] && jobVisibleTo(jobs[id], s, me);
  return { ...n, crews: n.crews.map((c) => ({ ...c, jobs: c.jobs.filter((j) => mine(j.jobId)) })).filter((c) => c.jobs.length) };
}

/* ?day=today|tomorrow (default: today before 2 PM Eastern, tomorrow after) */
export async function GET(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const day = noteDay(new URL(req.url).searchParams.get("day"));
  return NextResponse.json({ day, notes: await forSession(await dayNotesFresh(day), s) });
}

/** Owners and the manager: write it again now, re-reading each job from Jobber. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const day = noteDay(new URL(req.url).searchParams.get("day"));
  return NextResponse.json({ day, notes: await buildCrewNotes(day, { refresh: true }) });
}
