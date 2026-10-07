import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { logCount, undoCount } from "@/lib/marketing";
import { isChannel } from "@/lib/marketingData";

/** +1 (or +n) on a channel: "posted a Craigslist ad", "hung 40 door hangers". */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const n = Math.round(Number(b.n ?? 1));
  if (!isChannel(b.channel) || !Number.isFinite(n) || n < 1 || n > 100000) return NextResponse.json({ error: "Pick a channel and a count" }, { status: 400 });
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : undefined;
  return NextResponse.json(await logCount({ channel: b.channel, n, day, by: s.name, note: typeof b.note === "string" ? b.note.slice(0, 200) : undefined, via: "tap" }));
}

export async function DELETE(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await undoCount(id);
  return NextResponse.json({ ok: true });
}
