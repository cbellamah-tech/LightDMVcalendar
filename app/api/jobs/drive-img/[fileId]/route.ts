import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { indexedPhoto, loadDriveIndex } from "@/lib/drive";
import { copyDrivePhoto } from "@/lib/jobImages";
import { loadLibrary, mockupByDriveId } from "@/lib/mockups";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** A takedown or install photo, or a Light Design Hero design, from Drive, shown from our own photo storage (copied on first view).
 *  Only files the app found itself (the Drive index or the design library). */
export async function GET(req: Request, { params }: { params: { fileId: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const p = indexedPhoto(await loadDriveIndex(), params.fileId)
    ?? (mockupByDriveId(await loadLibrary(), params.fileId) ? { fileId: params.fileId, year: undefined } : null);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const url = await copyDrivePhoto(p.fileId, p.year);
    return NextResponse.redirect(new URL(url, new URL(req.url).origin));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
