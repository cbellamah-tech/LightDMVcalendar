import { NextResponse } from "next/server";
import { checkRunner } from "@/lib/media";
import { saveDrafts } from "@/lib/drafts";

export const dynamic = "force-dynamic";

/** The daily run's fresh wording: { marketplace: { title, body }, craigslist: {...}, fb_groups, nextdoor, linkedin_engage, bing_posts }. */
export async function POST(req: Request) {
  if (!(await checkRunner(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  await saveDrafts((await req.json().catch(() => ({}))) ?? {});
  return NextResponse.json({ ok: true });
}
