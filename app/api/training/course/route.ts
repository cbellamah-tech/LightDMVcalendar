import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getCourse } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

/** The quote course: lessons, practice and quizzes (answers stay on the server). */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return getCourse(s, "quote", true);
}
