import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { botKey } from "@/lib/marketing";

/** New drop box key: the old one stops working at once. */
export async function POST() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ key: await botKey(true) });
}
