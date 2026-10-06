import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { syncJobber } from "@/lib/jobber";

export const dynamic = "force-dynamic";

export async function POST() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ count: await syncJobber() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
