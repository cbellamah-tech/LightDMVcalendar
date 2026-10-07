import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { fillSheet } from "@/lib/marketingData";
import { addDays, etDay, weekOf } from "@/lib/marketing";

export const maxDuration = 60;

/** Write a week's counts into the campaign sheet now (default: last week). ?dry=1 shows what would be written. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const q = new URL(req.url).searchParams;
  const week = q.get("week") || addDays(weekOf(etDay(Date.now())), -7);
  return NextResponse.json(await fillSheet(week, s.name, q.get("dry") === "1"));
}
