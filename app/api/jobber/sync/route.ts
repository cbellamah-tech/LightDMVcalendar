import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { syncJobber } from "@/lib/jobber";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Jobber can ask us to wait out its rate limit

export async function POST() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ count: await syncJobber() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
