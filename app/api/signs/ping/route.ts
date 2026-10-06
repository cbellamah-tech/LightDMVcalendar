import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { setLive } from "@/lib/signs";

export async function POST(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  await setLive({ uid: s.uid, name: s.name, lat: b.lat, lng: b.lng, accuracyM: b.accuracyM, at: Date.now(), routeId: b.routeId });
  return NextResponse.json({ ok: true });
}
