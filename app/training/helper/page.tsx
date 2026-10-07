"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Band, Card, H1, money, Rates, Spinner } from "../parts";

type Home = { loaded: boolean; rates: Rates; bands?: Band[] };
const num = (s: string) => Number(s) || 0;

/** "How would we price this?": the rule price from the owners' rates next to what past quotes charged. */
export default function PriceHelper() {
  const [d, setD] = useState<Home | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [trees, setTrees] = useState<string[]>([""]);
  useEffect(() => { api<Home>("/api/training").then(setD).catch(() => {}); }, []);
  if (!d) return <Spinner />;
  const r = d.rates;
  const band = (cat: string) => d.bands?.find((b) => b.cat === cat) ?? null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") });

  type Row = { label: string; rule: number | null; how: string; band: Band | null; count: number };
  const rows: Row[] = [];
  if (num(f.roof)) rows.push({ label: `Roofline, ${num(f.roof)} ft`, rule: num(f.roof) * r.rooflinePerFt, how: `${num(f.roof)} ft × ${money(r.rooflinePerFt)}`, band: band("roofline"), count: 1 });
  if (num(f.pillars)) rows.push({ label: `Pillars × ${num(f.pillars)}`, rule: num(f.pillars) * r.pillar, how: `${num(f.pillars)} × ${money(r.pillar)}`, band: band("pillars"), count: num(f.pillars) });
  trees.forEach((t, i) => { if (num(t)) rows.push({ label: `Tree ${i + 1}, ${num(t)} strands`, rule: num(t) * r.perStrand, how: `${num(t)} × ${money(r.perStrand)}`, band: band("tree"), count: 1 }); });
  if (num(f.bushStrands)) rows.push({ label: `Bushes, ${num(f.bushStrands)} strands`, rule: num(f.bushStrands) * r.perStrand, how: `${num(f.bushStrands)} × ${money(r.perStrand)}`, band: band("bushes"), count: 1 });
  if (num(f.railStrands)) rows.push({ label: `Railing, ${num(f.railStrands)} strands`, rule: num(f.railStrands) * r.perStrand, how: `${num(f.railStrands)} × ${money(r.perStrand)}`, band: band("railing"), count: 1 });
  for (const size of Object.keys(r.wreath)) {
    const n = num(f[`w${size}`]);
    if (n) rows.push({ label: `${size}" wreath × ${n}`, rule: n * r.wreath[size], how: `${n} × ${money(r.wreath[size])}`, band: band("wreath"), count: n });
  }
  if (f.stakes === "1") rows.push({ label: "Pathway / driveway stakes", rule: null, how: "no set rate yet", band: band("stakes/pathway"), count: 1 });
  if (f.garland === "1") rows.push({ label: "Garland", rule: null, how: "no set rate yet", band: band("garland"), count: 1 });
  const total = rows.reduce((t, x) => t + (x.rule ?? (x.band ? (x.band.avg ?? x.band.median) * x.count : 0)), 0);

  const field = (k: string, label: string, ph = "") => (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input inputMode="decimal" placeholder={ph} value={f[k] ?? ""} onChange={set(k)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
    </label>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Training</Link>
      <H1 sub="Enter what you measured. The rule price uses the owners' rates; the range is what past sold quotes charged.">Price helper</H1>
      <Card className="grid sm:grid-cols-2 gap-3">
        {field("roof", "Roofline feet (all runs and peaks)", "e.g. 120")}
        {field("pillars", "Pillars (9 to 10 ft each)", "count")}
        {field("bushStrands", "Bushes: total strands", "strands of minis")}
        {field("railStrands", "Railing: strands", "strands of minis")}
        <div className="sm:col-span-2 space-y-1">
          <span className="text-sm font-semibold">Trees: strands per tree</span>
          <div className="flex flex-wrap gap-2">
            {trees.map((t, i) => (
              <input key={i} inputMode="decimal" placeholder={`Tree ${i + 1}`} value={t}
                onChange={(e) => { const n = [...trees]; n[i] = e.target.value.replace(/[^\d.]/g, ""); setTrees(n); }}
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5" />
            ))}
            <button className="text-sm font-semibold px-2" style={{ color: NAVY }} onClick={() => setTrees([...trees, ""])}>+ tree</button>
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-wrap gap-3">
          {Object.keys(r.wreath).map((s) => <div key={s} className="w-24">{field(`w${s}`, `${s}" wreaths`, "0")}</div>)}
        </div>
        <div className="sm:col-span-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.stakes === "1"} onChange={(e) => setF({ ...f, stakes: e.target.checked ? "1" : "" })} /> Pathway stakes</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.garland === "1"} onChange={(e) => setF({ ...f, garland: e.target.checked ? "1" : "" })} /> Garland</label>
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="space-y-2">
          {rows.map((x, i) => (
            <div key={i} className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <div>
                <div className="font-semibold text-sm">{x.label}</div>
                <div className="text-xs text-slate-500">
                  {x.how}{x.band ? ` · average ${money(x.band.avg ?? x.band.median)}, most ${money(x.band.p25)} to ${money(x.band.p75)}${x.count > 1 ? " each" : ""}` : ""}
                </div>
              </div>
              <div className="font-bold whitespace-nowrap">{x.rule != null ? money(x.rule) : x.band ? `~${money((x.band.avg ?? x.band.median) * x.count)}` : "?"}</div>
            </div>
          ))}
          <div className="flex justify-between font-extrabold text-lg" style={{ color: NAVY }}><span>Total before tax</span><span>{money(total)}</span></div>
          <div className="text-sm text-slate-600">
            Tax {r.taxPct}%: {money(total * r.taxPct / 100)} · Deposit {r.depositPct}%: {money(total * (1 + r.taxPct / 100) * r.depositPct / 100)} ·
            Returning customers: last year's price, {r.returningDiscountPct}% off if booked before {r.returningBefore} · Cash: {r.cashDiscountPct}% off.
          </div>
          <p className="text-xs text-slate-400">Takedown, maintenance, storage, timers and hidden cords always go on their own $0 line. Check every line against the range, then use judgment (height, pitch, stories).</p>
        </Card>
      )}
    </div>
  );
}
