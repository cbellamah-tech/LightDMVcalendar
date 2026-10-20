"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Bars, Delta } from "./web";

/* Live stats, the way GoHighLevel's reporting page lays them out: Google Business Profile on top, Facebook ads and
   Google ads side by side. Every number opens its day-by-day bars. */

type GbpDay = { day: string; searchDesktop: number; searchMobile: number; mapsDesktop: number; mapsMobile: number; website: number; calls: number; directions: number; conversations: number; bookings: number };
type Loc = { id: string; title: string; address?: string; days: GbpDay[] };
type AdDay = { day: string; spend: number; clicks: number; impressions: number; leads: number };
type Stats = {
  today: string;
  google: { connected: boolean; configured: boolean };
  gbp: { at: number; locations: Loc[]; need?: string; link?: string; error?: string } | null;
  ads: { facebook: { configured: boolean; days: AdDay[] }; google: { days: AdDay[] }; lsa: { days: AdDay[] }; error?: string };
  role: string;
};
type Pick = { title: string; days: { day: string; v: number }[] };

const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10);
const short = (x: number) => x >= 10_000 ? `${(x / 1000).toFixed(1).replace(/\.0$/, "")}K` : Math.round(x).toLocaleString();
const money = (x: number) => x >= 10_000 ? `$${(x / 1000).toFixed(2).replace(/\.?0+$/, "")}K` : `$${x.toLocaleString(undefined, { maximumFractionDigits: x < 100 ? 2 : 0 })}`;

/** Sum of a field over the days in [from, to]. */
function total<T extends { day: string }>(rows: T[], from: string, to: string, f: (r: T) => number) {
  return rows.reduce((s, r) => (r.day >= from && r.day <= to ? s + f(r) : s), 0);
}
function series<T extends { day: string }>(rows: T[], from: string, to: string, f: (r: T) => number) {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; v: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, v: by.has(d) ? f(by.get(d)!) : 0 });
  return out;
}

