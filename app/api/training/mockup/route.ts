import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { imageCounts, mockupUrl } from "@/lib/quotePhotos";
import { loadPack, mockupRef } from "@/lib/training";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ?ref=pq:<id>: how many mockups each line has. Add &l=<line>&k=<n> to open one. */
export async function GET(req: Request) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  const u = new URL(req.url);
  const ref = pack && mockupRef(pack, u.searchParams.get("ref") || "");
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.searchParams.has("l")) {
    try { return NextResponse.json(await imageCounts(ref.quoteId, ref.lines)); }
    catch (e: any) { return NextResponse.json({ counts: ref.lines.map(() => 0), error: e.message }); }
  }
  const l = Number(u.searchParams.get("l")), k = Number(u.searchParams.get("k") || 0);
  if (!ref.lines[l]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await mockupUrl(ref.quoteId, l, ref.lines[l], k).catch(() => null);
  return url ? NextResponse.redirect(new URL(url, u.origin)) : NextResponse.json({ error: "No mockup" }, { status: 404 });
}
