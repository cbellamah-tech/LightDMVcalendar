import { NextResponse } from "next/server";
import { checkRunner } from "@/lib/media";
import { driveVideoStream } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One Drive video, original file, streamed (?id=). */
export async function GET(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const r = await driveVideoStream(id);
    return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "video/mp4", "cache-control": "private, no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
