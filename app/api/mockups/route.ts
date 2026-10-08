import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { savePhoto } from "@/lib/photos";
import { addMockup, knownFiles, loadLibrary, parseMockupName } from "@/lib/mockups";

export const dynamic = "force-dynamic";
const MAX = 4 * 1024 * 1024;

/** What's in the Light Design Hero mockup library (file names, so the page skips ones already sent). */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const lib = await loadLibrary();
  return NextResponse.json({ known: await knownFiles(), customers: Object.keys(lib).length });
}

/** multipart: file (the picture, shrunk by the page), name (the original download's file name, e.g. S_Srivastava_Design1.png) */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
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
