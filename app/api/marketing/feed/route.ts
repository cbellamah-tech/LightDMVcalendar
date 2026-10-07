import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { answerFeed, getFeed } from "@/lib/marketing";

/** Answer a bot's question, or clear a report off the board. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const item = (await getFeed()).find((f) => f.id === b.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Owners' briefing items, and answers to bots, are for owners.
  if ((item.area === "owners" || b.answer) && s.role !== "owner") return NextResponse.json({ error: "Only an owner can answer this" }, { status: 403 });
  if (b.dismiss) return NextResponse.json(await answerFeed(item.id, { dismissed: true }));
  if (typeof b.answer !== "string" || !b.answer.trim()) return NextResponse.json({ error: "Missing answer" }, { status: 400 });
  return NextResponse.json(await answerFeed(item.id, {
    answer: { value: b.answer.trim().slice(0, 100), by: s.name, at: Date.now(), note: typeof b.note === "string" ? b.note.slice(0, 500) : undefined },
  }));
}
