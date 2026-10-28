import { kvGet, kvSet } from "./store";
import { getGhlSnap, ghl, ghlConfigured, listIn, loc } from "./ghl";
import { isSold } from "./attribution";
import { addDays, etDay } from "./marketing";

/* Call tracking from GoHighLevel's phone line (chris, 2026-10-28): missed calls, how fast someone called back,
   whether we reached them, and whether they booked. Calls come from GoHighLevel's message export (channel Call),
   read a week at a time so a run that runs out of time picks up where it stopped. Names and phones stay in the
   database, never in this file. */

export type Call = { id: string; contactId: string; at: number; dir: "in" | "out"; status: string; secs: number; missed: boolean; answered: boolean };
type Saved = { at: number; readTo: number; calls: Call[]; error?: string; via?: "export" | "conversations" };
export type Who = { name: string; phone?: string };

const KEY = "ldmv:calls:v1";
const WHO = "ldmv:calls:who";
const WEEK = 7 * 86400_000;

/** The selling season starts September 1 (a call in August belongs to last season's numbers). */
export function seasonStart(today = etDay(Date.now())): string {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  return `${m >= 9 ? y : y - 1}-09-01`;
}

/** GoHighLevel answers 401/403 when the Private Integration key is missing a scope. */
export const CALL_SCOPES = "In GoHighLevel, Settings > Private Integrations, edit the app's key and tick View Conversations and View Conversation Messages.";

const MISSED = /no.?answer|missed|busy|fail|cancel|voicemail|unanswered/;
const ANSWERED = /completed|answered|in.?progress/;

export function parseCall(m: any): Call | null {
  const type = String(m.messageType ?? m.type ?? "");
  if (!/CALL/i.test(type) && type !== "1" && !m.meta?.call) return null;
  const at = Number(m.dateAdded) || Date.parse(m.dateAdded ?? m.createdAt ?? "") || 0;
  if (!at || !m.contactId) return null;
  const dir = m.direction === "outbound" ? "out" : "in";
  const status = String(m.meta?.call?.status ?? m.callStatus ?? m.status ?? "").toLowerCase();
  const secs = Number(m.meta?.call?.duration ?? m.callDuration ?? 0) || 0;
  const answered = !MISSED.test(status) && (ANSWERED.test(status) ? true : secs > 0);
  return { id: String(m.id), contactId: String(m.contactId), at, dir, status, secs, answered, missed: dir === "in" && !answered };
}

/** Every call between `from` and `to`, following GoHighLevel's cursor (it expires after 2 minutes, so no saving it). */
async function exportWindow(from: number, to: number, deadline: number): Promise<Call[] | null> {
  const out: Call[] = [];
  let cursor = "";
  for (let page = 0; page < 60; page++) {
    if (Date.now() > deadline) return null;
    const q = new URLSearchParams({ locationId: loc(), channel: "Call", limit: "100", startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString() });
    if (cursor) q.set("cursor", cursor);
    const j = await ghl(`/conversations/messages/export?${q}`);
    for (const m of listIn(j, ["messages"])) { const c = parseCall(m); if (c) out.push(c); }
    cursor = j?.nextCursor ?? "";
    if (!cursor) break;
  }
  return out;
}

