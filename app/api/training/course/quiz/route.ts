import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { postQuiz } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return postQuiz(s, "quote", req);
}
