import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";
import { packDesigns } from "@/lib/trainingDesigns";

export const dynamic = "force-dynamic";

/** The photo library: every real job with its finished-install photo and each line with its price. */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ jobs: [] });
  // Each line's own Light Design Hero design, where the Drive sync has one for that customer.
  const designs = await packDesigns(pack).catch(() => ({} as Record<string, Record<number, string>>));
  return NextResponse.json({
    jobs: pack.quotes.map(({ quoteId: _q, lines, ...q }) => ({ ...q, lines: lines.map(({ raw: _r, ...l }, i) => ({ ...l, design: designs[q.id]?.[i] ?? null })) }))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || b.total - a.total),
  });
}
