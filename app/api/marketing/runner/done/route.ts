import { NextResponse } from "next/server";
import { checkRunner, patchMedia } from "@/lib/media";
import { autoPostNext } from "@/lib/autopost";

export const maxDuration = 60;

/** The upload finished: show it on the Marketing tab. */
export async function POST(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const m = await patchMedia(String(b.id || ""), (x) => { x.status = "ready"; });
  if (m) await autoPostNext().catch(() => null);
  return m ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
