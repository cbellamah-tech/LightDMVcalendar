import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { DRILL_PASS, getProgress, getRates, loadPack, moduleStatus, QUOTES_PASS } from "@/lib/training";

export const dynamic = "force-dynamic";

/** One module's lesson cards and what it takes to pass it. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  const m = pack?.modules.find((x) => x.id === params.id);
  if (!pack || !m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [p, rates] = await Promise.all([getProgress(s.uid), getRates(pack)]);
  const i = pack.modules.indexOf(m);
  return NextResponse.json({
    ...m, ...moduleStatus(m, p, rates.passPct), rates, bands: pack.bands, treeGroups: pack.treeGroups,
    number: i + 1, next: pack.modules[i + 1]?.id ?? null,
    pass: m.practice === "drill" ? DRILL_PASS : m.practice === "quotes" ? QUOTES_PASS : null,
  });
}
