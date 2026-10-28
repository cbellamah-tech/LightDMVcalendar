import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { markCleanupDone, pipelineCleanup } from "@/lib/pipelineCleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The weekly GoHighLevel cleanup list. ?fresh=1 reads GoHighLevel again (after moving deals there). */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await pipelineCleanup(new URL(req.url).searchParams.get("fresh") === "1"));
}

/** "Done for this week" (or undo): hides the reminder on Today until next Monday. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  await markCleanupDone(s.name, !!b.undo);
  return NextResponse.json(await pipelineCleanup());
}
