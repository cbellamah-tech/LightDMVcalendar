import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { later } from "@/lib/background";
import { distanceM } from "@/lib/geo";
import { addPay, addStop, addVisit, getRoutes, PAY_PER_SIGN, renameStop, routeVisibleTo, Visit } from "@/lib/signs";

export const dynamic = "force-dynamic";

/** Street name for a new spot, from OpenStreetMap. Best effort: the spot keeps its plain name otherwise. */
async function placeName(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`, {
      headers: { "user-agent": "LightDMV-App/1.0 (yard sign routes)" },
      signal: AbortSignal.timeout(5000),
    });
    const j = await res.json();
    const a = j.address || {};
    const road = a.road || a.pedestrian || j.name;
    const town = a.city || a.town || a.village || a.suburb || a.hamlet;
    return road ? [road, town].filter(Boolean).join(", ") : undefined;
  } catch {
    return undefined;
  }
}

/** One tap in the field: a new sign spot exactly where the phone is, joined to the route and logged as placed with its photo. */
export async function POST(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return NextResponse.json({ error: "Your location isn't known yet. Wait for GPS and try again." }, { status: 400 });
  if (typeof b.photoUrl !== "string") return NextResponse.json({ error: "Take a photo of the sign." }, { status: 400 });
  await getRoutes(); // make sure routes exist before adding to them
  const at = { lat: b.lat, lng: b.lng };
  const signs = Math.min(12, Math.max(1, Math.round(Number(b.signs) || 1)));
  const { stop, created } = await addStop(at, s.name, (r) => routeVisibleTo(r, s), typeof b.routeId === "string" ? b.routeId : undefined, undefined, signs);
  if (created) {
    later("sign spot name", async () => { const n = await placeName(at.lat, at.lng); if (n) await renameStop(stop.id, n); });
  }
  const pay = s.role === "signs" ? signs * PAY_PER_SIGN : undefined;
  const visit: Visit = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stopId: stop.id,
    routeId: stop.routeId,
    by: s.uid,
    byName: s.name,
    at: Date.now(),
    status: "placed",
    lat: b.lat,
    lng: b.lng,
    accuracyM: Number.isFinite(b.accuracyM) ? Math.round(b.accuracyM) : undefined,
    distanceM: Math.round(distanceM(at, stop)),
    photoUrl: b.photoUrl,
    signs,
    pay,
  };
  await Promise.all([
    addVisit(visit),
    pay ? addPay(s.uid, { visitId: visit.id, stopId: stop.id, routeId: stop.routeId, stopName: stop.name, at: visit.at, signs, amount: pay, photoUrl: b.photoUrl, lat: b.lat, lng: b.lng, added: created, name: s.name }) : null,
  ]);
  return NextResponse.json({ stop, visit, created });
}
