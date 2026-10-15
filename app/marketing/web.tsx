"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, ExternalLink, Globe, Loader2, RefreshCw, X } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { googleAdsScript } from "./adsScript";

/* Website and Google: what Google searches show us, who visits, which keywords bring them, the Google tags the site
   loads, and every new page and blog post on lightdmv.com with its picture and date. */

type Row = { key: string; clicks: number; impressions: number; ctr: number; position: number; prevClicks?: number; prevPosition?: number };
type ST = { clicks: number; impressions: number; ctr: number; position: number };
type Search = { site: string; start: string; end: string; now: ST; prev: ST; daily: { day: string; clicks: number; impressions: number }[]; queries: Row[]; pages: Row[]; devices: Row[] };
type GT = { sessions: number; users: number; newUsers: number; engagement: number; keyEvents: number };
type Analytics = {
  name: string; start: string; end: string; now: GT; prev: GT;
  daily: { day: string; sessions: number; keyEvents: number }[];
  channels: { key: string; sessions: number; keyEvents: number; prevSessions: number }[];
  landing: { key: string; sessions: number; keyEvents: number }[];
  events: { key: string; count: number; prevCount: number }[];
};
type Source<T> = { data: T | null; need?: string; link?: string; error?: string; at?: number };
type AdKw = { text: string; match?: string; campaign?: string; clicks: number; impressions: number; cost: number; conversions: number };
type Page = { path: string; url: string; kind: "blog" | "city" | "service" | "location" | "other"; service?: string; city?: string; title?: string; description?: string; image?: string; published: string; publishedExact: boolean };
type Tag = { id: string; kind: string; found: boolean };
type Web = {
  site: string; at: number;
  pages: Page[];
  tags: { at: number; tags: Tag[]; error?: string } | null;
  google: { configured: boolean; connected: boolean; email?: string };
  insights: { at: number; search: Source<Search>; analytics: Source<Analytics> } | null;
  adKeywords: { at: number; days: number; keywords: AdKw[]; terms: AdKw[] } | null;
  adsGoogle: { has: boolean; week: { spend: number; clicks: number; leads: number }; month: { spend: number; clicks: number; leads: number } };
};
type Panel = "searches" | "clicks" | "position" | "visitors" | "leads" | "ads";

const BLUE = "#2a78d6";
const n0 = (x: number) => Math.round(x).toLocaleString();
const money = (x: number) => `$${Math.round(x).toLocaleString()}`;
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysAgo = (d: string) => Math.round((Date.now() - Date.parse(`${d}T12:00:00`)) / 86400_000);
const pathOf = (u: string) => { try { return new URL(u).pathname.replace(/\/$/, "") || "/"; } catch { return u; } };

export function WebsiteGoogle({ owner, botBox }: { owner: boolean; botBox: { url: string; key: string } | null }) {
  const [w, setW] = useState<Web | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) =>
    api<Web>(`/api/marketing/web${refresh ? "?refresh=1" : ""}`).then((x) => { setW(x); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (!w) return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 flex gap-2">
      {err || <><Loader2 size={16} className="animate-spin" /> Loading website and Google numbers...</>}
    </section>
  );
  return (
    <>
      <GoogleNumbers w={w} owner={owner} botBox={botBox} busy={busy} refresh={() => { setBusy(true); load(true).finally(() => setBusy(false)); }} />
      <SitePages w={w} />
    </>
  );
}

/* ---------- Google numbers ---------- */

function Delta({ now, prev, lowerIsBetter = false, suffix = "" }: { now: number; prev: number; lowerIsBetter?: boolean; suffix?: string }) {
  if (!prev && !now) return null;
  const diff = now - prev;
  if (Math.abs(diff) < 0.05) return <span className="text-xs text-slate-400">same as before</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const pct = prev ? Math.round((Math.abs(diff) / prev) * 100) : null;
  const Icon = (lowerIsBetter ? good : diff > 0) ? ArrowUp : ArrowDown; // a better Google spot reads as up
  return (
    <span className={`text-xs font-semibold inline-flex items-center ${good ? "text-green-700" : "text-red-600"}`}>
      <Icon size={12} />{suffix ? `${Math.abs(Math.round(diff * 10) / 10)}${suffix}` : pct !== null ? `${pct}%` : n0(Math.abs(diff))}
    </span>
  );
}

