"use client";

import { Fragment, useState } from "react";
import { Lightbulb, Loader2, X } from "lucide-react";
import { api, GREEN, NAVY, RED } from "@/components/ui";

export type Block =
  | { t: "p"; text: string }
  | { t: "tip"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "img"; id: string; caption: string }
  | { t: "gallery"; items: { id: string; caption: string }[] };
export type Band = { cat: string; n: number; p25: number; median: number; p75: number; avg?: number };
export type Rates = {
  rooflinePerFt: number; perStrand: number; pillar: number; wreath: Record<string, number>;
  depositPct: number; taxPct: number; cashDiscountPct: number; returningDiscountPct: number; returningBefore: string; passPct: number;
};
export type Grade = "pass" | "close" | "miss";
export type Check = { q: string; options: string[]; answer: number; why: string };
export type LessonCard = { title: string; blocks: Block[]; check?: Check };

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
        if (b.t === "tip") return <div key={i} className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm"><Lightbulb size={18} className="shrink-0 text-amber-600" /><span><Inline text={b.text} /></span></div>;
        if (b.t === "img") return <Photo key={i} id={b.id} caption={b.caption} big />;
        if (b.t === "gallery") return <Gallery key={i} items={b.items} />;
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

export const imgSrc = (id: string) => `/api/training/img/${id}`;

/** A real install photo from the course, tap to see it full screen. */
export function Photo({ id, caption, big, className = "" }: { id: string; caption?: string; big?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <figure className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgSrc(id)} alt={caption || "Install photo"} loading="lazy" onClick={() => setOpen(true)}
        className={`w-full ${big ? "max-h-[28rem]" : "h-44"} object-cover rounded-lg border border-slate-200 bg-slate-900 cursor-zoom-in`} />
      {caption && <figcaption className="text-sm text-slate-600 mt-1"><Inline text={caption} /></figcaption>}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-3" onClick={() => setOpen(false)}>
          <button className="absolute top-3 right-3 text-white" aria-label="Close"><X /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc(id)} alt={caption || "Install photo"} className="max-h-[85vh] max-w-full object-contain rounded" />
          {caption && <p className="text-white text-sm mt-2 text-center max-w-2xl">{caption.replace(/\*\*/g, "")}</p>}
        </div>
      )}
    </figure>
  );
}

export function Gallery({ items }: { items: { id: string; caption: string }[] }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{items.map((x, i) => <Photo key={i} id={x.id} caption={x.caption} />)}</div>;
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

export const bandText = (b: Band | null) => (b ? `Average ${money(b.avg ?? b.median)}, most ${money(b.p25)} to ${money(b.p75)} each` : "");

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr("");
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return { busy, err, run };
}
