import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { postSignoff } from "@/lib/courseApi";

export const dynamic = "force-dynamic";

/** Owners sign a quoter off on a module once they've seen them quote for real. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  return postSignoff(s, "quote", req);
}
