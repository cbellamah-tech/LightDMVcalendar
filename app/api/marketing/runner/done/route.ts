import { NextResponse } from "next/server";
import { checkRunner, patchMedia } from "@/lib/media";

/** The upload finished: show it on the Marketing tab. */
export async function POST(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const m = await patchMedia(String(b.id || ""), (x) => { x.status = "ready"; });
  return m ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
