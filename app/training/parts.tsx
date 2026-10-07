"use client";

import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, GREEN, NAVY, RED } from "@/components/ui";

export type Block =
  | { t: "p"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] };
export type Band = { cat: string; n: number; p25: number; median: number; p75: number };
export type Rates = {
  rooflinePerFt: number; perStrand: number; pillar: number; wreath: Record<string, number>;
  depositPct: number; taxPct: number; cashDiscountPct: number; returningDiscountPct: number; returningBefore: string; passPct: number;
};
export type BlindLine = { name: string; desc: string; qty: number; cat: string; optional: boolean };
export type BlindItem = { id: string; season: string; title: string; included: string[]; lines: BlindLine[] };
export type LineResult = { answer: number; real: number; unit: number; qty: number; cat: string; pctOff: number; grade: Grade; band: Band | null };
export type QuoteResult = { item: string; total: number; answerTotal: number; pctOff: number; grade: Grade; lines: LineResult[] };
type Grade = "pass" | "close" | "miss";

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
export const GRADE: Record<Grade, { label: string; color: string; bg: string }> = {
  pass: { label: "Within range", color: GREEN, bg: "#E8F6EE" },
  close: { label: "Close", color: "#B7791F", bg: "#FDF6E3" },
  miss: { label: "Off", color: RED, bg: "#FDECEC" },
};

/** **bold** inside lesson text. */
export function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((s, i) => (s.startsWith("**") ? <b key={i}>{s.slice(2, -2)}</b> : <Fragment key={i}>{s}</Fragment>))}</>;
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}><Inline text={b.text} /></p>;
        if (b.t !== "table") {
          const L = b.t === "ol" ? "ol" : "ul";
          return <L key={i} className={`pl-5 space-y-1 ${b.t === "ol" ? "list-decimal" : "list-disc"}`}>{b.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</L>;
        }
        return (
          <div key={i} className="overflow-x-auto -mx-1">
            <table className="text-sm w-full border-collapse">
              <thead><tr>{b.head.map((h, j) => <th key={j} className="text-left font-semibold p-2 border-b border-slate-300 bg-slate-50">{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="p-2 border-b border-slate-100 align-top"><Inline text={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) =>
  <div className={`bg-white rounded-xl border border-slate-200 p-4 ${className}`}>{children}</div>;

export const H1 = ({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) => (
  <div>
    <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>{children}</h1>
    {sub && <p className="text-sm text-slate-500">{sub}</p>}
  </div>
);

export const Btn = ({ children, onClick, disabled, ghost }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; ghost?: boolean }) => (
  <button onClick={onClick} disabled={disabled}
    className={`rounded-lg px-4 py-2 font-semibold text-sm disabled:opacity-50 ${ghost ? "border border-slate-300" : "text-white"}`}
    style={ghost ? undefined : { background: NAVY }}>
    {children}
  </button>
);

export const Spinner = ({ text = "Loading..." }: { text?: string }) =>
  <div className="p-6 text-slate-500 flex gap-2"><Loader2 className="animate-spin" /> {text}</div>;

export const bandText = (b: Band | null) => (b ? `Usual ${money(b.p25)} to ${money(b.p75)} each (typical ${money(b.median)})` : "");

/** One past quote with prices hidden: the trainee enters a price per line. */
export function QuoteForm({ item, result, values, onChange }: {
  item: BlindItem; result?: QuoteResult; values: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">{item.season} season · {item.title}</div>
      {item.lines.map((l, i) => {
        const r = result?.lines[i];
        return (
          <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2" style={r ? { background: GRADE[r.grade].bg } : undefined}>
            <div className="font-semibold text-sm">{l.name}{l.optional && <span className="ml-2 text-[11px] font-bold text-slate-500">OPTIONAL</span>}</div>
            {l.desc && <p className="text-sm text-slate-600 whitespace-pre-line">{l.desc}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">{l.qty !== 1 ? `Qty ${l.qty} · ` : ""}Your price for this line</span>
              <span className="text-slate-500">$</span>
              <input inputMode="decimal" value={values[i] ?? ""} disabled={!!result}
                onChange={(e) => { const v = [...values]; v[i] = e.target.value.replace(/[^\d.]/g, ""); onChange(v); }}
                className="w-28 rounded-md border border-slate-300 px-2 py-1" />
            </div>
            {r && (
              <div className="text-sm">
                <b style={{ color: GRADE[r.grade].color }}>{GRADE[r.grade].label}</b>: you said {money(r.answer)}, Light DMV charged <b>{money(r.real)}</b>
                {r.qty !== 1 ? ` (${r.qty} × ${money(r.unit)})` : ""}, {r.pctOff}% off.
                {r.band && <div className="text-xs text-slate-500">{bandText(r.band)}.</div>}
              </div>
            )}
          </div>
        );
      })}
      {item.included.length > 0 && <div className="text-xs text-slate-500">Also on the quote at $0: {item.included.join(" · ")}</div>}
      {result && (
        <div className="rounded-lg p-3 font-semibold" style={{ background: GRADE[result.grade].bg, color: GRADE[result.grade].color }}>
          Total: you {money(result.answerTotal)}, real {money(result.total)}, {result.pctOff}% off.
        </div>
      )}
    </div>
  );
}

export async function gradeQuotes(mode: "blind" | "final", items: BlindItem[], values: string[][]) {
  return api<{ results: QuoteResult[]; within: number; of: number; passPct: number }>("/api/training/practice", {
    method: "POST",
    json: { mode, answers: items.map((it, i) => ({ item: it.id, lines: it.lines.map((_, j) => Number(values[i]?.[j]) || 0) })) },
  });
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr("");
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return { busy, err, run };
}
