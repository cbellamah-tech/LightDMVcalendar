import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";

export const dynamic = "force-dynamic";

/** Real sold jobs: the install photo from Drive, and each line with its price (mockups load per line). */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  return NextResponse.json({ examples: (pack.examples ?? []).map(({ quoteId: _q, ...e }) => e) });
}
