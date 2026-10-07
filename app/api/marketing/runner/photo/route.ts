import { NextResponse } from "next/server";
import { checkRunner } from "@/lib/media";
import { drivePhotoJpeg } from "@/lib/google";

export const dynamic = "force-dynamic";

/** One Drive photo as a JPEG (?id=, ?w= long side in pixels, default 1600). */
export async function GET(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const r = await drivePhotoJpeg(id, Number(q.get("w")) || 1600);
    return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
