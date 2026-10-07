import { NextResponse } from "next/server";
import { checkRunner, MediaItem, newMediaId, saveMedia, signedUpload } from "@/lib/media";
import { savePhoto } from "@/lib/photos";
import { etDay } from "@/lib/marketing";

export const dynamic = "force-dynamic";

/* The daily run hands over what it made.
   JSON { kind, contentType, title, captions: { facebook, instagram, google, linkedin }, photoIds }
     -> { id, uploadUrl }: PUT the file to uploadUrl, then POST /api/marketing/runner/done { id }.
   Small files (and local testing) can come as multipart instead: fields "file" and "meta" (that same JSON). */

const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

function item(meta: any, url: string, contentType: string, status: MediaItem["status"]): MediaItem {
  const caps: MediaItem["captions"] = {};
  for (const p of ["facebook", "instagram", "google", "linkedin"] as const) if (str(meta?.captions?.[p], 3000)) caps[p] = str(meta.captions[p], 3000);
  return {
    id: newMediaId(), day: etDay(Date.now()), kind: meta?.kind === "photo" ? "photo" : "video", url, contentType,
    title: str(meta?.title, 120) || "Today's video", captions: caps,
    photoIds: Array.isArray(meta?.photoIds) ? meta.photoIds.map(String).slice(0, 30) : [],
    createdAt: Date.now(), by: str(meta?.by, 40) || "Daily video run", status,
  };
}

export async function POST(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    const meta = JSON.parse(String(form.get("meta") || "{}"));
    const url = await savePhoto(file, "marketing");
    const it = item(meta, url, file.type || "video/mp4", "ready");
    await saveMedia(it);
    return NextResponse.json({ id: it.id, url });
  }
  const meta = await req.json().catch(() => null);
  const contentType = str(meta?.contentType, 60) || "video/mp4";
  const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : "mp4";
  const tmp = item(meta, "", contentType, "uploading");
  const up = await signedUpload(`marketing/${tmp.day}/${tmp.id}.${ext}`);
  if (!up) return NextResponse.json({ error: "No file storage connected: send the file as multipart instead." }, { status: 400 });
  await saveMedia({ ...tmp, url: up.publicUrl });
  return NextResponse.json({ id: tmp.id, uploadUrl: up.uploadUrl, url: up.publicUrl });
}
