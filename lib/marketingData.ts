import { kvGet, kvSet } from "./store";
import { BOXES, CHANNELS, ChannelId, addDays, dailyCounts, etDay, getEvents, getFeed, sheetWeek, weekOf, weekTotals } from "./marketing";
import { getGhlSnap, ghlConfigured, leadSource, refreshGhl } from "./ghl";
import { googleStatus, inboxThreads, InboxThread, SheetCell, sheetUrl, writeSheet } from "./google";

/* Everything the Marketing tab shows, in one read. */

const INBOX = "ldmv:google:inbox";
const FILL = "ldmv:mkt:lastfill";

export type Light = "good" | "warning" | "critical" | "none";

function light(done: number, goal: number, daysIn: number): Light {
  if (!goal) return "none";
  const expected = (goal * daysIn) / 7;
  if (done >= expected) return "good";
  return done >= expected * 0.6 ? "warning" : "critical";
}

async function inbox(force = false) {
  const g = await googleStatus();
  if (!g.connected) return null;
  const cur = await kvGet<{ at: number; threads: InboxThread[]; error?: string }>(INBOX);
  if (cur && !force && Date.now() - cur.at < 5 * 60_000) return cur;
  try {
    const next = { at: Date.now(), threads: await inboxThreads() };
    await kvSet(INBOX, next);
    return next;
  } catch (e: any) {
    const next = { at: Date.now(), threads: cur?.threads ?? [], error: e.message };
    await kvSet(INBOX, next);
    return next;
  }
}

export async function marketingDashboard(opts: { week?: string; refresh?: boolean } = {}) {
  const today = etDay(Date.now());
  const thisWeek = weekOf(today);
  const week = opts.week ? weekOf(opts.week) : thisWeek;
  const daysIn = week === thisWeek ? Math.max(1, (Date.parse(today) - Date.parse(week)) / 86400_000 + 1) : 7;

  const ghl = ghlConfigured() ? await refreshGhl(opts.refresh ? 0 : undefined).catch(() => getGhlSnap()) : null;
  const daily = await dailyCounts(ghl?.posts ?? []);
  const totals = weekTotals(daily, week);
  const prev = weekTotals(daily, addDays(week, -7));

  const channels = CHANNELS.map((c) => {
    const goal = c.monthlyGoal ? Math.ceil(c.monthlyGoal / 4) : 0; // the sheet splits each month into 4 weeks
    return { ...c, done: totals[c.id], lastWeek: prev[c.id], goal, light: light(totals[c.id], goal, daysIn) };
  });

  const weekLeads = (ghl?.leads ?? []).filter((l) => l.day >= week && l.day <= addDays(week, 6));
  const bySource: Record<string, number> = {};
  for (const l of weekLeads) bySource[leadSource(l)] = (bySource[leadSource(l)] ?? 0) + 1;

  const boxes = BOXES.map((b) => {
    const cs = channels.filter((c) => c.box === b.id);
    const done = cs.reduce((s, c) => s + c.done, 0);
    const goal = cs.reduce((s, c) => s + c.goal, 0);
    return { ...b, done, goal, light: light(done, goal, daysIn), channels: cs.map((c) => c.id) };
  });

  const mail = await inbox(opts.refresh);
  const feed = (await getFeed()).filter((f) => !f.dismissed);

  return {
    today, week, thisWeek, daysIn,
    channels, boxes,
    events: (await getEvents()).slice(0, 25),
    ghl: {
      configured: ghlConfigured(),
      at: ghl?.at ?? null,
      errors: ghl?.errors ?? [],
      accounts: ghl?.accounts ?? [],
      leads: (ghl?.leads ?? []).slice(0, 40).map((l) => ({ ...l, sourceName: leadSource(l) })),
      weekLeads: weekLeads.length,
      bySource,
    },
    google: { ...(await googleStatus()), sheetUrl: sheetUrl() },
    inbox: mail,
    feed,
    lastFill: await kvGet<FillResult>(FILL),
  };
}

/* ---------- Weekly sheet fill ---------- */

export type FillResult = { at: number; week: string; by: string; written: { range: string; row: string; value: number }[]; missingRows: string[]; error?: string };

/** Cells touched by one week: each (month, sheet week) its days fall in, summed over the whole cell. */
export async function fillSheet(week: string, by: string, dry = false): Promise<FillResult> {
  const ghl = ghlConfigured() ? await refreshGhl().catch(() => getGhlSnap()) : null;
  const daily = await dailyCounts(ghl?.posts ?? []);
  const cellsTouched = new Set<string>(); // "YYYY-MM|week"
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekOf(week), i);
    if (d.startsWith("2026-")) cellsTouched.add(`${d.slice(0, 7)}|${sheetWeek(d)}`);
  }
  const cells: SheetCell[] = [];
  for (const key of cellsTouched) {
    const [ym, wk] = key.split("|");
    const days: string[] = [];
    for (let dd = 1; dd <= 31; dd++) {
      const d = `${ym}-${String(dd).padStart(2, "0")}`;
      if (etDay(new Date(`${d}T12:00:00Z`)) !== d) continue; // not a real date (Feb 30 etc.)
      if (sheetWeek(d) === +wk) days.push(d);
    }
    for (const c of CHANNELS) {
      const v = days.reduce((s, d) => s + (daily.get(`${c.id}|${d}`) ?? 0), 0);
      // Only cells the app has numbers for: a blank week in the app never wipes what someone typed.
      if (v > 0) cells.push({ row: c.sheetRow, month: +ym.slice(5, 7), week: +wk, value: v });
    }
  }
  if (dry) return { at: Date.now(), week, by, written: cells.map((c) => ({ range: `${c.month}/${c.week}`, row: c.row, value: c.value })), missingRows: [] };
  try {
    const r = await writeSheet(cells);
    const res: FillResult = { at: Date.now(), week, by, ...r };
    await kvSet(FILL, res);
    return res;
  } catch (e: any) {
    const res: FillResult = { at: Date.now(), week, by, written: [], missingRows: [], error: e.message };
    await kvSet(FILL, res);
    return res;
  }
}

export const channelIds = new Set<string>(CHANNELS.map((c) => c.id));
export const isChannel = (x: unknown): x is ChannelId => typeof x === "string" && channelIds.has(x);
