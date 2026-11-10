import { kvGet, kvSet } from "./store";
import { gapi, googleStatus } from "./google";
import { excelDay, excelTime, readFirstSheet } from "./xlsx";

/* Radio spots that really aired, from the station's spot reports. iHeart's rep emails an Excel "spot report"
   to info@ every week or two; the app reads every one it hasn't seen (no upload, nothing to forward).
   A newer report replaces the days it covers, so overlapping reports never count a spot twice.
   Kept only in the database: no spot data in the code. */

const KEY = "ldmv:mkt:radio:aired";
const QUERY = "from:iheartmedia.com has:attachment (filename:xlsx OR filename:xls) newer_than:200d";

export type AiredSpot = { day: string; time: string; len: number; title: string };
export type Aired = { at: number; through: string; spots: AiredSpot[]; seen: Record<string, 1>; reports: { id: string; day: string; name: string; n: number }[]; error?: string };

const empty = (): Aired => ({ at: 0, through: "", spots: [], seen: {}, reports: [] });
export const getAired = async () => (await kvGet<Aired>(KEY)) ?? empty();

/** Rows of a spot report that aired. Columns are found by name, so a slightly different report still reads. */
export function spotsFromReport(buf: Buffer): AiredSpot[] {
  const rows = readFirstSheet(buf);
  const hi = rows.findIndex((r) => r.some((c) => /actual date|air date|date aired/i.test(String(c ?? ""))));
  if (hi < 0) return [];
  const head = rows[hi].map((c) => String(c ?? "").trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const cDay = col("actual date", "air date", "date aired"), cTime = col("actual time", "air time", "time aired");
  const cLen = col("spot length", "length", "len"), cTitle = col("title", "isci", "copy"), cStatus = col("status");
  const out: AiredSpot[] = [];
  for (const r of rows.slice(hi + 1)) {
    const day = excelDay(r[cDay] ?? null);
    if (!day) continue;
    const status = cStatus < 0 ? "" : String(r[cStatus] ?? "");
    if (/miss|pre-?empt|not ?aired|bump|cancel|make ?good due/i.test(status)) continue;
    out.push({ day, time: cTime < 0 ? "" : excelTime(r[cTime] ?? null), len: Number(r[cLen]) || 0, title: cTitle < 0 ? "" : String(r[cTitle] ?? "").trim() });
  }
  return out;
}

/** Adds a report's spots. Reports overlap, so a newer report replaces every day it covers (reports are read oldest first). */
function merge(st: Aired, spots: AiredSpot[]) {
  if (!spots.length) return;
  const days = spots.map((s) => s.day).sort();
  const from = days[0], to = days[days.length - 1];
  st.spots = [...st.spots.filter((s) => s.day < from || s.day > to), ...spots];
  st.spots.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  if (to > st.through) st.through = to;
}

function attachments(part: any, out: { name: string; id: string }[] = []) {
  if (part?.filename && /\.xlsx?$/i.test(part.filename) && part.body?.attachmentId) out.push({ name: part.filename, id: part.body.attachmentId });
  for (const p of part?.parts ?? []) attachments(p, out);
  return out;
}

/** Reads spot reports in info@ that haven't been read yet. Runs with the morning marketing job. */
export async function syncAired(): Promise<Aired> {
  const st = await getAired();
  if (!(await googleStatus()).connected) return st;
  try {
    const list = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(QUERY)}`);
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id).filter((id: string) => !st.seen[id]).reverse(); // oldest first
    for (const id of ids) {
      const m = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
      let n = 0;
      for (const a of attachments(m.payload)) {
        const body = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${a.id}`);
        const buf = Buffer.from(String(body.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
        try {
          const spots = spotsFromReport(buf);
          merge(st, spots);
          n += spots.length;
          if (spots.length) st.reports.push({ id, day: new Date(Number(m.internalDate) || Date.now()).toISOString().slice(0, 10), name: a.name, n: spots.length });
        } catch { /* not a spot report */ }
      }
      st.seen[id] = 1;
    }
    st.at = Date.now(); st.error = undefined;
  } catch (e: any) {
    st.error = e.message;
  }
  await kvSet(KEY, st);
  return st;
}

/** Spots that aired each day, through the last day a report covers. */
export function airedDays(st: Aired): Map<string, number> {
  const by = new Map<string, number>();
  for (const s of st.spots) by.set(s.day, (by.get(s.day) ?? 0) + 1);
  return by;
}
