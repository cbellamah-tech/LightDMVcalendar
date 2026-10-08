import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checklistProgress, ensureSampleJobs, getChecklist, getJobs, jobVisibleTo } from "@/lib/jobs";
import { syncIfStale } from "@/lib/jobber";
import { listUsers } from "@/lib/users";
import { kvGet } from "@/lib/store";
import { JobDetail, withDrive } from "@/lib/jobDetails";
import { loadDriveIndex } from "@/lib/drive";
import { getPayOverrides, payFor } from "@/lib/crewPay";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Jobber can ask us to wait out its rate limit

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
  const idx = await loadDriveIndex();
  const overrides = await getPayOverrides();
  const withProgress = await Promise.all(jobs.map(async (j) => {
    const c = await getChecklist(j);
    // Repeat / new and bin from what's already cached; the job page fetches fresh details.
    const d = j.jobberJobId ? await kvGet<JobDetail>(`ldmv:jobdetail:${j.jobberJobId}`) : null;
    const v = j.source === "jobber" ? withDrive(idx, d, j.client) : null;
    const info = v ? { repeat: v.repeat, bins: v.drive.bins.map((b) => b.bin), known: !!d } : undefined;
    return { ...j, progress: checklistProgress(c), completedAt: c.completedAt, info, pay: payFor(j, d, overrides) };
  }));
  return NextResponse.json({ jobs: withProgress, sample: jobs.some((j) => j.source === "sample") });
}
