"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";

export type Light = "good" | "warning" | "critical" | "none";
export const LIGHT: Record<Light, string> = { good: "#1F9D55", warning: "#D97706", critical: "#DC2626", none: "#CBD5E1" };
export const LIGHT_WORD: Record<Light, string> = { good: "On pace", warning: "A bit behind", critical: "Behind", none: "No goal" };

export const Dot = ({ l }: { l: Light }) => (
  <span title={LIGHT_WORD[l]} className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LIGHT[l] }} />
);

export const Card = ({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <h2 className="font-bold flex-1" style={{ color: NAVY }}>{title}</h2>
      {right}
    </div>
    {children}
  </section>
);

export type FeedItem = {
  id: string; bot: string; area: string; title: string; body?: string; link?: string; at: number;
  ask?: string; options?: string[]; answer?: { value: string; by: string; at: number }; dismissed?: boolean;
};

/** Bot reports and questions. Owners answer; the bot reads the answer on its next run. */
export function Feed({ items, canAnswer, onChange, empty }: { items: FeedItem[]; canAnswer: boolean; onChange: () => void; empty: string }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function send(id: string, body: object) {
    setBusy(id); setErr("");
    try { await api("/api/marketing/feed", { method: "POST", json: { id, ...body } }); onChange(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  }
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="divide-y divide-slate-100">
      {err && <p className="text-sm text-red-600 pb-2">{err}</p>}
      {items.map((f) => (
        <div key={f.id} className="py-2.5 space-y-1">
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-100 text-slate-600 shrink-0">{f.bot}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{f.title}</div>
              {f.body && <p className="text-sm text-slate-600 whitespace-pre-line break-words">{f.body}</p>}
              <div className="text-xs text-slate-400 flex gap-3 mt-0.5">
                <span>{ago(f.at)}</span>
                {f.link && <a href={f.link} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Open <ExternalLink size={11} /></a>}
              </div>
            </div>
            {!f.ask || f.answer ? (
              <button aria-label="Clear" title="Clear" disabled={busy === f.id} onClick={() => send(f.id, { dismiss: true })} className="p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
            ) : null}
          </div>
          {f.ask && (
            <div className="ml-12 rounded-lg bg-amber-50 border border-amber-200 p-2 text-sm space-y-2">
              <div className="font-semibold">{f.ask}</div>
              {f.answer ? (
                <div className="text-green-700 flex items-center gap-1"><Check size={14} /> {f.answer.by} said {f.answer.value} {ago(f.answer.at)}</div>
              ) : canAnswer ? (
                <div className="flex gap-2 flex-wrap">
                  {(f.options ?? ["Yes", "No"]).map((o) => (
                    <button key={o} disabled={busy === f.id} onClick={() => send(f.id, { answer: o })}
                      className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300 bg-white hover:bg-slate-50">
                      {busy === f.id ? <Loader2 size={14} className="animate-spin" /> : o}
                    </button>
                  ))}
                </div>
              ) : <div className="text-slate-500">Waiting on an owner.</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
