import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { savePhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";
const MAX = 8 * 1024 * 1024;

/* multipart: file, folder (e.g. "signs/R01-S03" or "jobs/<jobId>/<itemId>") */
export async function POST(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") || "misc");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Send an image file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Photo is too large (8 MB max)." }, { status: 413 });
  const url = await savePhoto(file, folder);
  return NextResponse.json({ url });
}
