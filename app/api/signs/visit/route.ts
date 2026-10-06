import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { distanceM } from "@/lib/geo";
import { addVisit, getRoutes, VISIT_LABEL, VisitStatus } from "@/lib/signs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const status = b.status as VisitStatus;
  if (!VISIT_LABEL[status]) return NextResponse.json({ error: "Bad status" }, { status: 400 });
  const routes = await getRoutes();
  const stop = routes.flatMap((r) => r.stops).find((st) => st.id === b.stopId);
  if (!stop) return NextResponse.json({ error: "Unknown stop" }, { status: 404 });
  if (stop.photoRequired && status !== "skipped" && !b.photoUrl) {
    return NextResponse.json({ error: "This stop needs a photo." }, { status: 400 });
  }
  const hasPos = Number.isFinite(b.lat) && Number.isFinite(b.lng);
  const visit = {
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
  };
  await addVisit(visit);
  return NextResponse.json(visit);
}
