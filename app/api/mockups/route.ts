import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { savePhoto } from "@/lib/photos";
import { addMockup, knownFiles, loadLibrary, parseMockupName } from "@/lib/mockups";
import { mockupSyncStatus, syncDriveMockups } from "@/lib/driveSync";
import { linePhotoCheck } from "@/lib/jobImages";
import { googleStatus } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX = 4 * 1024 * 1024;

async function summary() {
  const lib = await loadLibrary();
  return {
    known: await knownFiles(), customers: Object.keys(lib).length, designs: Object.values(lib).flat().length,
    google: (await googleStatus()).connected, drive: await mockupSyncStatus(),
    jobber: await linePhotoCheck().catch(() => null),
  };
}

/** What's in the Light Design Hero design library, how the Drive pickup went, and whether Jobber's API has line photos yet. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await summary());
}

/** ?sync=1 looks in Google Drive now. Otherwise multipart: file (the picture, shrunk by the page), name (the original
 *  download's file name, e.g. A_Name_Design1.png). */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  if (new URL(req.url).searchParams.get("sync")) {
    const r = await syncDriveMockups(true);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json(await summary());
  }
  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") || "");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Send an image file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Picture is too large." }, { status: 413 });
  if (!parseMockupName(name)) return NextResponse.json({ error: `${name} isn't a Light Design Hero download.` }, { status: 400 });
  const url = await savePhoto(file, "mockups");
  await addMockup(name, url);
  return NextResponse.json({ ok: true });
}
