import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getLive, getMeta, getRoutes, getVisits, routeVisibleTo } from "@/lib/signs";

export const dynamic = "force-dynamic";

/** Route list without the stops (thousands of them); a route's stops come from /api/signs/route/[id]. */
export async function GET() {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const office = s.role === "owner" || s.role === "manager";
  const routes = await getRoutes(); // seeds from the bundled CSV on first use
  const [visits, live, meta] = await Promise.all([getVisits(), getLive(), getMeta()]);
  const summaries = routes.filter((r) => routeVisibleTo(r, s)).map((r) => {
    let visited = 0, lastAt = 0, lat = 0, lng = 0;
    const groups = new Set<string>();
    for (const st of r.stops) {
      const v = visits[st.id]?.[0];
      if (v && v.status !== "skipped") visited++;
      if (v && v.at > lastAt) lastAt = v.at;
      lat += st.lat; lng += st.lng;
      if (st.cluster) groups.add(st.cluster);
    }
    const n = Math.max(1, r.stops.length);
    return {
      id: r.id, name: r.name, rank: r.rank, state: r.state, assignedCrew: r.assignedCrew, assignedUser: r.assignedUser,
      stops: r.stops.length, groups: groups.size, visited, lastAt: lastAt || undefined, lat: lat / n, lng: lng / n,
    };
  });
  return NextResponse.json({ routes: summaries, live: office ? Object.values(live) : [], meta, office, me: { uid: s.uid, name: s.name, role: s.role, crew: s.crew } });
}
