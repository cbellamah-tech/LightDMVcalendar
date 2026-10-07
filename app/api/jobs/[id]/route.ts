import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checklistProgress, ensureSampleJobs, getChecklist, getJobs, jobVisibleTo, saveChecklist } from "@/lib/jobs";
import { SOPS } from "@/lib/sops";
import { getJobDetail, withDrive } from "@/lib/jobDetails";
import { isConnected } from "@/lib/jobber";
import { listUsers } from "@/lib/users";
import type { Session } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function load(id: string, s: Session) {
  await ensureSampleJobs();
  const job = (await getJobs())[id];
  if (!job) return null;
  const me = (await listUsers()).find((u) => u.id === s.uid);
  return jobVisibleTo(job, s, me) ? job : null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const job = await load(params.id, s);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const checklist = await getChecklist(job);
  // Job details only on the first load (the page re-polls every 5 s for checklist changes).
  let detail = null;
  if (new URL(req.url).searchParams.get("detail") === "1") {
    const d = job.jobberJobId && (await isConnected()) ? await getJobDetail(job.jobberJobId).catch(() => null) : null;
    detail = withDrive(d, job.client);
  }
  return NextResponse.json({ job, checklist, sop: SOPS[job.kind], progress: checklistProgress(checklist), detail });
}

/* Body: { itemId, done?, addPhotos?: string[], removePhoto?: string, note? } or { complete: true } or { reopen: true } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const job = await load(params.id, s);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const c = await getChecklist(job);
  const sop = SOPS[job.kind];

  if (b.complete) {
    const p = checklistProgress(c);
    if (p.requiredLeft.length) {
      const names = sop.items.filter((i) => p.requiredLeft.includes(i.id)).map((i) => i.text);
      return NextResponse.json({ error: `Still required: ${names.join("; ")}` }, { status: 400 });
    }
    c.completedAt = Date.now();
    c.completedBy = s.name;
  } else if (b.reopen) {
    c.completedAt = undefined;
    c.completedBy = undefined;
  } else {
    const item = sop.items.find((i) => i.id === b.itemId);
    if (!item) return NextResponse.json({ error: "Unknown checklist item" }, { status: 400 });
    const e = (c.items[item.id] ??= { done: false, photos: [] });
    if (Array.isArray(b.addPhotos)) e.photos.push(...b.addPhotos.filter((u: unknown) => typeof u === "string").slice(0, 20));
    if (typeof b.removePhoto === "string") e.photos = e.photos.filter((u) => u !== b.removePhoto);
    if (typeof b.note === "string") e.note = b.note.slice(0, 500) || undefined;
    if (typeof b.done === "boolean") {
      if (b.done && item.photo && !e.photos.length) return NextResponse.json({ error: "Add a photo first." }, { status: 400 });
      e.done = b.done;
    }
    if (item.photo && !e.photos.length) e.done = false;
    e.by = s.uid; e.byName = s.name; e.at = Date.now();
    if (!e.done && item.required) { c.completedAt = undefined; c.completedBy = undefined; }
  }
  c.rev = (c.rev || 0) + 1;
  await saveChecklist(c);
  return NextResponse.json({ checklist: c, progress: checklistProgress(c) });
}
