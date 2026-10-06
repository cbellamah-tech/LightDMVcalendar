import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checklistProgress, ensureSampleJobs, getChecklist, getJobs, jobVisibleTo } from "@/lib/jobs";
import { syncIfStale } from "@/lib/jobber";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/* ?from=ISO&to=ISO (defaults: today through 7 days out) */
export async function GET(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  await ensureSampleJobs();
  await syncIfStale();
  const url = new URL(req.url);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = url.searchParams.get("from") || new Date(today.getTime() - 86400_000).toISOString();
  const to = url.searchParams.get("to") || new Date(today.getTime() + 8 * 86400_000).toISOString();
  const me = (await listUsers()).find((u) => u.id === s.uid);
  const jobs = Object.values(await getJobs())
    .filter((j) => j.start >= from && j.start < to && jobVisibleTo(j, s, me))
    .sort((a, b) => a.start.localeCompare(b.start));
  const withProgress = await Promise.all(jobs.map(async (j) => {
    const c = await getChecklist(j);
    return { ...j, progress: checklistProgress(c), completedAt: c.completedAt };
  }));
  return NextResponse.json({ jobs: withProgress, sample: jobs.some((j) => j.source === "sample") });
}
