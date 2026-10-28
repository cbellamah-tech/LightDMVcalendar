import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { laterOnce } from "@/lib/background";
import { ghlConfigured } from "@/lib/ghl";
import { ghlContactUrl } from "@/lib/cxGhl";
import { addDays, etDay, weekOf } from "@/lib/marketing";
import { episodes, getCalls, getWho, insights, rangeStats, seasonStart, soldByContact, syncCalls } from "@/lib/calls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Calls page: today, this week and the season, the missed callers still waiting, and every call behind each number.
    The saved copy comes back at once; GoHighLevel is re-read in the background when it's over 2 minutes old. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  if (!ghlConfigured()) return NextResponse.json({ configured: false });
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  let saved = await getCalls();
  if (refresh || !saved) saved = await syncCalls(Date.now() + 40_000).catch(() => saved);
  else if (Date.now() - saved.at > 2 * 60_000) await laterOnce("calls-sync", () => syncCalls(), 90_000);

  const today = etDay(Date.now());
  const from = seasonStart(today);
  const calls = (saved?.calls ?? []).filter((c) => etDay(c.at) >= from);
  const sold = await soldByContact();
  const eps = episodes(calls, sold);
  const who = await getWho();
  const ids = new Set(calls.map((c) => c.contactId));
  const people = Object.fromEntries([...ids].map((id) => [id, { ...(who[id] ?? { name: "Caller" }), link: ghlContactUrl(id), soldDay: sold.get(id) }]));

  // The Today page's card: just the people still owed a call back and today's numbers.
  if (new URL(req.url).searchParams.get("summary") === "1") {
    const owed = eps.filter((e) => !e.reachedAt && e.day >= addDays(today, -14));
    return NextResponse.json({ configured: true, owed: owed.length, notTried: owed.filter((e) => !e.tries).length, today: rangeStats(calls, eps, today, today, sold) });
  }

  const daily: { day: string; answered: number; missed: number; out: number }[] = [];
  const byDay = new Map<string, { answered: number; missed: number; out: number }>();
  for (const c of calls) {
    const d = etDay(c.at);
    const r = byDay.get(d) ?? { answered: 0, missed: 0, out: 0 };
    if (c.dir === "out") r.out++; else if (c.missed) r.missed++; else r.answered++;
    byDay.set(d, r);
  }
  for (let d = from; d <= today; d = addDays(d, 1)) daily.push({ day: d, ...(byDay.get(d) ?? { answered: 0, missed: 0, out: 0 }) });

  return NextResponse.json({
    configured: true,
    at: saved?.at ?? null,
    error: saved?.error,
    today, seasonFrom: from,
    stats: {
      today: rangeStats(calls, eps, today, today, sold),
      week: rangeStats(calls, eps, weekOf(today), today, sold),
      season: rangeStats(calls, eps, from, today, sold),
    },
    insights: insights(calls, eps, today, from),
    episodes: eps.slice().reverse(),
    calls: calls.slice().reverse().map((c) => ({ id: c.id, contactId: c.contactId, at: c.at, dir: c.dir, status: c.status, secs: c.secs, missed: c.missed, answered: c.answered })),
    people,
    daily,
  });
}
