import { NextResponse } from "next/server";
import { recordTap, reviewUrl } from "@/lib/reviews";

export const dynamic = "force-dynamic";

/* A review card (ZappyCards tag) points here. Note whose card it was, then send the phone straight to Google's
   review page. No sign-in: it's the customer's phone. */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const code = String(params.code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  await recordTap(code).catch(() => false);
  return NextResponse.redirect(await reviewUrl(), { status: 302, headers: { "cache-control": "no-store" } });
}
