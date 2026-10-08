import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getTeam } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return getTeam(s, "quote");
}
