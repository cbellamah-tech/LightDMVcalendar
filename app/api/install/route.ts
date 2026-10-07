import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { isOffice } from "@/lib/session";
import { loadPack } from "@/lib/training";

export const dynamic = "force-dynamic";

/** The install and takedown guide for crews (from the same file as the quote course). */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const g = (await loadPack())?.install;
  if (!g) return NextResponse.json({ loaded: false });
  return NextResponse.json({ loaded: true, ...g, ownerTodo: isOffice(s) ? g.ownerTodo : null });
}
