import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { loadDriveIndex, saveDriveIndex, type DriveIndex } from "@/lib/drive";
import { driveSyncStatus, syncDriveIndex, syncDriveMockups } from "@/lib/driveSync";
import { googleStatus } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const summary = async (i: DriveIndex) => ({
  generatedAt: i.generatedAt, auto: !!i.auto, bins: i.bins.length, photos: i.takedownPhotos.length, installPhotos: (i.installPhotos ?? []).length,
  google: (await googleStatus()).connected, sync: await driveSyncStatus(),
});

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await summary(await loadDriveIndex()));
}

/** ?sync=1 reads Drive now; otherwise the body is a drive_index.json an owner uploads (fallback when Google isn't connected). */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  try {
    if (new URL(req.url).searchParams.get("sync")) {
      const [r] = await Promise.all([syncDriveIndex(true), syncDriveMockups(true)]);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
      return NextResponse.json(await summary(await loadDriveIndex()));
    }
    return NextResponse.json(await summary(await saveDriveIndex(await req.json())));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
