import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checklistProgress, ensureSampleJobs, getChecklists, jobVisibleTo, type Job } from "@/lib/jobs";
import { syncIfStale } from "@/lib/jobber";
import { listUsers } from "@/lib/users";
import { kvGetMany } from "@/lib/store";
import { JobDetail, withDrive } from "@/lib/jobDetails";
import { loadDriveIndex } from "@/lib/drive";
import { fixSheetStatus, fixSheetUrl } from "@/lib/serviceSheet";
import { getPayOverrides, payFor } from "@/lib/crewPay";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Jobber can ask us to wait out its rate limit

/* ?from=ISO&to=ISO (defaults: today through 7 days out) */
export async function GET(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const url = new URL(req.url);
  const office = s.role === "owner" || s.role === "manager";
  // Everything the list needs, read side by side; the Jobber sync (when due) runs after the answer is sent.
  const [all, users, idx, overrides, sheet] = await Promise.all([
    ensureSampleJobs(), listUsers(), loadDriveIndex(), getPayOverrides(), office ? fixSheetStatus() : null, syncIfStale().catch(() => {}),
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = url.searchParams.get("from") || new Date(today.getTime() - 86400_000).toISOString();
  const to = url.searchParams.get("to") || new Date(today.getTime() + 8 * 86400_000).toISOString();
  const me = users.find((u) => u.id === s.uid);
  const visible = Object.values(all).filter((j) => jobVisibleTo(j, s, me));
  // Fixes (service calls) are never mixed into the day's jobs: they come back in their own list, which also
  // carries open fixes from before the range so a missed one stays on the schedule.
  const fixList = visible.filter((j) => j.kind === "fix" && j.start < to && (j.start >= from || !j.doneInJobber));
  const jobs = url.searchParams.get("only") === "fixes" ? [] : visible.filter((j) => j.kind !== "fix" && j.start >= from && j.start < to);
  jobs.sort((a, b) => a.start.localeCompare(b.start));
  fixList.sort((a, b) => a.start.localeCompare(b.start));
  // Checklists and cached Jobber details for every row in two queries instead of two per job.
  const rows = [...jobs, ...fixList];
  const [lists, details] = await Promise.all([
    getChecklists(rows),
    kvGetMany<JobDetail>(rows.map((j) => (j.jobberJobId ? `ldmv:jobdetail:${j.jobberJobId}` : "ldmv:none"))),
  ]);
  const withProgress = (j: Job, i: number) => {
    const c = lists[i];
    // Repeat / new and bin from what's already cached; the job page fetches fresh details.
    const d = j.jobberJobId ? details[i] : null;
    const v = j.source === "jobber" ? withDrive(idx, d, j.client) : null;
    const info = v ? { repeat: v.repeat, bins: v.drive.bins.map((b) => b.bin), known: !!d } : undefined;
    return { ...j, progress: checklistProgress(c), arrivedAt: c.arrivedAt, completedAt: c.completedAt, info, pay: payFor(j, d, overrides) };
  };
  const out = rows.map(withProgress);
  const fixes = out.slice(jobs.length)
    // An old fix finished in the app drops off once its day has passed.
    .filter((f) => f.start >= from || !f.completedAt);
  return NextResponse.json({
    jobs: out.slice(0, jobs.length),
    fixes,
    fixSheet: sheet ? { url: fixSheetUrl(sheet.sheetId || process.env.SERVICE_SHEET_ID?.trim()), lastAt: sheet.lastAt, lastError: sheet.lastError } : null,
    sample: jobs.some((j) => j.source === "sample"),
  });
}
