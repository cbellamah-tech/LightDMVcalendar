import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { distanceM } from "@/lib/geo";
import { addPay, addVisit, getRoutes, paidStatus, PAY_PER_SIGN, routeVisibleTo, Visit, VISIT_LABEL, VisitStatus } from "@/lib/signs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const status = b.status as VisitStatus;
  if (!VISIT_LABEL[status]) return NextResponse.json({ error: "Bad status" }, { status: 400 });
  const routes = await getRoutes();
  const route = routes.find((r) => r.stops.some((st) => st.id === b.stopId));
  const stop = route?.stops.find((st) => st.id === b.stopId);
  if (!route || !stop || !routeVisibleTo(route, s)) return NextResponse.json({ error: "Unknown stop" }, { status: 404 });
  if (stop.photoRequired && status !== "skipped" && !b.photoUrl) {
    return NextResponse.json({ error: "This stop needs a photo." }, { status: 400 });
  }
  const hasPos = Number.isFinite(b.lat) && Number.isFinite(b.lng);
  const signs = paidStatus(status) ? Math.min(12, Math.max(1, Math.round(Number(b.signs) || stop.signs || 1))) : undefined;
  const pay = s.role === "signs" && signs && typeof b.photoUrl === "string" ? signs * PAY_PER_SIGN : undefined;
  const visit: Visit = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stopId: stop.id,
    routeId: stop.routeId,
    by: s.uid,
    byName: s.name,
    at: Date.now(),
    status,
    lat: hasPos ? b.lat : undefined,
    lng: hasPos ? b.lng : undefined,
    accuracyM: Number.isFinite(b.accuracyM) ? Math.round(b.accuracyM) : undefined,
    distanceM: hasPos ? Math.round(distanceM({ lat: b.lat, lng: b.lng }, stop)) : undefined,
    photoUrl: typeof b.photoUrl === "string" ? b.photoUrl : undefined,
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : undefined,
    signs,
    pay,
  };
  await Promise.all([
    addVisit(visit),
    pay ? addPay(s.uid, { visitId: visit.id, stopId: stop.id, routeId: stop.routeId, stopName: stop.name, at: visit.at, signs: signs!, amount: pay, photoUrl: visit.photoUrl, lat: visit.lat, lng: visit.lng, name: s.name }) : null,
  ]);
  return NextResponse.json(visit);
}
