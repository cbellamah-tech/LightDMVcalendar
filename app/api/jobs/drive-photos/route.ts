import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getChecklists, getJobs } from "@/lib/jobs";
import { copyJobPhotos, driveCopyStatus } from "@/lib/jobPhotosDrive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function all() {
  const jobs = Object.values(await getJobs());
  const lists = await getChecklists(jobs);
  return { jobs, lists: lists.filter((c) => Object.values(c.items).some((e) => e.photos?.length)) };
}

/** Where job photos go in Drive, and how many still need copying. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const { jobs, lists } = await all();
  return NextResponse.json(await driveCopyStatus(jobs, lists));
}

/** Copy every job photo not yet in Drive (a batch per call; the page calls again while some are left). */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const { jobs, lists } = await all();
  const started = Date.now();
  let copied = 0, error: string | undefined, skipped: string | undefined;
  for (const c of lists) {
    if (Date.now() - started > 40_000) break;
    const job = jobs.find((j) => j.id === c.jobId)!;
    const r = await copyJobPhotos(job, c, new URL(req.url).origin, 25);
    copied += r.copied;
    if (r.skipped) { skipped = r.skipped; break; }
    if (r.error) { error = r.error; break; }
  }
  return NextResponse.json({ ...(await driveCopyStatus(jobs, lists)), copied, error, skipped });
}