function Tile({ label, value, sub, active, onClick, children }: { label: string; value: string; sub?: React.ReactNode; active: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-expanded={active}
      className={`text-left rounded-xl border p-3 transition ${active ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums" style={{ color: NAVY }}>{value}</div>
      <div className="flex items-center gap-2 min-h-[18px]">{sub}{children}</div>
    </button>
  );
}

function Need({ label, s, owner }: { label: string; s?: { need?: string; link?: string; error?: string }; owner: boolean }) {
  if (!s?.need && !s?.error) return null;
  const reconnect = /reconnect google/i.test(s.need ?? "");
  return (
    <div className="flex items-start gap-2 text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
      <span className="flex-1"><b>{label}:</b> {s.need || s.error}</span>
      {reconnect && owner && <a href="/api/google/connect" className="shrink-0 rounded-lg px-3 py-1 text-white font-semibold text-xs" style={{ background: NAVY }}>Reconnect Google</a>}
      {s.link && owner && <a href={s.link} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-3 py-1 font-semibold text-xs border border-slate-300 bg-white inline-flex items-center gap-1">Turn it on <ExternalLink size={12} /></a>}
    </div>
  );
}

function GoogleNumbers({ w, owner, botBox, busy, refresh }: { w: Web; owner: boolean; botBox: { url: string; key: string } | null; busy: boolean; refresh: () => void }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [chart, setChart] = useState(false);
  const [copied, setCopied] = useState(false);
  const s = w.insights?.search.data ?? null;
  const a = w.insights?.analytics.data ?? null;
  const kw = w.adKeywords;
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const at = w.insights?.at;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Google: searches, visitors, keywords</h2>
          <p className="text-xs text-slate-500">Last 28 days vs the 28 before, from Search Console, Google Analytics and Google Ads. Tap a number for the detail{at ? `. Updated ${ago(at)}` : ""}</p>
        </div>
        <button onClick={refresh} disabled={busy} className="p-2 rounded-md hover:bg-slate-100" aria-label="Pull fresh Google numbers" title="Pull fresh Google numbers">
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {!w.google.connected ? (
        <div className="flex items-center gap-2 text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <span className="flex-1"><b>Google:</b> connect info@lightdmv.com once to see searches, visitors and keywords.</span>
          {owner && w.google.configured && <a href="/api/google/connect" className="rounded-lg px-3 py-1 text-white font-semibold text-xs" style={{ background: NAVY }}>Connect Google</a>}
        </div>
      ) : (
        <div className="space-y-2">
          <Need label="Search Console" s={w.insights?.search} owner={owner} />
          <Need label="Google Analytics" s={w.insights?.analytics} owner={owner} />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <Tile label="Google searches showing us" value={s ? n0(s.now.impressions) : "–"} active={panel === "searches"} onClick={() => toggle("searches")}
          sub={s && <Delta now={s.now.impressions} prev={s.prev.impressions} />} />
        <Tile label="Clicks from Google search" value={s ? n0(s.now.clicks) : "–"} active={panel === "clicks"} onClick={() => toggle("clicks")}
          sub={s && <><Delta now={s.now.clicks} prev={s.prev.clicks} /><span className="text-xs text-slate-400">{s.now.ctr}% click</span></>} />
        <Tile label="Average spot on Google" value={s ? `#${s.now.position}` : "–"} active={panel === "position"} onClick={() => toggle("position")}
          sub={s && <Delta now={s.now.position} prev={s.prev.position} lowerIsBetter suffix={s.now.position < s.prev.position ? " spots higher" : " spots lower"} />} />
        <Tile label="Website visitors" value={a ? n0(a.now.users) : "–"} active={panel === "visitors"} onClick={() => toggle("visitors")}
          sub={a && <><Delta now={a.now.users} prev={a.prev.users} /><span className="text-xs text-slate-400">{n0(a.now.sessions)} visits</span></>} />
        <Tile label="Leads from the website" value={a ? n0(a.now.keyEvents) : "–"} active={panel === "leads"} onClick={() => toggle("leads")}
          sub={a && <Delta now={a.now.keyEvents} prev={a.prev.keyEvents} />} />
        <Tile label="Google Ads, last 7 days" value={w.adsGoogle.has ? money(w.adsGoogle.week.spend) : "–"} active={panel === "ads"} onClick={() => toggle("ads")}
          sub={w.adsGoogle.has ? <span className="text-xs text-slate-500">{n0(w.adsGoogle.week.clicks)} clicks · {w.adsGoogle.week.leads} leads</span> : <span className="text-xs text-slate-400">not paired</span>} />
      </div>

      {panel && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="font-bold text-sm flex-1">{PANEL_TITLE[panel]}</div>
            <button onClick={() => setPanel(null)} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X size={16} /></button>
          </div>
          {panel === "searches" && (s ? <Keywords rows={s.queries} sort="impressions" /> : <Empty what="Search Console" />)}
          {panel === "clicks" && (s ? <PagesTable rows={s.pages} site={w.site} /> : <Empty what="Search Console" />)}
          {panel === "position" && (s ? <CloseToTop rows={s.queries} /> : <Empty what="Search Console" />)}
          {panel === "visitors" && (a ? <Channels a={a} /> : <Empty what="Google Analytics" />)}
          {panel === "leads" && (a ? <Leads a={a} site={w.site} /> : <Empty what="Google Analytics" />)}
          {panel === "ads" && (kw && (kw.keywords.length || kw.terms.length) ? <AdKeywords kw={kw} /> : (
            <div className="text-sm text-slate-600 space-y-2">
              <p>Ad keywords, what people typed, cost and leads show here once the Google Ads script runs. {owner ? "Paste it once in Google Ads: Tools, Bulk actions, Scripts, +, paste, Authorize, Frequency Daily." : "An owner pastes it once."}</p>
              {owner && botBox && (
                <button className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300 inline-flex items-center gap-1" onClick={() => {
                  navigator.clipboard.writeText(googleAdsScript(botBox.url, botBox.key)).then(() => setCopied(true)).catch(() => {});
                }}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy the Google Ads script</>}</button>
              )}
              {w.adsGoogle.has && <p className="text-xs text-slate-500">Spend already comes in from an older copy of the script. Replace it with this one to add keywords.</p>}
            </div>
          ))}
        </div>
      )}

      {(s || a) && (
        <button onClick={() => setChart(!chart)} className="text-xs font-semibold text-slate-600 inline-flex items-center gap-1">
          <ChevronDown size={14} className={chart ? "rotate-180" : ""} /> {chart ? "Hide charts" : "Show charts"}
        </button>
      )}
      {chart && (
        <div className="grid md:grid-cols-2 gap-4">
          {s && <Bars title="Clicks from Google search, per day" days={s.daily.map((d) => ({ day: d.day, v: d.clicks }))} />}
          {a && <Bars title="Website visits, per day" days={a.daily.map((d) => ({ day: d.day, v: d.sessions }))} />}
        </div>
      )}

      <Tags w={w} />
    </section>
  );
}

