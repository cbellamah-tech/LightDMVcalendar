"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Btn, Card, GRADE, H1, money, Spinner, useBusy } from "../parts";
import { LineMockups, useMockups } from "../Mockups";

type Group = { size: string; n: number; avg: number; low: number; high: number };
type Ref = { id: string; season: string; name: string; desc: string; qty: number; unit: number; total: number; size: string; wrap: string; strands: number };
type Tree = { id: string; season: string; name: string; desc: string; qty: number; wrap: string };
type Res = { real: number; unit: number; pctOff: number; grade: keyof typeof GRADE; perStrand: number; realStrands: number | null; size: string; group: Group | null };

/** Trees: a reference set of every size and shape with the mockup and price, then practice pricing from the mockup. */
export default function Trees() {
  const [tab, setTab] = useState<"ref" | "practice">("ref");
  const [d, setD] = useState<{ groups: Group[]; refs: Ref[]; perStrand: number } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/training/trees").then(setD).catch((e) => setErr(e.message)); }, []);
  if (!d) return err ? <div className="p-6 text-red-600">{err}</div> : <Spinner />;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Training</Link>
      <H1 sub={`Every tree is different. Price = strands × ${money(d.perStrand)}; learn to count strands from the mockup. Prices are from this year's and last year's quotes.`}>Trees</H1>
      <div className="flex gap-2">
        {(["ref", "practice"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-4 py-1.5 text-sm font-semibold border"
            style={{ background: tab === t ? NAVY : "white", color: tab === t ? "white" : NAVY, borderColor: NAVY }}>
            {t === "ref" ? "Reference trees" : "Practice"}
          </button>
        ))}
      </div>
      {tab === "ref" ? <Reference d={d} /> : <Practice perStrand={d.perStrand} />}
    </div>
  );
}

function Reference({ d }: { d: { groups: Group[]; refs: Ref[]; perStrand: number } }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="font-bold mb-2">Average price by tree size</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-1">Tree</th><th>Average</th><th>Most fall between</th><th>Strands</th></tr></thead>
          <tbody>{d.groups.map((g) => (
            <tr key={g.size} className="border-t border-slate-100"><td className="py-1.5 font-semibold">{g.size}</td><td>{money(g.avg)}</td><td>{money(g.low)} to {money(g.high)}</td><td>about {Math.round(g.avg / d.perStrand)}</td></tr>
          ))}</tbody>
        </table>
        <p className="text-xs text-slate-400 mt-1">From {d.groups.reduce((t, g) => t + g.n, 0)} tree lines on 2025-26 and 2026-27 quotes.</p>
      </Card>
      {d.groups.map((g) => {
        const refs = d.refs.filter((r) => r.size === g.size);
        if (!refs.length) return null;
        return (
          <div key={g.size} className="space-y-2">
            <h2 className="font-bold text-lg" style={{ color: NAVY }}>{g.size}</h2>
            {refs.map((r) => <RefTree key={r.id} r={r} />)}
          </div>
        );
      })}
    </div>
  );
}

function RefTree({ r }: { r: Ref }) {
  const counts = useMockups(`tree:${r.id}`);
  return (
    <Card className="space-y-2">
      <div className="flex justify-between gap-3">
        <div className="font-semibold text-sm">{r.wrap} <span className="text-slate-400 font-normal">· {r.season}</span></div>
        <div className="font-extrabold whitespace-nowrap" style={{ color: NAVY }}>{money(r.total)}</div>
      </div>
      {counts === null ? <div className="h-28 rounded-lg bg-slate-100 animate-pulse" /> : counts[0] ? <LineMockups refId={`tree:${r.id}`} line={0} count={counts[0]} big /> : <div className="text-xs text-slate-400">No mockup on this line in Jobber.</div>}
      <div className="text-sm text-slate-600">About {r.strands} strands{r.qty !== 1 ? ` each, ${r.qty} trees` : ""}. {r.name}</div>
      {r.desc && <details className="text-xs text-slate-500"><summary>Description on the quote</summary><p className="whitespace-pre-line mt-1">{r.desc}</p></details>}
    </Card>
  );
}

function Practice({ perStrand }: { perStrand: number }) {
  const [t, setT] = useState<Tree | null>(null);
  const [strands, setStrands] = useState("");
  const [price, setPrice] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const { busy, err, run } = useBusy();
  const counts = useMockups(t ? `tree:${t.id}` : null);
  const next = () => run(async () => {
    const r = await api<{ tree: Tree | null }>("/api/training/practice?mode=tree");
    setT(r.tree); setStrands(""); setPrice(""); setRes(null);
  });
  useEffect(() => { next(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return err ? <p className="text-sm text-red-600">{err}</p> : <Spinner />;
  const rule = (Number(strands) || 0) * perStrand;

  return (
    <Card className="space-y-3">
      <div className="text-xs text-slate-500">{t.season} season · {t.wrap}</div>
      {counts === null ? <div className="h-64 rounded-lg bg-slate-100 animate-pulse" /> : counts[0] ? <LineMockups refId={`tree:${t.id}`} line={0} count={counts[0]} big /> : <p className="text-xs text-slate-400">No mockup on this one; price it from the description.</p>}
      <div className="font-semibold text-sm">{t.name}{t.qty !== 1 ? ` (${t.qty} trees)` : ""}</div>
      {t.desc && <p className="text-sm text-slate-600 whitespace-pre-line">{t.desc}</p>}
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="text-sm font-semibold">Strands {t.qty !== 1 ? "per tree" : ""}</span>
          <input inputMode="decimal" value={strands} disabled={!!res}
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setStrands(v); setPrice(String(Math.round((Number(v) || 0) * perStrand * (t.qty || 1)) || "")); }}
            className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 block" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Your price {t.qty !== 1 ? "(whole line)" : ""}</span>
          <input inputMode="decimal" value={price} disabled={!!res} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1.5 block" />
        </label>
        <span className="text-sm text-slate-500 pb-2">{strands ? `${strands} × ${money(perStrand)} = ${money(rule)}` : ""}</span>
      </div>
      {res && (
        <div className="rounded-lg p-3 space-y-1" style={{ background: GRADE[res.grade].bg }}>
          <div className="font-bold" style={{ color: GRADE[res.grade].color }}>{GRADE[res.grade].label}: we charged {money(res.real)}, you were {res.pctOff}% off.</div>
          {res.realStrands != null && <div className="text-sm">That's {res.realStrands} strands at {money(res.perStrand)}.</div>}
          {res.group && <div className="text-xs text-slate-600">{res.size} trees average {money(res.group.avg)}, most between {money(res.group.low)} and {money(res.group.high)}.</div>}
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res ? <Btn disabled={busy} onClick={next}>Next tree</Btn> : (
        <Btn disabled={busy || !price} onClick={() => run(async () => {
          setRes(await api<Res>("/api/training/practice", { method: "POST", json: { mode: "tree", item: t.id, price: Number(price) || 0 } }));
        })}>Check</Btn>
      )}
    </Card>
  );
}
