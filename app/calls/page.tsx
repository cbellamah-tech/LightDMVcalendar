"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ExternalLink, Lightbulb, Loader2, Phone, PhoneMissed, RefreshCw, X } from "lucide-react";
import { ago, api, fmtDay, fmtTime, GREEN, NAVY, RED } from "@/components/ui";

/* Calls, live from GoHighLevel's phone line: who we missed and still owe a call back, how fast we call back,
   how many we reached and how many booked. Every number opens the calls behind it; the graph folds away. */

type Call = { id: string; contactId: string; at: number; dir: "in" | "out"; status: string; secs: number; missed: boolean; answered: boolean };
type Episode = { contactId: string; at: number; day: string; lastDay: string; misses: number; callbackAt?: number; tries: number; reachedAt?: number; reachedHow?: string; booked?: boolean };
type Range = {
  callsIn: number; answered: number; missed: number; callsOut: number; callers: number; missedCallers: number; calledBack: number;
  avgCallbackMin: number | null; medianCallbackMin: number | null; reached: number; booked: number; bookedCallers: number;
};
type Person = { name: string; phone?: string; link: string; soldDay?: string };
type Data = {
  configured: boolean; at: number | null; error?: string; today: string; seasonFrom: string;
  stats: Record<"today" | "week" | "season", Range>; insights: string[]; episodes: Episode[]; calls: Call[];
  people: Record<string, Person>; daily: { day: string; answered: number; missed: number; out: number }[];
};
type RangeId = "today" | "week" | "season";
type Pick =
  | "missed" | "missedCallers" | "calledBack" | "wait" | "reached" | "booked" | "callsIn" | "callsOut" | "bookedCallers";

