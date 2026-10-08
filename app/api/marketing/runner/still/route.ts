import { NextResponse } from "next/server";
import { checkRunner, patchMedia } from "@/lib/media";
import { savePhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** A still photo for the listings: multipart "id" (the media item) + "file" (a JPEG, under 4 MB). Up to 6. */
export async function POST(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !/^image\//.test(file.type)) return NextResponse.json({ error: "Send an image as file" }, { status: 400 });
  const url = await savePhoto(file, "marketing");
  const m = await patchMedia(String(form.get("id") || ""), (x) => { x.stills = [...(x.stills ?? []), url].slice(0, 6); });
  return m ? NextResponse.json({ url }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