const PANEL_TITLE: Record<Panel, string> = {
  searches: "What people searched on Google when we showed up (organic keywords)",
  clicks: "Which pages Google search sends people to",
  position: "Keywords close to the top of Google (spots 4 to 20): a push here pays off fastest",
  visitors: "Where website visitors came from",
  leads: "Leads and other key actions on the website",
  ads: "Google Ads keywords, last 30 days",
};
const Empty = ({ what }: { what: string }) => <p className="text-sm text-slate-500">Shows once {what} is on (see the line above).</p>;

function useMore<T>(rows: T[], n = 10) {
  const [all, setAll] = useState(false);
  return { shown: all ? rows : rows.slice(0, n), more: rows.length > n ? <button onClick={() => setAll(!all)} className="text-xs underline text-slate-600">{all ? "Show fewer" : `Show all ${rows.length}`}</button> : null };
}

function Keywords({ rows, sort }: { rows: Row[]; sort: "impressions" | "clicks" }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => rows.filter((r) => r.key.includes(q.toLowerCase())).sort((a, b) => b[sort] - a[sort]), [rows, q, sort]);
  const { shown, more } = useMore(list, 15);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a keyword" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium py-1">Keyword</th><th className="font-medium text-right">Shown</th><th className="font-medium text-right">Clicks</th><th className="font-medium text-right">Spot</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5 pr-2 break-words"><a className="hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(r.key)}`}>{r.key}</a></td>
              <td className="text-right tabular-nums">{n0(r.impressions)}</td>
              <td className="text-right tabular-nums">{n0(r.clicks)}</td>
              <td className="text-right tabular-nums">#{r.position}{r.prevPosition !== undefined && Math.abs(r.prevPosition - r.position) >= 1 && (
                <span className={`ml-1 text-xs ${r.prevPosition > r.position ? "text-green-700" : "text-red-600"}`}>{r.prevPosition > r.position ? "▲" : "▼"}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="text-sm text-slate-500">No keywords yet.</p>}
      {more}
    </div>
  );
}

function CloseToTop({ rows }: { rows: Row[] }) {
  const list = rows.filter((r) => r.position > 3 && r.position <= 20 && r.impressions >= 5);
  return <Keywords rows={list} sort="impressions" />;
}

function PagesTable({ rows, site }: { rows: Row[]; site: string }) {
  const { shown, more } = useMore([...rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions), 15);
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium py-1">Page</th><th className="font-medium text-right">Clicks</th><th className="font-medium text-right">Before</th><th className="font-medium text-right">Shown</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5 pr-2 break-all"><a className="hover:underline" href={`${site}${r.key === "/" ? "" : r.key}`} target="_blank" rel="noreferrer">{r.key}</a></td>
              <td className="text-right tabular-nums font-semibold">{n0(r.clicks)}</td>
              <td className="text-right tabular-nums text-slate-400">{n0(r.prevClicks ?? 0)}</td>
              <td className="text-right tabular-nums">{n0(r.impressions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more}
    </div>
  );
}

function Channels({ a }: { a: Analytics }) {
  const total = a.channels.reduce((s, c) => s + c.sessions, 0) || 1;
  return (
    <div className="space-y-1.5 text-sm">
      {a.channels.map((c) => (
        <div key={c.key} className="flex items-center gap-2">
          <span className="w-36 truncate">{c.key}</span>
          <span className="flex-1 h-2 rounded bg-slate-100 overflow-hidden"><span className="block h-full rounded" style={{ width: `${(c.sessions / total) * 100}%`, background: BLUE }} /></span>
          <span className="w-14 text-right tabular-nums">{n0(c.sessions)}</span>
          <span className="w-12 text-right"><Delta now={c.sessions} prev={c.prevSessions} /></span>
          <span className="w-16 text-right text-xs text-slate-500 tabular-nums">{c.keyEvents ? `${n0(c.keyEvents)} leads` : ""}</span>
        </div>
      ))}
      <p className="text-xs text-slate-500">{n0(a.now.newUsers)} new visitors · {a.now.engagement}% stayed and looked around · GA property {a.name}</p>
    </div>
  );
}

function Leads({ a, site }: { a: Analytics; site: string }) {
  const landing = a.landing.filter((l) => l.keyEvents > 0).sort((x, y) => y.keyEvents - x.keyEvents);
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <div>
        <div className="text-xs text-slate-500 mb-1">Actions (counted as key events in Google Analytics)</div>
        {!a.events.length ? <p className="text-slate-500">No key events marked in Google Analytics yet.</p> : a.events.map((e) => (
          <div key={e.key} className="flex gap-2 py-1 border-t border-slate-100"><span className="flex-1">{e.key.replace(/_/g, " ")}</span><span className="tabular-nums font-semibold">{n0(e.count)}</span><Delta now={e.count} prev={e.prevCount} /></div>
        ))}
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1">Pages those leads started on</div>
        {!landing.length ? <p className="text-slate-500">None yet.</p> : landing.slice(0, 12).map((l) => (
          <div key={l.key} className="flex gap-2 py-1 border-t border-slate-100">
            <a className="flex-1 break-all hover:underline" href={`${site}${l.key === "/" ? "" : l.key.split("?")[0]}`} target="_blank" rel="noreferrer">{l.key}</a>
            <span className="tabular-nums font-semibold">{n0(l.keyEvents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdKeywords({ kw }: { kw: NonNullable<Web["adKeywords"]> }) {
  const [tab, setTab] = useState<"keywords" | "terms">("keywords");
  const rows = [...(tab === "keywords" ? kw.keywords : kw.terms)].sort((a, b) => b.cost - a.cost || b.clicks - a.clicks);
  const { shown, more } = useMore(rows, 15);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold">
          {(["keywords", "terms"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-md ${tab === t ? "bg-white shadow-sm" : "text-slate-500"}`}>{t === "keywords" ? "Keywords we bid on" : "What people typed"}</button>
          ))}
        </div>
        <span className="text-xs text-slate-400">from Google Ads, {ago(kw.at)}</span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium py-1">Keyword</th><th className="font-medium text-right">Clicks</th><th className="font-medium text-right">Cost</th><th className="font-medium text-right">Leads</th><th className="font-medium text-right">Per lead</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((r, i) => (
            <tr key={`${r.text}|${r.match}|${i}`}>
              <td className="py-1.5 pr-2 break-words">{r.text}{r.match && <span className="text-xs text-slate-400"> · {r.match.toLowerCase()}</span>}</td>
              <td className="text-right tabular-nums">{n0(r.clicks)}</td>
              <td className="text-right tabular-nums">{money(r.cost)}</td>
              <td className="text-right tabular-nums">{r.conversions ? Math.round(r.conversions * 10) / 10 : 0}</td>
              <td className={`text-right tabular-nums ${!r.conversions && r.cost > 50 ? "text-red-600 font-semibold" : ""}`}>{r.conversions ? money(r.cost / r.conversions) : r.cost > 0 ? "none yet" : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more}
    </div>
  );
}

