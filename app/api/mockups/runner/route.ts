import { NextResponse } from "next/server";
import { checkRunner } from "@/lib/media";
import { savePhoto } from "@/lib/photos";
import { addMockup, knownFiles, parseMockupName } from "@/lib/mockups";

export const dynamic = "force-dynamic";
const MAX = 4 * 1024 * 1024;

/* Design files sent in by a Claude session that reads them off an owner's computer, signed in with the
   same runner key as the daily video (Authorization: Bearer <key>). Same library as the Jobber tab's design card. */

/** File names already in the library, so the sender skips them. */
export async function GET(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  return NextResponse.json({ known: await knownFiles() });
}

/** multipart: file (a JPEG or PNG under 4 MB), name (the download's file name, e.g. A_Name_Design1.png), at (optional, ms the design was saved). */
export async function POST(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") || "");
  const at = Number(form.get("at")) || Date.now();
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Send an image file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Picture is too large (shrink it under 4 MB)." }, { status: 413 });
  if (!parseMockupName(name)) return NextResponse.json({ error: `${name} isn't a design file name (X_Name_Design1.png).` }, { status: 400 });
  const url = await savePhoto(file, "mockups");
  await addMockup(name, url, at);
  return NextResponse.json({ ok: true });
}
