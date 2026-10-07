"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Band, bandText, Btn, Card, GRADE, H1, money, Rates, Spinner, useBusy } from "../parts";

type Tree = { id: string; season: string; name: string; desc: string; qty: number };
type Res = { real: number; unit: number; pctOff: number; grade: keyof typeof GRADE; byRule: number; perStrand: number; realStrands: number | null; band: Band | null };

/** Price past sold trees from their description: strands × the strand rate, checked against the real price. */
export default function TreeTrainer() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [t, setT] = useState<Tree | null>(null);
  const [strands, setStrands] = useState("");
  const [price, setPrice] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const { busy, err, run } = useBusy();
  const next = () => run(async () => {
    const r = await api<{ tree: Tree | null }>("/api/training/practice?mode=tree");
    setT(r.tree); setStrands(""); setPrice(""); setRes(null);
  });
  useEffect(() => { api<{ rates: Rates }>("/api/training").then((d) => setRates(d.rates)).catch(() => {}); next(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rates) return <Spinner />;
  const rule = (Number(strands) || 0) * rates.perStrand;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Training</Link>
      <H1 sub={`A tree is strands × ${money(rates.perStrand)}, then judgment. Photos of each tree come once Chris saves the mockups; for now, read the description.`}>Tree trainer</H1>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!t ? <Spinner /> : (
        <Card className="space-y-3" >
          <div className="text-xs text-slate-500">{t.season} season · sold quote</div>
          <div className="font-semibold">{t.name}{t.qty !== 1 ? ` (qty ${t.qty})` : ""}</div>
          {t.desc && <p className="text-sm text-slate-600 whitespace-pre-line">{t.desc}</p>}
          <div className="flex flex-wrap gap-4 items-end">
            <label className="block">
              <span className="text-sm font-semibold">Strands</span>
              <input inputMode="decimal" value={strands} disabled={!!res} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setStrands(v); if (!price || Number(price) === rule) setPrice(String((Number(v) || 0) * rates.perStrand || "")); }}
                className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 block" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Your price {t.qty !== 1 ? "(whole line)" : ""}</span>
              <input inputMode="decimal" value={price} disabled={!!res} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1.5 block" />
            </label>
            <span className="text-sm text-slate-500 pb-2">Rule: {money(rule)}</span>
          </div>
          {res ? (
            <div className="rounded-lg p-3 space-y-1" style={{ background: GRADE[res.grade].bg }}>
              <div className="font-bold" style={{ color: GRADE[res.grade].color }}>{GRADE[res.grade].label}: real price {money(res.real)}, you were {res.pctOff}% off.</div>
              {res.realStrands != null && <div className="text-sm">That's {res.realStrands} strands at {money(res.perStrand)}.</div>}
              {res.band && <div className="text-xs text-slate-600">{bandText(res.band)}.</div>}
            </div>
          ) : null}
          {res ? <Btn disabled={busy} onClick={next}>Next tree</Btn> : (
            <Btn disabled={busy || !price} onClick={() => run(async () => {
              setRes(await api<Res>("/api/training/practice", { method: "POST", json: { mode: "tree", answers: [{ item: t.id, strands: Number(strands) || 0, price: Number(price) || 0 }] } }));
            })}>Check</Btn>
          )}
        </Card>
      )}
    </div>
  );
}