function Bars({ title, days }: { title: string; days: { day: string; v: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!days.length) return null;
  const max = Math.max(1, ...days.map((d) => d.v));
  const W = 600, H = 140, bw = W / days.length;
  const h = hover !== null ? days[hover] : null;
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-slate-600 flex gap-2"><span className="flex-1 font-semibold">{title}</span>
        <span className="tabular-nums">{h ? `${shortDay(h.day)}: ${n0(h.v)}` : `peak ${n0(max)}`}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#e2e8f0" />
        {days.map((d, i) => {
          const bh = (d.v / max) * (H - 6);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect x={i * bw + bw * 0.15} y={H - bh} width={Math.max(1, bw * 0.7)} height={bh} rx={1.5} fill={BLUE} opacity={hover === null || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400"><span>{shortDay(days[0].day)}</span><span>{shortDay(days[days.length - 1].day)}</span></div>
    </figure>
  );
}

function Tags({ w }: { w: Web }) {
  const tags = w.tags?.tags ?? [];
  const has = (k: string) => tags.some((t) => t.kind === k);
  return (
    <div className="border-t border-slate-100 pt-3 space-y-1.5">
      <div className="text-xs font-semibold text-slate-600">Google tags on {w.site.replace(/^https?:\/\//, "")}{w.tags ? <span className="font-normal text-slate-400"> · checked {ago(w.tags.at)}</span> : ""}</div>
      <div className="flex gap-2 flex-wrap">
        {tags.map((t) => (
          <span key={`${t.kind}${t.id}`} className="text-xs rounded-full bg-green-50 text-green-800 border border-green-200 px-2 py-0.5 inline-flex items-center gap-1"><Check size={12} />{t.kind} <span className="text-green-700/70">{t.id}</span></span>
        ))}
        {w.tags && !has("Google Analytics") && <span className="text-xs rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5">Google Analytics tag missing</span>}
        {w.tags && !has("Google Ads") && <span className="text-xs rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5">Google Ads tag missing</span>}
      </div>
      {w.tags?.error && <p className="text-xs text-red-600">{w.tags.error}</p>}
    </div>
  );
}

/* ---------- Website pages ---------- */

const KIND: Record<Page["kind"], string> = { blog: "Blog post", city: "City page", service: "Service page", location: "Location", other: "Page" };

function SitePages({ w }: { w: Web }) {
  const [kind, setKind] = useState<"new" | "blog" | "city" | "all">("new");
  const [all, setAll] = useState(false);
  const clicks = useMemo(() => new Map((w.insights?.search.data?.pages ?? []).map((p) => [p.key, p])), [w]);
  const list = w.pages.filter((p) => kind === "all" ? true : kind === "new" ? (p.kind === "blog" || p.kind === "city") : p.kind === kind);
  const shown = all ? list : list.slice(0, 6);
  const week = w.pages.filter((p) => p.publishedExact && daysAgo(p.published) < 7).length;
  const month = w.pages.filter((p) => p.publishedExact && daysAgo(p.published) < 30).length;
  const blogs = w.pages.filter((p) => p.kind === "blog").length, cities = w.pages.filter((p) => p.kind === "city").length;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Website: new pages and blog posts</h2>
          <p className="text-xs text-slate-500">
            {w.pages.length ? `${week} new this week, ${month} this month · ${blogs} blog posts, ${cities} city pages on ${w.site.replace(/^https?:\/\//, "")}` : "Reading the website..."}
            {w.at ? ` · checked ${ago(w.at)}` : ""}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold" role="group" aria-label="Which pages">
          {([["new", "Newest"], ["blog", "Blog"], ["city", "City pages"], ["all", "All"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setKind(k); setAll(false); }} aria-pressed={kind === k}
              className={`px-3 py-1 rounded-md ${kind === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </div>
      {!list.length ? <p className="text-sm text-slate-500">No pages read yet. They show after the next check of the website.</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((p) => <PageCard key={p.path} p={p} c={clicks.get(p.path)} />)}
        </div>
      )}
      {list.length > 6 && <button onClick={() => setAll(!all)} className="text-xs underline text-slate-600">{all ? "Show fewer" : `Show all ${list.length}`}</button>}
      <p className="text-xs text-slate-500">Blog drafts are written on the 1st and 15th and wait for an OK before they go live. New pages show here the day they go live.</p>
    </section>
  );
}

function PageCard({ p, c }: { p: Page; c?: Row }) {
  const [broken, setBroken] = useState(false);
  const fresh = p.publishedExact && daysAgo(p.published) < 7;
  return (
    <a href={p.url} target="_blank" rel="noreferrer" className="group rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition flex flex-col">
      <div className="aspect-[16/9] bg-slate-100 relative">
        {p.image && !broken
          ? <img src={p.image} alt="" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 flex items-center justify-center text-slate-300"><Globe size={36} /></div>}
        <span className="absolute top-2 left-2 text-[11px] font-bold rounded bg-white/90 px-1.5 py-0.5" style={{ color: NAVY }}>{KIND[p.kind]}{p.service && p.kind === "city" ? ` · ${p.service}` : ""}</span>
        {fresh && <span className="absolute top-2 right-2 text-[11px] font-bold rounded bg-green-600 text-white px-1.5 py-0.5">New</span>}
      </div>
      <div className="p-3 space-y-1 flex-1 flex flex-col">
        <div className="font-semibold text-sm leading-snug group-hover:underline">{p.title || p.city || pathOf(p.url)}</div>
        {p.description && <p className="text-xs text-slate-500 line-clamp-2">{p.description}</p>}
        <div className="mt-auto pt-1 flex items-center gap-2 text-xs text-slate-500">
          <span className="flex-1">{p.publishedExact ? shortDay(p.published) : `Live by ${shortDay(p.published)}`}</span>
          {c ? <span className="tabular-nums">{n0(c.clicks)} clicks · {n0(c.impressions)} shown</span> : <span className="text-slate-400">no Google clicks yet</span>}
        </div>
      </div>
    </a>
  );
}
