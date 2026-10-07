import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { getRates, loadPack } from "@/lib/training";

export const dynamic = "force-dynamic";

/** Reference trees of every size and shape with what we charged, plus the average per size. */
export async function GET() {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  if (!pack) return NextResponse.json({ error: "The course isn't loaded yet" }, { status: 400 });
  const rates = await getRates(pack);
  const refs = pack.trees.filter((t) => t.reference).map(({ quoteId: _q, ...t }) => ({ ...t, strands: Math.round(t.unit / rates.perStrand) }));
  return NextResponse.json({ groups: pack.treeGroups, refs, perStrand: rates.perStrand });
}