/** Backup when the export isn't there: conversations changed since `from`, oldest first, calls read off each. */
async function conversationsSince(from: number, deadline: number): Promise<{ calls: Call[]; readTo: number }> {
  const convs: any[] = [];
  let after = "";
  const when = (c: any) => Number(c.lastMessageDate) || Date.parse(c.lastMessageDate ?? c.dateUpdated ?? "") || 0;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ locationId: loc(), limit: "100", sortBy: "last_message_date", sort: "desc" });
    if (after) q.set("startAfterDate", after);
    const list: any[] = listIn(await ghl(`/conversations/search?${q}`), ["conversations"]);
    convs.push(...list.filter((c) => when(c) >= from));
    if (list.length < 100 || list.some((c) => when(c) < from)) break;
    after = String(list[list.length - 1]?.sort?.[0] ?? when(list[list.length - 1]));
  }
  convs.sort((a, b) => when(a) - when(b));
  const calls: Call[] = [];
  let readTo = from;
  for (let i = 0; i < convs.length; i += 4) {
    if (Date.now() > deadline) break;
    const batch = convs.slice(i, i + 4);
    const got = await Promise.all(batch.map((c) => ghl(`/conversations/${encodeURIComponent(c.id)}/messages?limit=100`).catch(() => ({}))));
    for (const j of got) {
      const box = (j as any)?.messages ?? j;
      for (const m of Array.isArray(box?.messages) ? box.messages : listIn(j, ["messages"])) {
        const c = parseCall({ contactId: (m as any).contactId, ...m });
        if (c && c.at >= from) calls.push(c);
      }
    }
    readTo = Math.max(readTo, when(batch[batch.length - 1]));
  }
  return { calls, readTo };
}

export const getCalls = () => kvGet<Saved>(KEY);
export const getWho = async () => (await kvGet<Record<string, Who>>(WHO)) ?? {};

/** Read new calls from GoHighLevel until `deadline`. Each run re-reads the last day so late call statuses land. */
export async function syncCalls(deadline = Date.now() + 40_000): Promise<Saved | null> {
  if (!ghlConfigured()) return null;
  const cur = (await getCalls()) ?? { at: 0, readTo: Date.parse(`${seasonStart()}T04:00:00Z`), calls: [] };
  const byId = new Map(cur.calls.map((c) => [c.id, c]));
  let readTo = Math.min(cur.readTo, Date.now()) - (cur.at ? 86400_000 : 0);
  let error: string | undefined;
  let via = cur.via;
  try {
    if (via !== "conversations") {
      while (readTo < Date.now()) {
        const to = Math.min(readTo + WEEK, Date.now());
        const got = await exportWindow(readTo, to, deadline);
        if (!got) break;
        for (const c of got) byId.set(c.id, c);
        readTo = to;
        via = "export";
      }
    } else {
      const got = await conversationsSince(readTo, deadline);
      for (const c of got.calls) byId.set(c.id, c);
      readTo = got.readTo;
    }
  } catch (e: any) {
    if (/\((401|403)\)/.test(e.message)) error = `${e.message}. ${CALL_SCOPES}`;
    else if (via !== "export" && /\((400|404|405|422)\)/.test(e.message)) {
      // No message export on this account: walk the conversations instead from now on.
      via = "conversations";
      const got = await conversationsSince(readTo, deadline).catch((x) => { error = x.message; return null; });
      if (got) { for (const c of got.calls) byId.set(c.id, c); readTo = got.readTo; }
    } else error = e.message;
  }
  const from = Date.parse(`${addDays(seasonStart(), -60)}T04:00:00Z`);
  const calls = [...byId.values()].filter((c) => c.at >= from).sort((a, b) => a.at - b.at);
  const saved: Saved = { at: Date.now(), readTo: Math.max(readTo, cur.readTo - 86400_000), calls, error, via };
  await kvSet(KEY, saved);
  await fillNames(calls, deadline).catch(() => null);
  return saved;
}

/** Names and phones for callers, from the contacts the Marketing tab already has, then GoHighLevel for the rest. */
async function fillNames(calls: Call[], deadline: number) {
  const who = await getWho();
  const snap = await getGhlSnap();
  for (const l of snap?.leads ?? []) if (!who[l.id]) who[l.id] = { name: l.name, phone: l.phone };
  const missing = [...new Set(calls.slice().reverse().map((c) => c.contactId))].filter((id) => !who[id]).slice(0, 40);
  for (const id of missing) {
    if (Date.now() > deadline + 10_000) break;
    try {
      const c = (await ghl(`/contacts/${encodeURIComponent(id)}`))?.contact ?? {};
      who[id] = { name: String(c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || "Unknown caller").slice(0, 80), phone: c.phone || undefined };
    } catch { who[id] = { name: "Unknown caller" }; }
  }
  await kvSet(WHO, who);
}

