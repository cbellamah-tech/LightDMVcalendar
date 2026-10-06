import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getLive, getMeta, getRoutes, getVisits, routeVisibleTo, Visit } from "@/lib/signs";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const office = s.role === "owner" || s.role === "manager";
  const routes = await getRoutes(); // seeds from the bundled CSV on first use
  const [visits, live, meta] = await Promise.all([getVisits(), getLive(), getMeta()]);
  const visible = routes.filter((r) => routeVisibleTo(r, s));
  const lastVisit: Record<string, Visit> = {};
  for (const r of visible) for (const st of r.stops) if (visits[st.id]?.[0]) lastVisit[st.id] = visits[st.id][0];
  return NextResponse.json({
    routes: visible,
    lastVisit,
    live: office ? Object.values(live) : [],
    meta,
    office,
    me: { uid: s.uid, name: s.name, role: s.role, crew: s.crew },
  });
}
