import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { savePhoto } from "@/lib/photos";
import { imageIds, setImage } from "@/lib/training";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Which course photos are already stored, so the upload only sends the missing ones. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ ids: await imageIds() });
}

/** One course photo from training_pack.json: { id, data } with data as base64 JPEG. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const { id, data } = await req.json().catch(() => ({}));
  if (!/^[a-f0-9]{12}$/.test(String(id)) || typeof data !== "string") return NextResponse.json({ error: "Bad photo" }, { status: 400 });
  const url = await savePhoto(new File([Buffer.from(data, "base64")], `${id}.jpg`, { type: "image/jpeg" }), "training/course");
  await setImage(id, url);
  return NextResponse.json({ ok: true });
}
