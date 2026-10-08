import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getTeam } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

/** Owners and crew leads: each person's installer course, page by page, with time spent, quiz tries and sign-offs. */
export async function GET() {
  const s = await requireRole("owner", "manager", "lead");
  if (s instanceof NextResponse) return s;
  return getTeam(s, "install");
}
