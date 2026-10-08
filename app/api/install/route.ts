import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { isOffice } from "@/lib/session";
import { getCourse } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

/** The install and takedown course for crews (from the same file as the quote course). */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  return getCourse(s, "install", isOffice(s));
}