/* ---------- The numbers ---------- */

/** One missed caller: the first missed call until someone talks to them. Missing them again before then is the same one. */
export type Episode = {
  contactId: string; at: number; day: string; misses: number;
  lastDay: string;       // the day of their last missed call before we reached them
  callbackAt?: number;   // first call out to them after the miss
  tries: number;         // calls out before we reached them
  reachedAt?: number; reachedHow?: "we called" | "they called again";
  booked?: boolean;
};

const ET_HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23", weekday: "short" });
export function etHour(t: number) {
  const p = ET_HOUR.formatToParts(t);
  return { hour: +(p.find((x) => x.type === "hour")?.value ?? 0) % 24, weekday: p.find((x) => x.type === "weekday")?.value ?? "" };
}
/** Open for calls: 8 AM to 6 PM, Monday to Saturday (Eastern). */
export const afterHours = (t: number) => { const { hour, weekday } = etHour(t); return weekday === "Sun" || hour < 8 || hour >= 18; };

export function episodes(calls: Call[], soldDays: Map<string, string>): Episode[] {
  const open = new Map<string, Episode>();
  const out: Episode[] = [];
  for (const c of calls) {
    const ep = open.get(c.contactId);
    if (c.missed) {
      if (ep) { ep.misses++; ep.lastDay = etDay(c.at); }
      else { const e: Episode = { contactId: c.contactId, at: c.at, day: etDay(c.at), lastDay: etDay(c.at), misses: 1, tries: 0 }; open.set(c.contactId, e); out.push(e); }
      continue;
    }
    if (!ep) continue;
    if (c.dir === "out") { ep.callbackAt ??= c.at; ep.tries++; }
    if (c.answered) { ep.reachedAt = c.at; ep.reachedHow = c.dir === "out" ? "we called" : "they called again"; open.delete(c.contactId); }
  }
  for (const e of out) { const sold = soldDays.get(e.contactId); e.booked = !!sold && sold >= e.day; }
  return out;
}

export type Range = {
  callsIn: number; answered: number; missed: number; callsOut: number; callers: number;
  missedCallers: number; calledBack: number; avgCallbackMin: number | null; medianCallbackMin: number | null;
  reached: number; booked: number; bookedCallers: number;
};

export function rangeStats(calls: Call[], eps: Episode[], from: string, to: string, soldDays: Map<string, string>): Range {
  const inR = (t: number) => { const d = etDay(t); return d >= from && d <= to; };
  const cs = calls.filter((c) => inR(c.at));
  // A missed caller counts in every range they missed us in, even when the first miss was earlier.
  const es = eps.filter((e) => e.day <= to && e.lastDay >= from);
  const waits = es.filter((e) => e.callbackAt).map((e) => (e.callbackAt! - e.at) / 60_000).sort((a, b) => a - b);
  const callers = new Map<string, string>();
  for (const c of cs) if (c.dir === "in" && !callers.has(c.contactId)) callers.set(c.contactId, etDay(c.at));
  return {
    callsIn: cs.filter((c) => c.dir === "in").length,
    answered: cs.filter((c) => c.dir === "in" && c.answered).length,
    missed: cs.filter((c) => c.missed).length,
    callsOut: cs.filter((c) => c.dir === "out").length,
    callers: callers.size,
    missedCallers: es.length,
    calledBack: waits.length,
    avgCallbackMin: waits.length ? Math.round(waits.reduce((s, x) => s + x, 0) / waits.length) : null,
    medianCallbackMin: waits.length ? Math.round(waits[Math.floor(waits.length / 2)]) : null,
    reached: es.filter((e) => e.reachedAt).length,
    booked: es.filter((e) => e.booked).length,
    bookedCallers: [...callers].filter(([id, day]) => { const s = soldDays.get(id); return !!s && s >= day; }).length,
  };
}

