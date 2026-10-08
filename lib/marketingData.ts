import { getDrafts, POST_URL } from "./drafts";
import { adsSummary, allAdDays } from "./ads";
import { attribution } from "./attribution";
import { getAutoPost } from "./autopost";
import { kvGet, kvSet } from "./store";
import { BOXES, CHANNELS, ChannelId, addDays, dailyCounts, etDay, getEvents, getFeed, logCount, sheetWeek, weekOf, weekTotals } from "./marketing";
import { getGhlSnap, ghlConfigured, leadSource, refreshGhl } from "./ghl";
import { coldEmailReports, ColdReport, googleStatus, inboxThreads, InboxThread, SheetCell, sheetUrl, writeRunnerFile, writeSheet } from "./google";
import { getMedia, PLATFORMS, runnerKey } from "./media";
import { stableOrigin } from "./jobber";

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

/* Cold emails sent count themselves from the agency's weekly Smartlead update in info@ (counted on the day it arrives). */
const COLD = "ldmv:mkt:smartlead";
export const SMARTLEAD_URL = "https://app.smartlead.ai/client-login";
async function syncColdEmail() {
  const seen = (await kvGet<Record<string, ColdReport>>(COLD)) ?? {};
  for (const r of await coldEmailReports()) {
    if (seen[r.id]) continue;
    await logCount({ channel: "cold_emails", n: r.sent, day: r.day, by: "Smartlead weekly report", via: "bot", note: `${r.responses} responses, ${r.positive} positive` });
    seen[r.id] = r;
  }
  await kvSet(COLD, seen);
}
const latestCold = async () => Object.values((await kvGet<Record<string, ColdReport>>(COLD)) ?? {}).sort((a, b) => b.day.localeCompare(a.day))[0] ?? null;

async function inbox(force = false) {
  const g = await googleStatus();
  if (!g.connected) return null;
  const cur = await kvGet<{ at: number; threads: InboxThread[]; error?: string }>(INBOX);
  if (cur && !force && Date.now() - cur.at < 5 * 60_000 && cur.threads.every((t) => t.kind)) return cur;
  try {
    await syncColdEmail().catch(() => {});
    const next = { at: Date.now(), threads: await inboxThreads() };
    await kvSet(INBOX, next);
    return next;
  } catch (e: any) {
    const next = { at: Date.now(), threads: cur?.threads ?? [], error: e.message };
    await kvSet(INBOX, next);
    return next;
  }
}

export async function marketingDashboard(opts: { week?: string; refresh?: boolean; days?: number } = {}) {
  const today = etDay(Date.now());
  const thisWeek = weekOf(today);
  const week = opts.week ? weekOf(opts.week) : thisWeek;
  const daysIn = week === thisWeek ? Math.max(1, (Date.parse(today) - Date.parse(week)) / 86400_000 + 1) : 7;

  const ghl = ghlConfigured() ? await refreshGhl(opts.refresh ? 0 : undefined).catch(() => getGhlSnap()) : null;
  const daily = await dailyCounts(ghl?.posts ?? [], await allAdDays());
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
      weekLeads: weekLeads.length,
      bySource,
    },
    google: { ...(await googleStatus()), sheetUrl: sheetUrl() },
    inbox: mail,
    feed,
    autopost: (await getAutoPost()).on,
    drafts: { text: await getDrafts(), urls: POST_URL },
    attribution: ghl ? attribution(ghl.leads, ghl.opps ?? [], await allAdDays(), opts.days ?? 30, today) : null,
    ads: await adsSummary(),
    cold: { url: SMARTLEAD_URL, latest: await latestCold() },
    media: (await getMedia()).filter((m) => m.status === "ready" && !m.skipped).slice(0, 14),
    platforms: PLATFORMS,
    lastFill: await kvGet<FillResult>(FILL),
  };
}

/* ---------- Weekly sheet fill ---------- */

export type FillResult = { at: number; week: string; by: string; written: { range: string; row: string; value: number }[]; missingRows: string[]; error?: string };

/** Cells touched by one week: each (month, sheet week) its days fall in, summed over the whole cell. */
export async function fillSheet(week: string, by: string, dry = false): Promise<FillResult> {
  const ghl = ghlConfigured() ? await refreshGhl().catch(() => getGhlSnap()) : null;
  const daily = await dailyCounts(ghl?.posts ?? [], await allAdDays());
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

/** Daily: this week and last week into the sheet (a new week's first days also finish last week's cells). */
export async function syncSheet(by: string) {
  const thisWeek = weekOf(etDay(Date.now()));
  const last = await fillSheet(addDays(thisWeek, -7), by);
  const now = await fillSheet(thisWeek, by);
  return { written: last.written.length + now.written.length, error: now.error || last.error };
}

/* The daily video run finds the app through a small file this app keeps in Drive (only the production app
   writes it: previews sit behind Vercel's login, which the run can't get past). */
const RUNNER_AT = "ldmv:mkt:runnerfile";
export async function ensureRunnerFile(force = false) {
  if (process.env.VERCEL_ENV !== "production" && !process.env.APP_URL) return;
  if (!(await googleStatus()).connected) return;
  const at = await kvGet<number>(RUNNER_AT);
  if (!force && at && Date.now() - at < 86400_000) return;
  await writeRunnerFile(JSON.stringify({ url: stableOrigin(""), key: await runnerKey() }));
  await kvSet(RUNNER_AT, Date.now());
}
