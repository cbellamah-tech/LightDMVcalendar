import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checklistProgress, ensureSampleJobs, getChecklist, getJobs, jobVisibleTo } from "@/lib/jobs";
import { syncIfStale } from "@/lib/jobber";
import { listUsers } from "@/lib/users";
import { kvGet } from "@/lib/store";
import { JobDetail, withDrive } from "@/lib/jobDetails";
import { loadDriveIndex } from "@/lib/drive";
import { fixSheetStatus, fixSheetUrl } from "@/lib/serviceSheet";

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
  const visible = Object.values(await getJobs()).filter((j) => jobVisibleTo(j, s, me));
  // Fixes (service calls) are never mixed into the day's jobs: they come back in their own list, which also
  // carries open fixes from before the range so a missed one stays on the schedule.
  const fixList = visible.filter((j) => j.kind === "fix" && j.start < to && (j.start >= from || !j.doneInJobber));
  const jobs = url.searchParams.get("only") === "fixes" ? [] : visible.filter((j) => j.kind !== "fix" && j.start >= from && j.start < to);
  jobs.sort((a, b) => a.start.localeCompare(b.start));
  fixList.sort((a, b) => a.start.localeCompare(b.start));
  const idx = await loadDriveIndex();
  const withProgress = async (j: (typeof jobs)[number]) => {
    const c = await getChecklist(j);
    // Repeat / new and bin from what's already cached; the job page fetches fresh details.
    const d = j.jobberJobId ? await kvGet<JobDetail>(`ldmv:jobdetail:${j.jobberJobId}`) : null;
    const v = j.source === "jobber" ? withDrive(idx, d, j.client) : null;
    const info = v ? { repeat: v.repeat, bins: v.drive.bins.map((b) => b.bin), known: !!d } : undefined;
    return { ...j, progress: checklistProgress(c), completedAt: c.completedAt, info };
  };
  const fixes = (await Promise.all(fixList.map(withProgress)))
    // An old fix finished in the app drops off once its day has passed.
    .filter((f) => f.start >= from || !f.completedAt);
  const office = s.role === "owner" || s.role === "manager";
  const sheet = office ? await fixSheetStatus() : null;
  return NextResponse.json({
    jobs: await Promise.all(jobs.map(withProgress)),
    fixes,
    fixSheet: sheet ? { url: fixSheetUrl(sheet.sheetId || process.env.SERVICE_SHEET_ID?.trim()), lastAt: sheet.lastAt, lastError: sheet.lastError } : null,
    sample: jobs.some((j) => j.source === "sample"),
  });
}
