import { NextResponse } from "next/server";
import { checkRunner, usedPhotoIds } from "@/lib/media";
import { recentDriveVideos } from "@/lib/google";

export const dynamic = "force-dynamic";

/** For the daily video run: Drive job videos from the last ?days= days (default 365) not used in a reel yet. */
export async function GET(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const days = Math.min(1500, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 365));
  try {
    const used = await usedPhotoIds();
    const clips = (await recentDriveVideos(days)).filter((c) => !used.has(c.id));
    return NextResponse.json({ clips });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
