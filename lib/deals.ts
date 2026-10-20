import { kvGet, kvSet } from "./store";
import { gapi, googleStatus } from "./google";
import { addDays, etDay } from "./marketing";

/* Paid deals bought for a set time (radio, a vendor's email blast...). Their figures live in the
   "Light DMV marketing deals" sheet in the Marketing folder, never here: one row per deal with
   Deal, Vendor, Channels, Start, End, Total cost, Paid radio spots, Bonus spots per week, Emails, Status, Notes. */

export const DEALS_SHEET_TITLE = "Light DMV marketing deals";
const CACHE = "ldmv:mkt:deals";

export type Deal = {
  name: string; vendor: string; channels: string[]; start: string; end: string;
  cost: number; spots: number; bonusPerWeek: number; emails: number; status: string; notes: string;
};
type Cached = { at: number; url: string | null; deals: Deal[]; error?: string };

const num = (s?: string) => Number(String(s ?? "").replace(/[$,\s]/g, "")) || 0;
/** "10/19/2026" or "2026-10-19" as "YYYY-MM-DD". */
function day(s?: string): string {
  const t = String(s ?? "").trim();
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

async function readDeals(): Promise<Cached> {
  const q = encodeURIComponent(`name = '${DEALS_SHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
  const found = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`);
  const id: string | undefined = found.files?.[0]?.id;
  if (!id) return { at: Date.now(), url: null, deals: [] };
  const v = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:Z50?valueRenderOption=FORMATTED_VALUE`);
  const [head = [], ...rows] = (v.values ?? []) as string[][];
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const at = (r: string[], name: string) => (col(name) < 0 ? "" : (r[col(name)] ?? "").trim());
  const deals = rows.filter((r) => at(r, "Deal")).map((r) => ({
    name: at(r, "Deal"), vendor: at(r, "Vendor"),
    channels: at(r, "Channels").toLowerCase().split(/[\s,+]+/).filter(Boolean),
    start: day(at(r, "Start")), end: day(at(r, "End")),
    cost: num(at(r, "Total cost")), spots: num(at(r, "Paid radio spots")), bonusPerWeek: num(at(r, "Bonus spots per week")),
    emails: num(at(r, "Emails")), status: at(r, "Status"), notes: at(r, "Notes"),
  })).filter((d) => d.start && d.end && d.end >= d.start);
  return { at: Date.now(), url: `https://docs.google.com/spreadsheets/d/${id}/edit`, deals };
}

/** The deals sheet, re-read at most every 30 minutes (or when forced). */
export async function getDeals(force = false): Promise<Cached> {
  const cur = await kvGet<Cached>(CACHE);
  if (cur && !force && Date.now() - cur.at < 30 * 60_000) return cur;
  if (!(await googleStatus()).connected) return cur ?? { at: 0, url: null, deals: [] };
  try {
    const next = await readDeals();
    await kvSet(CACHE, next);
    return next;
  } catch (e: any) {
    return { ...(cur ?? { url: null, deals: [] }), at: cur?.at ?? 0, error: e.message };
  }
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000) + 1;
export const dealDays = (d: Deal) => daysBetween(d.start, d.end);

/** Radio spots each day of a deal: the paid spots spread evenly over the run, plus the weekly bonus spots. */
export function radioSpotDays(deals: Deal[]): { day: string; n: number }[] {
  const out: { day: string; n: number }[] = [];
  for (const d of deals) {
    if (!d.channels.includes("radio")) continue;
    const per = d.spots / dealDays(d) + d.bonusPerWeek / 7;
    for (let x = d.start; x <= d.end; x = addDays(x, 1)) out.push({ day: x, n: per });
  }
  return out;
}

/** Where a deal stands today, for the Marketing tab. Spots and spend so far are pro-rated over the run. */
export function dealProgress(d: Deal, today = etDay(Date.now())) {
  const total = dealDays(d);
  const done = today < d.start ? 0 : today > d.end ? total : daysBetween(d.start, today);
  const share = done / total;
  const bonus = Math.round((d.bonusPerWeek * total) / 7);
  return {
    ...d, daysTotal: total, daysDone: done, daysLeft: total - done,
    spotsTotal: d.spots + bonus, spotsSoFar: Math.round((d.spots + bonus) * share),
    spentSoFar: Math.round(d.cost * share),
  };
}
