"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { ago, NAVY } from "@/components/ui";

/* Organic vs paid: leads, quotes and sales by where they came from (GoHighLevel), against ad spend. */

type Kind = "organic" | "paid";
type Nums = { leads: number; quotes: number; sales: number; revenue: number; spend: number };
type Row = Nums & { id: string; label: string; kind: Kind };
export type Attribution = {
  from: string; to: string;
  totals: Record<Kind, Nums>;
  rows: Row[];
  weeks: { week: string; organic: number; paid: number }[];
  untagged: string[];
  items: Item[];
};
type Type = "lead" | "quote" | "sale";
type Item = { type: Type; kind: Kind; source: string; name: string; day: string; value?: number; stage?: string; why?: string };
type Pick = { type: Type; kind?: Kind; source?: string; title: string };

// Categorical slots 1 and 2 of the validated chart palette (adjacent-pair CVD safe on white).
const COLOR: Record<Kind, string> = { organic: "#2a78d6", paid: "#eb6834" };
const NAME: Record<Kind, string> = { organic: "Organic", paid: "Paid" };
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const per = (spend: number, n: number) => (spend && n ? money(spend / n) : "–");
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function OrganicPaid({ a, at, days, setDays, connected, errors = [] }: {
  a: Attribution | null; at: number | null; days: number; setDays: (n: number) => void; connected: boolean; errors?: string[];
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [charts, setCharts] = useState(false);
  useEffect(() => { try { setCharts(localStorage.getItem("mkt:charts") === "1"); } catch {} }, []);
  const toggleCharts = () => { setCharts(!charts); try { localStorage.setItem("mkt:charts", charts ? "0" : "1"); } catch {} };
  const open = (p: Pick) => setPick(pick && pick.title === p.title ? null : p);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Organic vs paid</h2>
          <p className="text-xs text-slate-500">Each person's source and deal stage, read from GoHighLevel contacts and pipelines. Tap any number to see who{at ? `, updated ${ago(at)}` : ""}</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold" role="group" aria-label="Date range">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} aria-pressed={days === n}
              className={`px-3 py-1 rounded-md ${days === n ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{n} days</button>
          ))}
        </div>
      </div>

      {!connected ? <p className="text-sm text-slate-500">Shows once GoHighLevel is connected.</p>
        : !a ? <p className="text-sm text-slate-500">Loading...</p>
        : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <Side kind="organic" n={a.totals.organic} open={open} pick={pick} />
              <Side kind="paid" n={a.totals.paid} open={open} pick={pick} />
            </div>
            {pick && !pick.source && <Detail a={a} pick={pick} close={() => setPick(null)} />}
            <Sources rows={a.rows} open={open} pick={pick} />
            {pick?.source && <Detail a={a} pick={pick} close={() => setPick(null)} />}
            <button onClick={toggleCharts} className="text-xs font-semibold text-slate-600 inline-flex items-center gap-1">
              <ChevronDown size={14} className={charts ? "rotate-180" : ""} /> {charts ? "Hide charts" : "Show charts"}
            </button>
            {charts && <><Share a={a} /><Trend weeks={a.weeks} /></>}
            {a.untagged.length > 0 && (
              <p className="text-xs text-slate-500">Not tagged with a source in GoHighLevel: {a.untagged.join(", ")}. Tag them there and they move into the right row.</p>
            )}
            {errors.map((e) => <p key={e} className="text-xs text-red-600 break-words">{e}</p>)}
          </>
        )}
    </section>
  );
}

const TITLE: Record<Type, string> = { lead: "Leads", quote: "Quotes", sale: "Sold" };

function Side({ kind, n, open, pick }: { kind: Kind; n: Nums; open: (p: Pick) => void; pick: Pick | null }) {
  const tap = (type: Type, label: string, value: string) => {
    const title = `${NAME[kind]} ${label.toLowerCase()}`;
    const on = pick?.title === title;
    return (
      <button key={label} onClick={() => open({ type, kind, title })} aria-pressed={on}
        className={`text-left rounded-lg px-2 py-1 -mx-2 hover:bg-white ${on ? "bg-white ring-1 ring-slate-300" : ""}`}>
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-base font-bold tabular-nums text-slate-900 underline decoration-dotted decoration-slate-300 underline-offset-4">{value}</div>
      </button>
    );
  };
  const fixed = (label: string, value: string) => (
    <div key={label} className="px-2 py-1 -mx-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
  const leadsTitle = `${NAME[kind]} leads`;
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[kind] }} />{NAME[kind]}
        <span className="text-xs font-normal text-slate-400">{kind === "paid" ? "Google ads, Meta ads, cold email" : "Google Business, website, calls, email, signs, referrals"}</span>
      </div>
      <button onClick={() => open({ type: "lead", kind, title: leadsTitle })} aria-pressed={pick?.title === leadsTitle}
        className={`mt-1 flex items-baseline gap-2 rounded-lg px-2 -mx-2 hover:bg-white ${pick?.title === leadsTitle ? "bg-white ring-1 ring-slate-300" : ""}`}>
        <span className="text-4xl font-extrabold tabular-nums text-slate-900">{n.leads.toLocaleString()}</span>
        <span className="text-sm text-slate-500 underline decoration-dotted underline-offset-4">leads</span>
      </button>
      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
        {tap("quote", "Quotes", n.quotes.toLocaleString())}
        {tap("sale", "Sold", n.sales.toLocaleString())}
        {tap("sale", "Sales", money(n.revenue))}
        {kind === "paid" && <>{fixed("Spent", money(n.spend))}{fixed("Per lead", per(n.spend, n.leads))}{fixed("Per sale", per(n.spend, n.sales))}</>}
      </div>
    </div>
  );
}

/** Who's behind a number: name, date, stage and price. */
function Detail({ a, pick, close }: { a: Attribution; pick: Pick; close: () => void }) {
  const label = new Map(a.rows.map((r) => [r.id, r.label]));
  const list = a.items.filter((i) => i.type === pick.type && (!pick.kind || i.kind === pick.kind) && (!pick.source || i.source === pick.source));
  const total = list.reduce((s, i) => s + (i.value ?? 0), 0);
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <span className="font-bold text-sm flex-1">{pick.title} <span className="font-normal text-slate-500">· {list.length}{pick.type !== "lead" && total ? ` · ${money(total)}` : ""}</span></span>
        <button onClick={close} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>
      {!list.length ? <p className="text-sm text-slate-500 px-3 py-2">None in this range.</p> : (
        <div className="max-h-80 overflow-auto divide-y divide-slate-100">
          {list.map((i, k) => (
            <div key={k} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="flex-1 min-w-0 truncate font-medium text-slate-800">{i.name}</span>
              <span className="text-xs text-slate-500 truncate hidden sm:inline max-w-[260px]" title={i.why ? `GoHighLevel says: ${i.why}` : undefined}>
                {pick.source ? "" : label.get(i.source as any) ?? i.source}{i.why ? `${pick.source ? "" : " · "}${i.why}` : ""}
              </span>
              {i.stage && <span className="text-xs text-slate-400 truncate hidden md:inline max-w-[160px]">{i.stage}</span>}
              <span className="text-xs text-slate-400 w-14 text-right">{shortDay(i.day)}</span>
              {pick.type !== "lead" && <span className="tabular-nums font-semibold w-20 text-right">{i.value ? money(i.value) : "–"}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One 100% bar: what share of leads, and of sales dollars, each side brings. */
function Share({ a }: { a: Attribution }) {
  const bars: [string, number, number][] = [
    ["Leads", a.totals.organic.leads, a.totals.paid.leads],
    ["Sales $", a.totals.organic.revenue, a.totals.paid.revenue],
  ];
  return (
    <div className="space-y-2">
      {bars.map(([label, o, p]) => {
        const sum = o + p;
        const po = sum ? Math.round((o / sum) * 100) : 0;
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-16 text-slate-600">{label}</span>
            {sum ? (
              <div className="flex-1 flex h-3 gap-0.5" role="img" aria-label={`${label}: organic ${po}%, paid ${100 - po}%`}>
                {po > 0 && <div className="h-full rounded" style={{ width: `${po}%`, background: COLOR.organic }} title={`Organic ${po}%`} />}
                {po < 100 && <div className="h-full rounded" style={{ width: `${100 - po}%`, background: COLOR.paid }} title={`Paid ${100 - po}%`} />}
              </div>
            ) : <div className="flex-1 h-3 rounded bg-slate-100" />}
            <span className="w-40 text-right tabular-nums text-xs text-slate-600 whitespace-nowrap">{sum ? `${po}% organic · ${100 - po}% paid` : "none yet"}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Leads per week, last 12 weeks, organic and paid as two lines on one axis. */
function Trend({ weeks }: { weeks: Attribution["weeks"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 220, L = 32, R = 96, T = 10, B = 24;
  const max = Math.max(4, ...weeks.flatMap((w) => [w.organic, w.paid]));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, weeks.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const path = (k: Kind) => weeks.map((w, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(w[k]).toFixed(1)}`).join("");
  const last = weeks.length - 1;
  const h = hover ?? null;
  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-slate-600 mb-1">
        <span className="font-semibold text-slate-700">Leads per week</span>
        {(["organic", "paid"] as Kind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: COLOR[k] }} />{NAME[k]}</span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Leads per week, organic and paid, last 12 weeks"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(last, Math.round(((px - L) / (W - L - R)) * last))));
          }}>
          {[0, 1, 2, 3, 4].map((g) => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={y(g * step)} y2={y(g * step)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={L - 6} y={y(g * step) + 4} textAnchor="end" fontSize={11} fill="#64748b">{g * step}</text>
            </g>
          ))}
          {weeks.map((w, i) => (i % 3 === 0 || i === last) && (
            <text key={w.week} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#64748b">{shortDay(w.week)}</text>
          ))}
          {h !== null && <line x1={x(h)} x2={x(h)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth={1} />}
          {(["organic", "paid"] as Kind[]).map((k) => (
            <g key={k}>
              <path d={path(k)} fill="none" stroke={COLOR[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(last)} cy={y(weeks[last][k])} r={4} fill={COLOR[k]} stroke="#fff" strokeWidth={2} />
              <text x={x(last) + 8} y={y(weeks[last][k]) + 4} fontSize={11} fill="#334155">{NAME[k]} {weeks[last][k]}</text>
              {h !== null && <circle cx={x(h)} cy={y(weeks[h][k])} r={4} fill={COLOR[k]} stroke="#fff" strokeWidth={2} />}
            </g>
          ))}
        </svg>
        {h !== null && (
          <div className="absolute top-0 pointer-events-none rounded-lg bg-white border border-slate-200 shadow px-2 py-1 text-xs"
            style={{ left: `${(x(h) / W) * 100}%`, transform: `translateX(${h > last / 2 ? "-110%" : "10%"})` }}>
            <div className="font-semibold text-slate-700">Week of {shortDay(weeks[h].week)}</div>
            {(["organic", "paid"] as Kind[]).map((k) => (
              <div key={k} className="flex items-center gap-1 text-slate-700">
                <span className="w-2 h-2 rounded-full" style={{ background: COLOR[k] }} />{NAME[k]} <b className="tabular-nums ml-auto pl-2">{weeks[h][k]}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Sources({ rows, open, pick }: { rows: Row[]; open: (p: Pick) => void; pick: Pick | null }) {
  const cell = (r: Row, type: Type, text: string | number, title: string) => {
    const t = `${r.label}: ${title}`;
    return (
      <button onClick={() => open({ type, source: r.id, title: t })} disabled={text === "–"}
        className={`tabular-nums hover:underline disabled:no-underline ${pick?.title === t ? "font-bold underline" : ""}`}>{text}</button>
    );
  };
  const max = Math.max(1, ...rows.map((r) => r.leads));
  if (!rows.length) return <p className="text-sm text-slate-500">No leads in this range.</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-500">
            <th className="text-left font-semibold py-1 px-1">Source</th>
            <th className="text-left font-semibold px-1 w-40">Leads</th>
            <th className="text-right font-semibold px-1">Quotes</th>
            <th className="text-right font-semibold px-1">Sold</th>
            <th className="text-right font-semibold px-1">Sales</th>
            <th className="text-right font-semibold px-1">Spent</th>
            <th className="text-right font-semibold px-1">Per lead</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="py-1.5 px-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR[r.kind] }} />
                  <span className="font-medium text-slate-800">{r.label}</span>
                  <span className="text-[10px] text-slate-400">{NAME[r.kind]}</span>
                </span>
              </td>
              <td className="px-1">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 rounded" style={{ width: `${Math.max(4, (r.leads / max) * 96)}px`, background: COLOR[r.kind] }} />
                  <span className="font-semibold text-slate-900">{cell(r, "lead", r.leads, "leads")}</span>
                </span>
              </td>
              <td className="text-right px-1">{cell(r, "quote", r.quotes || "–", "quotes")}</td>
              <td className="text-right px-1">{cell(r, "sale", r.sales || "–", "sold")}</td>
              <td className="text-right px-1">{cell(r, "sale", r.revenue ? money(r.revenue) : "–", "sold")}</td>
              <td className="text-right tabular-nums px-1">{r.spend ? money(r.spend) : "–"}</td>
              <td className="text-right tabular-nums px-1">{per(r.spend, r.leads)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
