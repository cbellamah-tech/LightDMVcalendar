"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Band, Btn, Card, GRADE, Grade, money, Photo, Rates, useBusy } from "./parts";
import { LineMockups, useMockups } from "./Mockups";

export type JobLine = { i: number; name: string; desc: string; qty: number; cat: string; ask: boolean; price: number | null };
export type Job = { id: string; season: string; photos: string[]; lines: JobLine[]; included: string[] };
export type TreeGroup = { size: string; n: number; avg: number };
export type Result = {
  rows: { i: number; name: string; cat: string; qty: number; unit: number; real: number; mine: number; pctOff: number; grade: Grade; how: string }[];
  realTotal: number; myTotal: number; pctOff: number; grade: Grade; passPct: number; final: { within: number; of: number } | null;
};

const CAT: Record<string, string> = {
  roofline: "Roofline", "roofline+pillars": "Roofline and pillars", pillars: "Pillars", tree: "Trees", "trees+bushes": "Trees and bushes",
  bushes: "Bushes", wreath: "Wreaths", railing: "Railing", "stakes/pathway": "Stakes", garland: "Garland", other: "Other",
};

/** The pricing rules for the line types on this job (hidden in the final check). */
function Rules({ cats, rates, bands, trees }: { cats: string[]; rates: Rates; bands: Band[]; trees: TreeGroup[] }) {
  const rule: Record<string, string> = {
    roofline: `$${rates.rooflinePerFt} a foot, more for 2+ stories, steep roofs, peaks and dormers.`,
    "roofline+pillars": `Roofline at $${rates.rooflinePerFt} a foot plus $${rates.pillar} a pillar (and stakes if they're on the line).`,
    pillars: `$${rates.pillar} for a standard 9 to 10 ft pillar (2 strands); less for short posts.`,
    tree: `Strands of mini lights × $${rates.perStrand}. ${trees.filter((t) => /ft/.test(t.size)).map((t) => `${t.size}: avg ${money(t.avg)}`).join(", ")}.`,
    bushes: `Strands of mini lights × $${rates.perStrand}.`,
    wreath: Object.entries(rates.wreath).map(([s, v]) => `${s}" ${money(v)}`).join(", ") + ". Red bow $13.",
    railing: "Top of the railing in mini lights, usually $40 to $90.",
    "stakes/pathway": "C9 bulbs on ground stakes, 12 inch spacing. Price by length.",
  };
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1.5">
      {[...new Set(cats)].map((c) => {
        const b = bands.find((x) => x.cat === c);
        return <div key={c}><b>{CAT[c] ?? c}:</b> {rule[c] ?? "Price it like the closest line type."}{b ? ` Our 2025-27 average ${money(b.avg ?? b.median)}, most between ${money(b.p25)} and ${money(b.p75)}.` : ""}</div>;
      })}
    </div>
  );
}

export function PriceJob({ job, mode, module, run, rates, bands, trees, label, onDone }: {
  job: Job; mode: "drill" | "quote" | "final"; module?: string; run?: string; rates: Rates; bands: Band[]; trees: TreeGroup[]; label?: string; onDone: (r: Result) => void;
}) {
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [rules, setRules] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const { busy, err, run: go } = useBusy();
  const mock = useMockups(res ? `pq:${job.id}` : null);
  const ask = job.lines.filter((l) => l.ask);
  const ready = ask.every((l) => Number(prices[l.i]) > 0);

  async function check() {
    await go(async () => {
      const r = await api<Result>("/api/training/practice", { method: "POST", json: { job: job.id, mode, module, run, prices: Object.fromEntries(ask.map((l) => [l.i, Number(prices[l.i])])) } });
      setRes(r); onDone(r);
    });
  }

  return (
    <div className="space-y-3">
      {label && <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>}
      <Photo id={job.photos[0]} big caption="The finished install. This is what the customer bought." />
      {job.photos.length > 1 && <div className="grid grid-cols-3 gap-2">{job.photos.slice(1).map((p) => <Photo key={p} id={p} />)}</div>}

      <Card className="space-y-3">
        <div className="font-bold" style={{ color: NAVY }}>{mode === "drill" ? "Price the highlighted lines" : "Price every line"}</div>
        {job.lines.map((l) => {
          const row = res?.rows.find((r) => r.i === l.i);
          return (
            <div key={l.i} className={`rounded-lg border p-3 space-y-2 ${l.ask ? "border-slate-300 bg-white" : "border-slate-100 bg-slate-50"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</div>
                  <div className="text-xs text-slate-500">{CAT[l.cat] ?? l.cat}</div>
                </div>
                {l.ask ? (
                  <label className="flex items-center gap-1 shrink-0">
                    <span className="text-slate-500">$</span>
                    <input inputMode="decimal" disabled={!!res} value={prices[l.i] ?? ""} placeholder="line total"
                      onChange={(e) => setPrices({ ...prices, [l.i]: e.target.value.replace(/[^\d.]/g, "") })}
                      className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right" />
                  </label>
                ) : <div className="text-sm text-slate-500 shrink-0">{money(l.price ?? 0)}</div>}
              </div>
              {l.desc && (
                <button className="text-xs font-semibold flex items-center gap-1" style={{ color: NAVY }} onClick={() => setOpen({ ...open, [l.i]: !open[l.i] })}>
                  {open[l.i] ? <ChevronUp size={14} /> : <ChevronDown size={14} />} What the line says
                </button>
              )}
              {open[l.i] && <p className="text-sm text-slate-600 whitespace-pre-line">{l.desc}</p>}
              {row && (
                <div className="rounded-md p-2 text-sm" style={{ background: GRADE[row.grade].bg }}>
                  <b style={{ color: GRADE[row.grade].color }}>{GRADE[row.grade].label}:</b> you {money(row.mine)}, we charged <b>{money(row.real)}</b>
                  {row.qty > 1 ? ` (${row.qty} × ${money(row.unit)})` : ""} · {row.pctOff}% off.{row.how ? ` ${row.how}` : ""}
                </div>
              )}
              {res && mock && mock[l.i] > 0 && (
                <div className="space-y-1"><div className="text-xs font-semibold text-slate-500">Our mockup for this line</div><LineMockups refId={`pq:${job.id}`} line={l.i} count={mock[l.i]} /></div>
              )}
            </div>
          );
        })}
        {job.included.length > 0 && <div className="text-xs text-slate-500">Also on the quote at $0: {job.included.join(" · ")}</div>}

        {mode !== "final" && !res && (
          <div className="space-y-2">
            <button className="text-sm font-semibold" style={{ color: NAVY }} onClick={() => setRules(!rules)}>{rules ? "Hide" : "Show"} the pricing rules</button>
            {rules && <Rules cats={ask.map((l) => l.cat)} rates={rates} bands={bands} trees={trees} />}
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!res ? (
          <Btn disabled={busy || !ready} onClick={check}>{ready ? "Check my prices" : "Enter a price on every line"}</Btn>
        ) : (
          <div className="rounded-lg p-3 space-y-1" style={{ background: GRADE[res.grade].bg }}>
            <div className="font-extrabold text-lg" style={{ color: GRADE[res.grade].color }}>
              {res.grade === "pass" ? "Within range." : res.grade === "close" ? "Close." : "Off."} You {money(res.myTotal)}, we charged {money(res.realTotal)} ({res.pctOff}% off).
            </div>
            <div className="text-sm text-slate-600">{res.grade === "pass" ? `Within ${res.passPct}% is a pass.` : "Look at the line you were furthest off on and why."}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
