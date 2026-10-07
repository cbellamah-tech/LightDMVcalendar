import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getRoutes, getVisits, routeVisibleTo, Visit } from "@/lib/signs";

export const dynamic = "force-dynamic";

/** One route with its stops and each stop's latest visit. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const route = (await getRoutes()).find((r) => r.id === params.id);
  if (!route || !routeVisibleTo(route, s)) return NextResponse.json({ error: "Route not found" }, { status: 404 });
  const visits = await getVisits();
  const lastVisit: Record<string, Visit> = {};
  for (const st of route.stops) if (visits[st.id]?.[0]) lastVisit[st.id] = visits[st.id][0];
  return NextResponse.json({ route, lastVisit, me: { uid: s.uid, name: s.name, role: s.role, crew: s.crew } });
}
