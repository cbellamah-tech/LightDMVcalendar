import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { aiReady } from "@/lib/cxSummary";
import { EVERY, getBots, removeBot, runBot, saveBot, SEES, type Every, type Sees } from "@/lib/bots";
import { getFeed } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Owners: every bot with its job, schedule, last run and what it has posted. */
export async function GET() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const [bots, feed, ai] = await Promise.all([getBots(), getFeed(), aiReady()]);
  return NextResponse.json({
    bots: bots.map((b) => ({ ...b, posts: feed.filter((f) => !f.dismissed && f.bot.toLowerCase() === b.name.toLowerCase()).slice(0, 6) })),
    // Reports from bots that aren't set up here (still posting through the drop box).
    others: feed.filter((f) => !f.dismissed && !bots.some((b) => b.name.toLowerCase() === f.bot.toLowerCase())).slice(0, 20),
    every: EVERY, sees: SEES, ai,
  });
}

/** { name, job?, every?, sees?, area? } saves; { add: name } makes a new bot; { remove: name }; { run: name } runs it now. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const name = (x: unknown) => (typeof x === "string" ? x.trim().replace(/[^\w &'-]/g, "").slice(0, 30) : "");
  if (b.run) {
    const r = await runBot(String(b.run));
    return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r);
  }
  if (b.remove) { await removeBot(String(b.remove)); return NextResponse.json({ ok: true }); }
  const n = name(b.add ?? b.name);
  if (!n) return NextResponse.json({ error: "Give the bot a name" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof b.job === "string") patch.job = b.job.slice(0, 12000);
  if (b.every in EVERY) patch.every = b.every as Every;
  if (Array.isArray(b.sees)) patch.sees = b.sees.filter((x: string) => x in SEES) as Sees[];
  if (b.area === "owners" || b.area === "marketing") patch.area = b.area;
  const bot = await saveBot(n, patch, !!b.add);
  return bot ? NextResponse.json(bot) : NextResponse.json({ error: "No bot by that name" }, { status: 404 });
}
