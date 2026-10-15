import { NextResponse } from "next/server";
import { checkRunKey, runInBackground } from "@/lib/cxSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The customer sync handing the rest of a long read to a fresh run of itself. Only the app knows the key. */
export async function POST(req: Request) {
  if (!(await checkRunKey(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  await runInBackground(new URL(req.url).origin, true);
  return NextResponse.json({ ok: true }, { status: 202 });
}