const mins = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${(m / 60).toFixed(m < 600 ? 1 : 0).replace(/\.0$/, "")} hr` : `${Math.round(m / 1440)} days`);
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const hourName = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

/** Plain sentences about what the numbers say. Only ones with enough calls behind them. */
export function insights(calls: Call[], eps: Episode[], today: string, from: string, now = Date.now()): string[] {
  const out: string[] = [];
  const waiting = eps.filter((e) => !e.reachedAt && !e.callbackAt && e.day >= addDays(today, -14));
  if (waiting.length) {
    const oldest = Math.min(...waiting.map((e) => e.at));
    out.push(`${waiting.length} missed caller${waiting.length > 1 ? "s haven't" : " hasn't"} had a call back yet. The longest has waited ${mins((now - oldest) / 60_000)}.`);
  }
  const wait = (a: string, b: string) => {
    const w = eps.filter((e) => e.day >= a && e.day <= b && e.callbackAt).map((e) => (e.callbackAt! - e.at) / 60_000);
    return w.length >= 3 ? w.reduce((s, x) => s + x, 0) / w.length : null;
  };
  const thisWk = wait(addDays(today, -6), today), lastWk = wait(addDays(today, -13), addDays(today, -7));
  if (thisWk !== null && lastWk !== null && Math.abs(thisWk - lastWk) >= 5)
    out.push(`Call backs took ${mins(thisWk)} on average this week, ${thisWk < lastWk ? "faster" : "slower"} than ${mins(lastWk)} last week.`);
  const season = eps.filter((e) => e.day >= from);
  const fast = season.filter((e) => e.callbackAt && e.callbackAt - e.at <= 3600_000), slow = season.filter((e) => e.callbackAt && e.callbackAt - e.at > 3600_000);
  if (fast.length >= 5 && slow.length >= 5) {
    const f = pct(fast.filter((e) => e.booked).length, fast.length), s = pct(slow.filter((e) => e.booked).length, slow.length);
    if (f !== s) out.push(`Missed callers called back within an hour booked ${f}% of the time; slower call backs booked ${s}%.`);
  }
  const missed = calls.filter((c) => c.missed && etDay(c.at) >= from);
  if (missed.length >= 10) {
    const byHour = new Array(24).fill(0);
    for (const c of missed) byHour[etHour(c.at).hour]++;
    let best = 0;
    for (let h = 0; h < 23; h++) if (byHour[h] + byHour[h + 1] > byHour[best] + byHour[best + 1]) best = h;
    out.push(`Most missed calls come between ${hourName(best)} and ${hourName(best + 2)} (${byHour[best] + byHour[best + 1]} of ${missed.length} this season).`);
    const late = missed.filter((c) => afterHours(c.at)).length;
    if (late) out.push(`${pct(late, missed.length)}% of missed calls came after hours (before 8 AM, after 6 PM or Sunday).`);
  }
  const tried = season.filter((e) => !e.reachedAt && e.tries >= 3).length;
  if (tried) out.push(`${tried} missed caller${tried > 1 ? "s" : ""} got 3 or more call backs and still weren't reached. A text may work better.`);
  return out;
}

/** The day each contact's deal was won (from the Marketing tab's saved GoHighLevel deals). */
export async function soldByContact(): Promise<Map<string, string>> {
  const snap = await getGhlSnap();
  const m = new Map<string, string>();
  for (const o of snap?.opps ?? []) {
    if (!o.contactId || !isSold(o)) continue;
    const d = o.closedDay ?? o.day;
    if (!m.has(o.contactId) || d < m.get(o.contactId)!) m.set(o.contactId, d);
  }
  return m;
}
