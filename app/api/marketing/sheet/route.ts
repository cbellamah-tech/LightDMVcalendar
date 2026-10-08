import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { googleStatus, readSheetGrid } from "@/lib/google";
import { syncSheet } from "@/lib/marketingData";
import { kvGet, kvSet } from "@/lib/store";
import { laterOnce } from "@/lib/background";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE = "ldmv:google:sheetgrid";

/** The campaign sheet as it is in Google, for the Marketing tab (cached 10 minutes; ?refresh=1 to re-read). */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const [g, cur] = await Promise.all([googleStatus(), kvGet<{ at: number; title: string; rows: string[][] }>(CACHE)]);
  if (!g.connected) return NextResponse.json({ connected: false });
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (cur && !refresh) {
    // The saved copy at once; over 10 minutes old, Google is re-read after the answer for the next visit.
    if (Date.now() - cur.at >= 10 * 60_000) await laterOnce("sheet-grid", async () => kvSet(CACHE, { at: Date.now(), ...(await readSheetGrid()) }), 60_000);
    return NextResponse.json({ connected: true, ...cur });
  }
  try {
    const g = { at: Date.now(), ...(await readSheetGrid()) };
    await kvSet(CACHE, g);
    return NextResponse.json({ connected: true, ...g });
  } catch (e: any) {
    return NextResponse.json({ connected: true, error: e.message, ...(cur ?? { rows: [] }) });
  }
}

/** Sync now: this week's and last week's counts into the sheet, then re-read it. */
export async function POST() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const r = await syncSheet(s.name);
  await kvSet(CACHE, null);
  return NextResponse.json(r);
}
