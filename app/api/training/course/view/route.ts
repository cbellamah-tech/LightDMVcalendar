import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { loadPack } from "@/lib/training";

export const dynamic = "force-dynamic";

/** ?job=<id>&kind=street|overhead: a daytime Street View or satellite picture of a practice house. Needs a Google Maps
 *  key in GOOGLE_MAPS_KEY (Street View Static and Maps Static on); without one the page shows the map and links only. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const key = process.env.GOOGLE_MAPS_KEY;
  const u = new URL(req.url);
  const j = (await loadPack())?.quote?.jobs.find((x) => x.id === u.searchParams.get("job"));
  if (!key || !j) return new NextResponse(null, { status: 404 });
  const at = j.lat && j.lng ? `${j.lat},${j.lng}` : j.address;
  const g = u.searchParams.get("kind") === "overhead"
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(at)}&zoom=20&size=640x480&maptype=satellite&key=${key}`
    : `https://maps.googleapis.com/maps/api/streetview?size=640x400&location=${encodeURIComponent(at)}&source=outdoor&return_error_code=true&key=${key}`;
  const r = await fetch(g, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return new NextResponse(null, { status: 404 });
  return new NextResponse(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=86400" } });
}
