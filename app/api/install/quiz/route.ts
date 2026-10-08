import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { postQuiz } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

/** Body: { module, answers: number[] }. Grades the module quiz and saves the best score. */
export async function POST(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  return postQuiz(s, "install", req);
}
