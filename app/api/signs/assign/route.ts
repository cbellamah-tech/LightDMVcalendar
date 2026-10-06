import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { assignRoute } from "@/lib/signs";

export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const { routeId, crew, user } = await req.json().catch(() => ({}));
  if (!routeId) return NextResponse.json({ error: "routeId required" }, { status: 400 });
  await assignRoute(routeId, crew, user);
  return NextResponse.json({ ok: true });
}
