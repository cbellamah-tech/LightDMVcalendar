import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checklistProgress, ensureSampleJobs, getChecklist, getJobs, jobVisibleTo, recordMaterials, saveChecklist } from "@/lib/jobs";
import { SOPS } from "@/lib/sops";
import { cachedJobParts, getJobDetail, withDrive } from "@/lib/jobDetails";
import { loadDriveIndex } from "@/lib/drive";
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
  if (job.source === "jobber" && new URL(req.url).searchParams.get("detail") === "1") {
    const d = job.jobberJobId && (await isConnected()) ? await getJobDetail(job.jobberJobId).catch(() => null) : null;
    detail = withDrive(await loadDriveIndex(), d, job.client);
  }
  const parts = await cachedJobParts(job.jobberJobId);
  return NextResponse.json({ job, checklist, sop: SOPS[job.kind], progress: checklistProgress(checklist), detail, parts });
}

/* Body: { itemId, done?, addPhotos?: string[], part?: string (which part of the job the photos show), removePhoto?: string, note?, counts?: { c9Feet, c7Bulbs, miniStrands } } or { complete: true } or { reopen: true } */
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
    if (Array.isArray(b.addPhotos)) {
      const urls: string[] = b.addPhotos.filter((u: unknown) => typeof u === "string").slice(0, 20);
      e.photos.push(...urls);
      for (const u of urls) {
        (e.photoBy ??= {})[u] = s.name;
        if (typeof b.part === "string" && b.part.trim()) (e.parts ??= {})[u] = b.part.trim().slice(0, 120);
      }
    }
    if (typeof b.removePhoto === "string") {
      e.photos = e.photos.filter((u) => u !== b.removePhoto);
      if (e.parts) delete e.parts[b.removePhoto];
      if (e.photoBy) delete e.photoBy[b.removePhoto];
    }
    // Per-part photos: one for each part of the job Jobber lists (roofline, trees, wreaths...).
    const parts = item.perPart ? await cachedJobParts(job.jobberJobId) : [];
    const partsMissing = parts.filter((p) => !Object.values(e.parts ?? {}).some((x) => x.toLowerCase() === p.toLowerCase()));
    if (typeof b.note === "string") e.note = b.note.slice(0, 500) || undefined;
    if (item.counts && b.counts && typeof b.counts === "object") {
      e.counts ??= {};
      for (const k of item.counts) {
        const raw = b.counts[k.key];
        if (raw === "" || raw === null) delete e.counts[k.key];
        else if (raw !== undefined) {
          const v = Number(raw);
          if (!Number.isFinite(v) || v < 0 || v > 100000) return NextResponse.json({ error: `${k.label}: enter a number.` }, { status: 400 });
          e.counts[k.key] = Math.round(v);
        }
      }
    }
    const countsMissing = item.counts?.filter((k) => e.counts?.[k.key] == null) ?? [];
    if (typeof b.done === "boolean") {
      if (b.done && item.photo && !e.photos.length) return NextResponse.json({ error: "Add a photo first." }, { status: 400 });
      if (b.done && item.noteRequired && !e.note) return NextResponse.json({ error: `${item.noteLabel || "Note"}: fill it in first.` }, { status: 400 });
      if (b.done && partsMissing.length) return NextResponse.json({ error: `Still need a photo of: ${partsMissing.join("; ")}` }, { status: 400 });
      if (b.done && countsMissing.length) return NextResponse.json({ error: `Fill in: ${countsMissing.map((k) => k.label).join("; ")}` }, { status: 400 });
      e.done = b.done;
    }
    if (item.photo && !e.photos.length) e.done = false;
    if (item.noteRequired && !e.note) e.done = false;
    if (item.perPart) e.done = e.photos.length > 0 && !partsMissing.length; // checks itself once every part has a photo
    if (item.counts) e.done = !countsMissing.length; // the box is the counts: checked once all three are in
    e.by = s.uid; e.byName = s.name; e.at = Date.now();
    if (!e.done && item.required) { c.completedAt = undefined; c.completedBy = undefined; }
  }
  c.rev = (c.rev || 0) + 1;
  await saveChecklist(c);
  if (b.complete && job.kind === "fix") {
    const { writeWorkDone } = await import("@/lib/serviceSheet");
    await writeWorkDone(job, c.items["work-done"]?.note || "").catch(() => {});
  }
  const m = sop.items.find((i) => i.counts && i.id === b.itemId);
  if (m && c.items[m.id]?.done) await recordMaterials(job, c.items[m.id].counts ?? {}, s.name);
  return NextResponse.json({ checklist: c, progress: checklistProgress(c) });
}
