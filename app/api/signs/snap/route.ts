import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { later } from "@/lib/background";
import { distanceM } from "@/lib/geo";
import { addPay, addStop, addVisit, getRoutes, PAY_PER_SIGN, renameStop, routeVisibleTo, Stop, Visit } from "@/lib/signs";

export const dynamic = "force-dynamic";

async function placeName(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`, {
      headers: { "user-agent": "LightDMV-App/1.0 (yard sign routes)" }, signal: AbortSignal.timeout(5000),
    });
    const j = await res.json();
    const a = j.address || {};
    const road = a.road || a.pedestrian || j.name;
    const town = a.city || a.town || a.village || a.suburb || a.hamlet;
    return road ? [road, town].filter(Boolean).join(", ") : undefined;
  } catch { return undefined; }
}

/** One snap from the camera loop = one sign in the ground. Joins the spot the phone is at, or makes a new
 *  spot right there. `id` comes from the phone, so a retried upload is saved once and paid once. */
export async function POST(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string" || !/^[\w-]{6,64}$/.test(b.id)) return NextResponse.json({ error: "Bad snap id" }, { status: 400 });
  if (typeof b.photoUrl !== "string") return NextResponse.json({ error: "Photo missing" }, { status: 400 });
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return NextResponse.json({ error: "No GPS on this photo" }, { status: 400 });
  const at = { lat: b.lat, lng: b.lng };
  const acc = Number.isFinite(b.accuracyM) ? Math.round(b.accuracyM) : undefined;
  const when = Number.isFinite(b.at) && Math.abs(Date.now() - b.at) < 7 * 86400_000 ? b.at : Date.now();

  // The spot he's standing at, if one of his routes has a spot in range.
  const routes = (await getRoutes()).filter((r) => routeVisibleTo(r, s));
  let near: { st: Stop; d: number } | undefined;
  for (const r of routes) for (const st of r.stops) {
    const d = distanceM(at, st);
    if (!near || d < near.d) near = { st, d };
  }
  let stop: Stop, created = false;
  if (near && near.d <= near.st.radiusM + Math.min(acc ?? 40, 40)) stop = near.st;
  else {
    ({ stop, created } = await addStop(at, s.name, (r) => routeVisibleTo(r, s), typeof b.routeId === "string" ? b.routeId : undefined, undefined, 1));
    if (created) later("sign spot name", async () => { const n = await placeName(at.lat, at.lng); if (n) await renameStop(stop.id, n); });
  }

  const pay = s.role === "signs" ? PAY_PER_SIGN : undefined;
  const visit: Visit = {
    id: b.id, stopId: stop.id, routeId: stop.routeId, by: s.uid, byName: s.name, at: when, status: "placed",
    lat: at.lat, lng: at.lng, accuracyM: acc, distanceM: Math.round(distanceM(at, stop)), photoUrl: b.photoUrl, signs: 1, pay,
  };
  await Promise.all([
    addVisit(visit),
    pay ? addPay(s.uid, { visitId: visit.id, stopId: stop.id, routeId: stop.routeId, stopName: stop.name, at: when, signs: 1, amount: pay, photoUrl: b.photoUrl, lat: at.lat, lng: at.lng, added: created, name: s.name }, true) : null,
  ]);
  return NextResponse.json({ ok: true, stopId: stop.id, stopName: stop.name, routeId: stop.routeId, created, pay: pay ?? 0 });
}
