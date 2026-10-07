import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { distanceM } from "@/lib/geo";
import { getRoutes, getVisits, routeVisibleTo, Visit } from "@/lib/signs";

export const dynamic = "force-dynamic";

/** Sign spots near the phone (any route this person can see), for GPS mode on the routes page. */
export async function GET(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const u = new URL(req.url);
  const at = { lat: Number(u.searchParams.get("lat")), lng: Number(u.searchParams.get("lng")) };
  if (!Number.isFinite(at.lat) || !Number.isFinite(at.lng)) return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  const near = [];
  for (const r of await getRoutes()) {
    if (!routeVisibleTo(r, s)) continue;
    for (const st of r.stops) {
      const d = distanceM(at, st);
      if (d <= 3000) near.push({ ...st, routeName: r.name, d });
    }
  }
  near.sort((a, b) => a.d - b.d);
  const stops = near.slice(0, 40);
  const visits = await getVisits();
  const lastVisit: Record<string, Visit> = {};
  for (const st of stops) if (visits[st.id]?.[0]) lastVisit[st.id] = visits[st.id][0];
  return NextResponse.json({ stops, lastVisit });
}
