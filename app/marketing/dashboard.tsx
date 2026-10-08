"use client";

import { useState } from "react";
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
};

// Categorical slots 1 and 2 of the validated chart palette (adjacent-pair CVD safe on white).
const COLOR: Record<Kind, string> = { organic: "#2a78d6", paid: "#eb6834" };
const NAME: Record<Kind, string> = { organic: "Organic", paid: "Paid" };
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const per = (spend: number, n: number) => (spend && n ? money(spend / n) : "–");
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function OrganicPaid({ a, at, days, setDays, connected }: {
  a: Attribution | null; at: number | null; days: number; setDays: (n: number) => void; connected: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Organic vs paid</h2>
          <p className="text-xs text-slate-500">Leads, quotes and sales by where they came from, from GoHighLevel{at ? `, updated ${ago(at)}` : ""}</p>
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
              <Side kind="organic" n={a.totals.organic} />
              <Side kind="paid" n={a.totals.paid} />
            </div>
            <Share a={a} />
            <Trend weeks={a.weeks} />
            <Sources rows={a.rows} />
            {a.untagged.length > 0 && (
              <p className="text-xs text-slate-500">Not tagged with a source in GoHighLevel: {a.untagged.join(", ")}. Tag them there and they move into the right row.</p>
            )}
          </>
        )}
    </section>
  );
}

function Side({ kind, n }: { kind: Kind; n: Nums }) {
  const stats: [string, string][] = [
    ["Quotes", n.quotes.toLocaleString()],
    ["Sold", n.sales.toLocaleString()],
    ["Sales", money(n.revenue)],
  ];
  if (kind === "paid") stats.push(["Spent", money(n.spend)], ["Per lead", per(n.spend, n.leads)], ["Per sale", per(n.spend, n.sales)]);
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[kind] }} />{NAME[kind]}
        <span className="text-xs font-normal text-slate-400">{kind === "paid" ? "Google ads, Meta ads, cold email" : "Google Business, website, calls, email, signs, referrals"}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tabular-nums text-slate-900">{n.leads.toLocaleString()}</span>
        <span className="text-sm text-slate-500">leads</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt>
            <dd className="text-base font-bold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
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

function Sources({ rows }: { rows: Row[] }) {
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
                  <span className="tabular-nums font-semibold text-slate-900">{r.leads}</span>
                </span>
              </td>
              <td className="text-right tabular-nums px-1">{r.quotes || "–"}</td>
              <td className="text-right tabular-nums px-1">{r.sales || "–"}</td>
              <td className="text-right tabular-nums px-1">{r.revenue ? money(r.revenue) : "–"}</td>
              <td className="text-right tabular-nums px-1">{r.spend ? money(r.spend) : "–"}</td>
              <td className="text-right tabular-nums px-1">{per(r.spend, r.leads)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