const card = "bg-white rounded-xl border border-slate-200 p-4";
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (t: number) => ET.format(t);
const mins = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${(m / 60).toFixed(m < 600 ? 1 : 0).replace(/\.0$/, "")} hr` : `${Math.round(m / 1440)} days`);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "");
const when = (t: number) => (etDay(t) === etDay(Date.now()) ? fmtTime(t) : `${fmtDay(t)}, ${fmtTime(t)}`);
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10);
const weekStart = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));

export default function CallsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<RangeId>("today");
  const [pick, setPick] = useState<Pick | null>(null);
  const [allOwed, setAllOwed] = useState(false);

  const load = useCallback((refresh = false) =>
    api<Data>(`/api/calls${refresh ? "?refresh=1" : ""}`).then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)), []);
  // Live: re-read every minute while the page is open (the server re-reads GoHighLevel when its copy is 2 minutes old).
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const from = useMemo(() => !d ? "" : range === "today" ? d.today : range === "week" ? weekStart(d.today) : d.seasonFrom, [d, range]);

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading calls...</>}</div>;
  if (!d.configured) return <div className="max-w-3xl mx-auto p-4"><div className={card}>GoHighLevel isn&apos;t connected, so there are no calls to show yet.</div></div>;

  const s = d.stats[range];
  const who = (id: string) => d.people[id] ?? { name: "Caller", link: "" };
  const inRange = (t: number) => { const x = etDay(t); return x >= from && x <= d.today; };
  const eps = d.episodes.filter((e) => e.day <= d.today && e.lastDay >= from);
  // Waiting on us: missed in the last 2 weeks, nobody has talked to them yet. Not yet tried first, then oldest first.
  const owed = d.episodes.filter((e) => !e.reachedAt && e.day >= addDays(d.today, -14))
    .sort((a, b) => (a.tries ? 1 : 0) - (b.tries ? 1 : 0) || a.at - b.at);
  const label = range === "today" ? "today" : range === "week" ? "this week" : "this season";
  const toggle = (p: Pick) => setPick(pick === p ? null : p);

  const tiles: { id: Pick; title: string; value: string; sub: string; tone?: "bad" | "good" }[] = [
    { id: "missed", title: "Missed calls", value: String(s.missed), sub: s.missedCallers ? `from ${s.missedCallers} ${s.missedCallers === 1 ? "person" : "people"}` : "none", tone: s.missed ? "bad" : undefined },
    { id: "calledBack", title: "Called back", value: `${s.calledBack} of ${s.missedCallers}`, sub: pct(s.calledBack, s.missedCallers) || "nobody to call back" },
    { id: "wait", title: "Avg time to call back", value: s.avgCallbackMin === null ? "–" : mins(s.avgCallbackMin), sub: s.medianCallbackMin === null ? "no call backs yet" : `half within ${mins(s.medianCallbackMin)}` },
    { id: "reached", title: "Missed callers we spoke to", value: `${s.reached} of ${s.missedCallers}`, sub: pct(s.reached, s.missedCallers) || "–", tone: s.reached ? "good" : undefined },
    { id: "booked", title: "Missed callers who booked", value: String(s.booked), sub: pct(s.booked, s.missedCallers) ? `${pct(s.booked, s.missedCallers)} of missed callers` : "–", tone: s.booked ? "good" : undefined },
    { id: "callsIn", title: "Calls in", value: String(s.callsIn), sub: s.callsIn ? `${pct(s.answered, s.callsIn)} answered` : "–" },
    { id: "bookedCallers", title: "Callers who booked", value: `${s.bookedCallers} of ${s.callers}`, sub: pct(s.bookedCallers, s.callers) ? `${pct(s.bookedCallers, s.callers)} became customers` : "–", tone: s.bookedCallers ? "good" : undefined },
    { id: "callsOut", title: "Calls out", value: String(s.callsOut), sub: "every call we made" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Calls</h1>
          <p className="text-sm text-slate-500">Live from the GoHighLevel phone line{d.at ? `, updated ${ago(d.at)}` : ""}. Tap any number to see the calls behind it.</p>
        </div>
        <button className="p-2 rounded-lg border border-slate-200 bg-white" aria-label="Refresh" disabled={busy}
          onClick={async () => { setBusy(true); await load(true); setBusy(false); }}>
          <RefreshCw size={18} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {(err || d.error) && <div className={`${card} border-amber-300 bg-amber-50 text-sm`}>{err || d.error}</div>}

      <section className={`${card} ${owed.some((e) => !e.tries) ? "border-red-300" : ""}`}>
        <h2 className="font-bold flex items-center gap-2"><PhoneMissed size={18} color={RED} /> Call back now ({owed.length})</h2>
        {!owed.length ? <p className="text-sm text-slate-500 mt-1">Everyone who called in the last 2 weeks has been reached.</p> : (
          <ul className="divide-y divide-slate-100 mt-1">
            {(allOwed ? owed : owed.slice(0, 5)).map((e) => {
              const p = who(e.contactId);
              return (
                <li key={`${e.contactId}-${e.at}`} className="py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      Missed {ago(e.at)}{e.misses > 1 ? `, called ${e.misses} times` : ""}
                      {e.tries ? ` · we tried ${e.tries} time${e.tries > 1 ? "s" : ""}, not reached` : <span className="text-red-600 font-semibold"> · no call back yet</span>}
                      {p.soldDay ? " · already a customer" : ""}
                    </div>
                  </div>
                  {p.phone && <a href={`tel:${p.phone}`} className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold flex items-center gap-1" style={{ background: GREEN }}><Phone size={14} /> Call</a>}
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="p-1.5 text-slate-500" aria-label="Open in GoHighLevel"><ExternalLink size={16} /></a>}
                </li>
              );
            })}
          </ul>
        )}
        {owed.length > 5 && (
          <button onClick={() => setAllOwed(!allOwed)} className="text-sm font-semibold mt-1" style={{ color: NAVY }}>
            {allOwed ? "Show fewer" : `Show all ${owed.length}`}
          </button>
        )}
      </section>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(["today", "week", "season"] as RangeId[]).map((r) => (
          <button key={r} onClick={() => { setRange(r); setPick(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold ${range === r ? "bg-white shadow-sm" : "text-slate-500"}`}>
            {r === "today" ? "Today" : r === "week" ? "This week" : `Season (since ${fmtDay(`${d.seasonFrom}T12:00:00`).replace(/^\w+, /, "")})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map((t) => (
          <button key={t.id} onClick={() => toggle(t.id)}
            className={`text-left rounded-xl border p-3 bg-white ${pick === t.id ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-200"}`}>
            <div className="text-xs text-slate-500">{t.title}</div>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: t.tone === "bad" ? RED : t.tone === "good" ? GREEN : NAVY }}>{t.value}</div>
            <div className="text-xs text-slate-500">{t.sub}</div>
          </button>
        ))}
      </div>

      {pick && <Detail pick={pick} title={`${tiles.find((t) => t.id === pick)!.title} ${label}`} d={d} eps={eps} calls={d.calls.filter((c) => inRange(c.at))} from={from} onClose={() => setPick(null)} />}

      {d.insights.length > 0 && (
        <section className={card}>
          <h2 className="font-bold flex items-center gap-2 mb-1"><Lightbulb size={18} className="text-amber-500" /> What the calls say</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">{d.insights.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}

      <details className={`${card} group`}>
        <summary className="cursor-pointer list-none flex items-center gap-2 font-bold">
          <ChevronRight size={18} className="text-slate-400 transition-transform group-open:rotate-90" /> Calls by day this season
        </summary>
        <div className="mt-3"><DayBars days={d.daily} /></div>
      </details>
    </div>
  );
}

