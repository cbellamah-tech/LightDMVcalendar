import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getInstallProgress } from "@/lib/installProgress";
import { postBeat } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await getInstallProgress(s.uid, "quote"));
}

/** Body: { module, page, secs?, done?, video? }, sent every few seconds while a lesson page is open. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return postBeat(s, "quote", req);
}
