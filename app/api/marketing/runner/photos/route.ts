import { NextResponse } from "next/server";
import { checkRunner, usedPhotoIds } from "@/lib/media";
import { recentDrivePhotos } from "@/lib/google";

export const dynamic = "force-dynamic";

/** For the daily video run: Drive photos from the last ?days= days (default 30) not used in a video yet. */
export async function GET(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  try {
    const used = await usedPhotoIds();
    const photos = (await recentDrivePhotos(days)).filter((p) => !used.has(p.id));
    return NextResponse.json({ photos });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
