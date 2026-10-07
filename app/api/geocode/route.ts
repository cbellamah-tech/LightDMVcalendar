import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Typed address to a map point, via OpenStreetMap, biased to the DC area. */
export async function GET(req: Request) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Type an address." }, { status: 400 });
  try {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("q", q);
    u.searchParams.set("limit", "1");
    u.searchParams.set("countrycodes", "us");
    u.searchParams.set("viewbox", "-78.2,39.6,-76.3,38.4");
    const res = await fetch(u, { headers: { "user-agent": "LightDMV-App/1.0 (yard sign routes)" }, signal: AbortSignal.timeout(6000) });
    const [hit] = await res.json();
    if (!hit) return NextResponse.json({ error: "Couldn't find that address. Try adding the city." }, { status: 404 });
    return NextResponse.json({ lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name.split(",").slice(0, 3).join(",") });
  } catch {
    return NextResponse.json({ error: "Address lookup isn't answering. Try again, or use My location." }, { status: 502 });
  }
}