export function LiveStats({ owner }: { owner: boolean }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(30);
  const [loc, setLoc] = useState("all");
  const [pick, setPick] = useState<Pick | null>(null);
  const load = useCallback((refresh = false) =>
    api<Stats>(`/api/marketing/stats${refresh ? "?refresh=1" : ""}`).then((x) => { setS(x); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const range = useMemo(() => {
    const to = s?.today ?? new Date().toISOString().slice(0, 10);
    const from = addDays(to, -(days - 1));
    return { from, to, pFrom: addDays(from, -days), pTo: addDays(from, -1) };
  }, [s, days]);

  if (!s) return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 flex gap-2">
      {err || <><Loader2 size={16} className="animate-spin" /> Loading live stats...</>}
    </section>
  );

  const locs = s.gbp?.locations ?? [];
  const gbpDays: GbpDay[] = (() => {
    const chosen = loc === "all" ? locs : locs.filter((l) => l.id === loc);
    const m = new Map<string, GbpDay>();
    for (const l of chosen) for (const d of l.days) {
      const cur = m.get(d.day);
      if (!cur) { m.set(d.day, { ...d }); continue; }
      for (const k of Object.keys(d) as (keyof GbpDay)[]) if (k !== "day") (cur[k] as number) += d[k] as number;
    }
    return [...m.values()];
  })();
  const open = (title: string, rows: { day: string; v: number }[]) => setPick(pick?.title === title ? null : { title, days: rows });

  // Each number: this period, the period before, and its per-day series.
  const g = (title: string, f: (d: GbpDay) => number) => ({
    title, now: total(gbpDays, range.from, range.to, f), prev: total(gbpDays, range.pFrom, range.pTo, f),
    rows: () => series(gbpDays, range.from, range.to, f),
  });
  const views = g("Total views", (d) => d.searchDesktop + d.searchMobile + d.mapsDesktop + d.mapsMobile);
  const gbpNums = [
    g("Search (desktop & mobile)", (d) => d.searchDesktop + d.searchMobile),
    g("Maps (desktop & mobile)", (d) => d.mapsDesktop + d.mapsMobile),
    g("Website visits", (d) => d.website),
    g("Calls", (d) => d.calls),
    g("Direction requests", (d) => d.directions),
    g("Conversations", (d) => d.conversations),
    g("Bookings", (d) => d.bookings),
  ];
  const lastGbpDay = gbpDays.map((d) => d.day).sort().pop();

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Live stats</h2>
          <p className="text-xs text-slate-500">Google Business Profile, Facebook ads and Google ads, last {days} days vs the {days} before. Tap any number for each day.</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold" role="group" aria-label="Date range">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => { setDays(n); setPick(null); }} aria-pressed={days === n}
              className={`px-3 py-1 rounded-md ${days === n ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{n} days</button>
          ))}
        </div>
        <button onClick={() => { setBusy(true); load(true).finally(() => setBusy(false)); }} disabled={busy} className="p-2 rounded-md hover:bg-slate-100" aria-label="Pull fresh numbers" title="Pull fresh numbers">
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Google Business Profile */}
      <div className="rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-slate-100">
          <div className="font-bold text-sm flex-1">Google Business Profile</div>
          {locs.length > 1 && (
            <select value={loc} onChange={(e) => { setLoc(e.target.value); setPick(null); }} className="text-sm rounded-md border border-slate-300 px-2 py-1 max-w-[60%]">
              <option value="all">All {locs.length} listings</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.title}{l.address ? ` (${l.address})` : ""}</option>)}
            </select>
          )}
          {locs.length === 1 && <span className="text-xs text-slate-500 truncate">{locs[0].title}</span>}
        </div>
        <div className="p-3">
          <StepLine s={s.google.connected ? s.gbp : { need: "Connect Google once (Setup at the bottom of this tab)." }} owner={owner} />
          {locs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              <Num big label={views.title} value={short(views.now)} now={views.now} prev={views.prev} onClick={() => open(views.title, views.rows())} active={pick?.title === views.title} />
              {gbpNums.map((n) => (
                <Num key={n.title} label={n.title} value={short(n.now)} now={n.now} prev={n.prev} onClick={() => open(n.title, n.rows())} active={pick?.title === n.title} />
              ))}
            </div>
          )}
          {locs.length > 0 && lastGbpDay && <p className="text-[11px] text-slate-400 mt-2">Google posts these a few days late: latest day {lastGbpDay}{s.gbp?.at ? `, read ${ago(s.gbp.at)}` : ""}.</p>}
        </div>
      </div>
      {pick && gbpNums.concat(views).some((n) => n.title === pick.title) && <Detail pick={pick} close={() => setPick(null)} />}

      <div className="grid md:grid-cols-2 gap-3">
        <AdBox name="Facebook Ads" rows={s.ads.facebook.days} range={range} pick={pick} open={open}
          step={!s.ads.facebook.configured ? <FacebookStep owner={owner} done={() => load(true)} /> : null} />
        <AdBox name="Google Ads" rows={s.ads.google.days} range={range} pick={pick} open={open}
          step={!s.ads.google.days.length ? <p className="text-sm text-slate-600">Fills once the Google Ads script is pasted in Google Ads. {owner ? "Copy it under \"Google Ads, last 7 days\" in the Google section below." : "An owner pastes it once."}</p> : null}
          extra={s.ads.lsa.days.length ? `Local Services: ${money(total(s.ads.lsa.days, range.from, range.to, (d) => d.spend))} spent, ${total(s.ads.lsa.days, range.from, range.to, (d) => d.leads)} leads` : undefined} />
      </div>
      {pick && /^(Facebook|Google) Ads/.test(pick.title) && <Detail pick={pick} close={() => setPick(null)} />}
      {s.ads.error && <p className="text-xs text-red-600 break-words">{s.ads.error}</p>}
    </section>
  );
}

function Num({ label, value, now, prev, onClick, active, big, lowerIsBetter, neutral }: { label: string; value: string; now: number; prev: number; onClick: () => void; active: boolean; big?: boolean; lowerIsBetter?: boolean; neutral?: boolean }) {
  return (
    <button onClick={onClick} aria-expanded={active}
      className={`text-left rounded-lg p-2 ${active ? "bg-slate-100 ring-1 ring-slate-800" : "hover:bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`${big ? "text-3xl leading-7" : "text-xl"} font-extrabold tabular-nums`} style={{ color: NAVY }}>{value}</div>
      <Delta now={now} prev={prev} lowerIsBetter={lowerIsBetter} neutral={neutral} />
    </button>
  );
}

function AdBox({ name, rows, range, pick, open, step, extra }: {
  name: string; rows: AdDay[]; range: { from: string; to: string; pFrom: string; pTo: string };
  pick: Pick | null; open: (t: string, r: { day: string; v: number }[]) => void; step: React.ReactNode; extra?: string;
}) {
  const t = (from: string, to: string) => {
    const spend = total(rows, from, to, (d) => d.spend), clicks = total(rows, from, to, (d) => d.clicks), imp = total(rows, from, to, (d) => d.impressions), leads = total(rows, from, to, (d) => d.leads);
    return { spend, clicks, imp, leads, cpc: clicks ? spend / clicks : 0, ctr: imp ? (clicks / imp) * 100 : 0, cpl: leads ? spend / leads : 0 };
  };
  const now = t(range.from, range.to), prev = t(range.pFrom, range.pTo);
  const ser = (f: (d: AdDay) => number) => series(rows, range.from, range.to, f);
  const ratio = (num: (d: AdDay) => number, den: (d: AdDay) => number, k = 1) => ser((d) => (den(d) ? (num(d) / den(d)) * k : 0));
  const nums = [
    { label: "Total clicks", value: short(now.clicks), n: now.clicks, p: prev.clicks, rows: () => ser((d) => d.clicks) },
    { label: "Total spent", value: money(now.spend), n: now.spend, p: prev.spend, rows: () => ser((d) => d.spend), neutral: true },
    { label: "CPC", value: money(Math.round(now.cpc * 100) / 100), n: now.cpc, p: prev.cpc, rows: () => ratio((d) => d.spend, (d) => d.clicks), lower: true },
    { label: "CTR", value: `${now.ctr.toFixed(2)}%`, n: now.ctr, p: prev.ctr, rows: () => ratio((d) => d.clicks, (d) => d.impressions, 100) },
    { label: "Leads", value: short(now.leads), n: now.leads, p: prev.leads, rows: () => ser((d) => d.leads) },
    { label: "Cost per lead", value: now.leads ? money(Math.round(now.cpl)) : "–", n: now.cpl, p: prev.cpl, rows: () => ratio((d) => d.spend, (d) => d.leads), lower: true },
  ];
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="font-bold text-sm px-3 py-2 border-b border-slate-100">{name} Report</div>
      <div className="p-3 space-y-2">
        {step}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-1">
            {nums.map((x) => {
              const title = `${name} · ${x.label}`;
              return <Num key={x.label} label={x.label} value={x.value} now={x.n} prev={x.p} lowerIsBetter={(x as any).lower} neutral={(x as any).neutral} active={pick?.title === title} onClick={() => open(title, x.rows())} />;
            })}
          </div>
        )}
        {extra && <p className="text-xs text-slate-500">{extra}</p>}
      </div>
    </div>
  );
}