function Detail({ pick, title, d, eps, calls, from, onClose }: { pick: Pick; title: string; d: Data; eps: Episode[]; calls: Call[]; from: string; onClose: () => void }) {
  const who = (id: string) => d.people[id] ?? { name: "Caller", link: "" };
  let rows: { key: string; contactId: string; main: string; sub: string; tone?: string }[] = [];
  const ep = (e: Episode) => ({
    key: `${e.contactId}-${e.at}`, contactId: e.contactId,
    main: who(e.contactId).name,
    sub: [
      `missed ${when(e.at)}${e.misses > 1 ? ` (${e.misses} calls)` : ""}`,
      e.callbackAt ? `called back in ${mins((e.callbackAt - e.at) / 60_000)}` : "no call back",
      e.reachedAt ? `spoke ${e.reachedHow === "they called again" ? "when they called again" : "on our call back"}` : e.tries ? `not reached after ${e.tries} ${e.tries > 1 ? "tries" : "try"}` : "",
      e.booked ? "booked" : "",
    ].filter(Boolean).join(" · "),
    tone: e.booked ? GREEN : !e.callbackAt ? RED : undefined,
  });
  const call = (c: Call) => ({
    key: c.id, contactId: c.contactId, main: who(c.contactId).name,
    sub: [when(c.at), c.dir === "in" ? (c.missed ? "missed" : "answered") : c.answered ? "we called, answered" : "we called, no answer",
      c.secs ? `${Math.max(1, Math.round(c.secs / 60))} min` : "", c.status].filter(Boolean).join(" · "),
    tone: c.missed ? RED : undefined,
  });
  if (pick === "missed") rows = calls.filter((c) => c.missed).map(call);
  if (pick === "missedCallers") rows = eps.map(ep);
  if (pick === "calledBack") rows = eps.slice().sort((a, b) => (a.callbackAt ? 1 : 0) - (b.callbackAt ? 1 : 0)).map(ep);
  if (pick === "wait") rows = eps.filter((e) => e.callbackAt).sort((a, b) => (b.callbackAt! - b.at) - (a.callbackAt! - a.at)).map(ep);
  if (pick === "reached") rows = eps.slice().sort((a, b) => (a.reachedAt ? 1 : 0) - (b.reachedAt ? 1 : 0)).map(ep);
  if (pick === "booked") rows = eps.filter((e) => e.booked).map(ep);
  if (pick === "callsIn") rows = calls.filter((c) => c.dir === "in").map(call);
  if (pick === "callsOut") rows = calls.filter((c) => c.dir === "out").map(call);
  if (pick === "bookedCallers") {
    const first = new Map<string, number>();
    for (const c of calls) if (c.dir === "in" && (!first.has(c.contactId) || c.at < first.get(c.contactId)!)) first.set(c.contactId, c.at);
    rows = [...first].sort((a, b) => b[1] - a[1]).map(([id, at]) => {
      const sold = who(id).soldDay;
      const booked = !!sold && sold >= etDay(at);
      return { key: id, contactId: id, main: who(id).name, sub: `first called ${when(at)}${booked ? ` · booked ${fmtDay(`${sold}T12:00:00`)}` : " · not booked yet"}`, tone: booked ? GREEN : undefined };
    }).sort((a, b) => (a.tone ? 0 : 1) - (b.tone ? 0 : 1));
  }
  return (
    <section className={card}>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-bold flex-1">{title} ({rows.length})</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400"><X size={18} /></button>
      </div>
      {!rows.length ? <p className="text-sm text-slate-500">Nothing here{from === d.today ? " yet today" : ""}.</p> : (
        <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
          {rows.slice(0, 300).map((r) => {
            const p = who(r.contactId);
            return (
              <li key={r.key} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.main}</div>
                  <div className="text-xs" style={{ color: r.tone ?? "#64748b" }}>{r.sub}</div>
                </div>
                {p.phone && <a href={`tel:${p.phone}`} className="p-1.5 text-slate-500" aria-label="Call"><Phone size={16} /></a>}
                {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="p-1.5 text-slate-500" aria-label="Open in GoHighLevel"><ExternalLink size={16} /></a>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Answered (navy) and missed (red) calls in, stacked per day. */
function DayBars({ days }: { days: Data["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!days.length) return null;
  const max = Math.max(1, ...days.map((x) => x.answered + x.missed));
  const W = 600, H = 140, bw = W / days.length;
  const h = hover !== null ? days[hover] : null;
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-slate-600 flex gap-3">
        <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: NAVY }} /> Answered</span>
        <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: RED }} /> Missed</span>
        <span className="flex-1 text-right tabular-nums">{h ? `${fmtDay(`${h.day}T12:00:00`)}: ${h.answered} answered, ${h.missed} missed, ${h.out} out` : `busiest ${max} calls in`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="Calls by day" onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#e2e8f0" />
        {days.map((x, i) => {
          const ah = (x.answered / max) * (H - 6), mh = (x.missed / max) * (H - 6);
          const o = hover === null || hover === i ? 1 : 0.45;
          return (
            <g key={x.day} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect x={i * bw + bw * 0.15} y={H - ah} width={Math.max(1, bw * 0.7)} height={ah} fill={NAVY} opacity={o} />
              <rect x={i * bw + bw * 0.15} y={H - ah - mh} width={Math.max(1, bw * 0.7)} height={mh} fill={RED} opacity={o} />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400"><span>{fmtDay(`${days[0].day}T12:00:00`)}</span><span>{fmtDay(`${days[days.length - 1].day}T12:00:00`)}</span></div>
    </figure>
  );
}
