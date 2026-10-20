import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { logCount, undoCount, etDay } from "@/lib/marketing";
import { BIZ_KINDS, TOWNS, addBusiness, doneEvent, markDone, removeBusiness, setFollowed, todayList, writeComments } from "@/lib/engage";

/** Today's Instagram list: reels and local businesses, each with a comment ready to paste. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ ...(await todayList()), kinds: BIZ_KINDS, towns: TOWNS });
}

/** add / remove / follow a business, done (or undone) on a row, or write comments for one post. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const str = (x: unknown, n = 300) => (typeof x === "string" ? x.slice(0, n) : "");
  switch (b.action) {
    case "add": {
      const err = await addBusiness(str(b.handle, 200), str(b.kind), str(b.town), s.name);
      return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true });
    }
    case "remove": await removeBusiness(str(b.handle)); return NextResponse.json({ ok: true });
    case "follow": await setFollowed(str(b.handle), !!b.followed); return NextResponse.json({ ok: true });
    case "done": {
      const day = etDay(Date.now());
      const id = str(b.id);
      if (!id) return NextResponse.json({ error: "Missing row" }, { status: 400 });
      const had = await doneEvent(day, id);
      if (b.undo) {
        if (had) await undoCount(had);
        await markDone(day, id, s.name, null);
      } else if (!had) {
        const ev = await logCount({ channel: "instagram_engage", n: 1, by: s.name, note: str(b.title, 100), via: "tap" });
        await markDone(day, id, s.name, ev.id);
      }
      return NextResponse.json({ ok: true });
    }
    case "write": {
      if (!str(b.about).trim()) return NextResponse.json({ error: "Say what the post shows first." }, { status: 400 });
      const r = await writeComments(str(b.about, 2000), str(b.where, 200));
      return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r);
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
