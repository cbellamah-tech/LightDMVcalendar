import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getChecklist, getJobs, jobVisibleTo } from "@/lib/jobs";
import { copyJobPhotos } from "@/lib/jobPhotosDrive";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* The job page calls this (without waiting) after each photo, so the copy to Drive never slows the crew down. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const job = (await getJobs())[params.id];
  const me = (await listUsers()).find((u) => u.id === s.uid);
  if (!job || !jobVisibleTo(job, s, me)) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(await copyJobPhotos(job, await getChecklist(job), new URL(req.url).origin));
}
