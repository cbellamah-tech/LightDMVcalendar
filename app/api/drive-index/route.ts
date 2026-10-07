import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { loadDriveIndex, saveDriveIndex } from "@/lib/drive";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const i = await loadDriveIndex();
  return NextResponse.json({ generatedAt: i.generatedAt, bins: i.bins.length, photos: i.takedownPhotos.length });
}

/** Owner uploads drive_index.json (bin lists + takedown photo names from Google Drive). */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  try {
    const i = await saveDriveIndex(await req.json());
    return NextResponse.json({ generatedAt: i.generatedAt, bins: i.bins.length, photos: i.takedownPhotos.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