function Detail({ pick, close }: { pick: Pick; close: () => void }) {
  const shown = [...pick.days].reverse().filter((d) => d.v);
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-bold text-sm flex-1">{pick.title}, each day</div>
        <button onClick={close} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X size={16} /></button>
      </div>
      <Bars title="" days={pick.days} />
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-slate-600">Day by day list</summary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 mt-1">
          {shown.length ? shown.map((d) => (
            <div key={d.day} className="flex justify-between border-b border-slate-100 py-0.5 text-xs"><span className="text-slate-500">{d.day.slice(5)}</span><span className="tabular-nums">{Math.round(d.v * 100) / 100}</span></div>
          )) : <span className="text-xs text-slate-500">All zero in this range.</span>}
        </div>
      </details>
    </div>
  );
}

function StepLine({ s, owner }: { s: { need?: string; link?: string; error?: string } | null; owner: boolean }) {
  if (!s) return <p className="text-sm text-slate-500">Reading Google...</p>;
  if (!s.need && !s.error) return null;
  const reconnect = /reconnect google|connect google/i.test(s.need ?? "");
  return (
    <div className="flex items-start gap-2 text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
      <span className="flex-1">{s.need || s.error}</span>
      {reconnect && owner && <a href="/api/google/connect" className="shrink-0 rounded-lg px-3 py-1 text-white font-semibold text-xs" style={{ background: NAVY }}>Reconnect Google</a>}
      {s.link && owner && <a href={s.link} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-3 py-1 font-semibold text-xs border border-slate-300 bg-white inline-flex items-center gap-1">Open it <ExternalLink size={12} /></a>}
    </div>
  );
}

/** One paste: the ads token and the ad account number. Checked against Facebook before it's saved. */
function FacebookStep({ owner, done }: { owner: boolean; done: () => void }) {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!owner) return <p className="text-sm text-slate-600">Fills once an owner pastes the Facebook ads token here.</p>;
  async function save() {
    setBusy(true); setMsg("");
    try { const r = await api("/api/marketing/meta", { method: "POST", json: { token, account } }); setMsg(`Connected${r.name ? ` to ${r.name}` : ""}.`); setToken(""); done(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">Paste a Facebook ads token (ads_read) and the ad account number once. Whoever runs the ads (Goohoo) can make the token in Meta Business Settings, System users.</p>
      <div className="flex gap-2 flex-wrap">
        <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Ad account number" inputMode="numeric" className="w-40 rounded-lg border border-slate-300 px-2 py-1.5" />
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token" type="password" autoComplete="off" className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5" />
        <button disabled={busy || !token || !account} onClick={save} className="rounded-lg px-3 py-1.5 text-white font-semibold disabled:opacity-50" style={{ background: NAVY }}>{busy ? "Checking..." : "Save"}</button>
      </div>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
