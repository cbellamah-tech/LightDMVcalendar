import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { etDay } from "@/lib/crewNotes";
import type { Session } from "@/lib/session";
import { CREWS } from "@/lib/users";
import { bestOrder, crewDay, saveOrder } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/* Today's route for one crew, in the order they'll drive it. A crew lead changes their own crew's order; the office
   changes any crew's. The ETAs on the office map and on every customer's link follow the new order. */

const crewOf = (s: Session, asked: string | null) => {
  const office = s.role === "owner" || s.role === "manager";
  const crew = office ? asked || s.crew : s.crew;
  return crew && CREWS[crew] ? crew : null;
};

const view = async (crew: string) => {
  const cd = await crewDay(crew, etDay());
  return {
    crew, lead: cd.lead, custom: !!cd.order, by: cd.order?.by,
    stops: cd.stops.map((s) => ({ jobId: s.jobId, n: s.n, kind: s.kind, status: s.status, client: s.client, address: s.address, onMap: !!s.at, etaFrom: s.etaFrom, etaTo: s.etaTo })),
  };
};

export async function GET(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const crew = crewOf(s, new URL(req.url).searchParams.get("crew"));
  if (!crew) return NextResponse.json({ error: "You're not on a crew." }, { status: 400 });
  return NextResponse.json(await view(crew));
}

/* Body: { crew?, order: jobId[] } to set it, { crew?, best: true } for the shortest drive, { crew?, reset: true } for Jobber's order. */
export async function POST(req: Request) {
  const s = await requireRole("owner", "manager", "lead");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const crew = crewOf(s, typeof b.crew === "string" ? b.crew : null);
  if (!crew) return NextResponse.json({ error: "You're not on a crew." }, { status: 400 });
  const day = etDay();
  if (b.reset) await saveOrder(crew, day, null, s.name);
  else if (b.best) await saveOrder(crew, day, bestOrder(await crewDay(crew, day)), s.name);
  else if (Array.isArray(b.order) && b.order.every((x: unknown) => typeof x === "string")) {
    const known = new Set((await crewDay(crew, day)).stops.map((x) => x.jobId));
    await saveOrder(crew, day, (b.order as string[]).filter((id) => known.has(id)), s.name);
  } else return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  return NextResponse.json(await view(crew));
}
