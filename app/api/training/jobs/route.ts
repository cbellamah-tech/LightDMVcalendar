import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";

export const dynamic = "force-dynamic";

/** The photo library: every real job with its finished-install photo and each line with its price. */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ jobs: [] });
  return NextResponse.json({
    jobs: pack.quotes.map(({ quoteId: _q, lines, ...q }) => ({ ...q, lines: lines.map(({ raw: _r, ...l }) => l) }))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || b.total - a.total),
  });
}
