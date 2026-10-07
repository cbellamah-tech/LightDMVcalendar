"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, GREEN, Me, NAVY, RED, fmtDay } from "@/components/ui";
import { Btn, Card, H1, Rates, Spinner, useBusy } from "../parts";
import { PackUpload } from "../PackUpload";

type Trainee = {
  uid: string; name: string;
  modules: { id: string; title: string; status: string; detail: string }[];
  intake: { best: number; of: number } | null;
  quotes: { at: number; mode: string; pctOff: number }[];
  trees: number;
  finals: { at: number; within: number; of: number }[];
  worst: { cat: string; n: number; avgOff: number }[];
};

export default function TeamProgress() {
  const [d, setD] = useState<{ passPct: number; trainees: Trainee[] } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/api/training/team").then(setD).catch((e) => setErr(e.message));
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);
  if (!d) return err ? <div className="p-6 text-red-600">{err}</div> : <Spinner />;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Training</Link>
      <H1 sub="Who has passed what, and how close their practice quotes land.">Team progress</H1>
      {!d.trainees.length && <Card><p className="text-slate-600">Nobody has started the course yet.</p></Card>}
      {d.trainees.map((t) => {
        const passed = t.modules.filter((m) => m.status === "passed").length;
        const last = t.quotes.slice(-20);
        const recent = last.slice(-5);
        const within = recent.filter((q) => q.pctOff <= d.passPct).length;
        return (
          <Card key={t.uid} className="space-y-3">
            <div className="flex justify-between items-baseline">
              <div className="font-bold text-lg">{t.name}</div>
              <div className="text-sm text-slate-500">{passed} of {t.modules.length} modules passed</div>
            </div>
            <div className="flex flex-wrap gap-1">
              {t.modules.map((m, i) => (
                <span key={m.id} title={`${m.title}${m.detail ? `: ${m.detail}` : ""}`} className="text-xs font-semibold rounded-full px-2 py-0.5"
                  style={{ background: m.status === "passed" ? "#E8F6EE" : m.status === "in progress" ? "#E6ECF5" : "#F1F5F9", color: m.status === "passed" ? GREEN : m.status === "in progress" ? NAVY : "#94A3B8" }}>
                  {i + 1}. {m.title}
                </span>
              ))}
            </div>
            {last.length > 0 && (
              <div>
                <div className="text-sm font-semibold">Practice quotes: {t.quotes.length} total · last {recent.length}: {within} within {d.passPct}%</div>
                <div className="flex items-end gap-1 h-16 mt-1" aria-label="How far off each practice quote was, oldest to newest">
                  {last.map((q, i) => (
                    <div key={i} title={`${fmtDay(q.at)}: ${q.pctOff}% off`} className="flex-1 rounded-t"
                      style={{ height: `${Math.max(6, Math.min(100, q.pctOff * 2))}%`, background: q.pctOff <= d.passPct ? GREEN : q.pctOff <= 25 ? "#D69E2E" : RED }} />
                  ))}
                </div>
                <div className="text-xs text-slate-400">Each bar is one practice quote, oldest to newest; shorter is closer to the real price.</div>
              </div>
            )}
            {t.worst.length > 0 && <div className="text-sm"><b>Furthest off:</b> {t.worst.map((w) => `${w.cat} (${w.avgOff}% avg, ${w.n} lines)`).join(" · ")}</div>}
            <div className="text-sm text-slate-600">
              {t.intake ? `Intake drill best ${t.intake.best} of ${t.intake.of}. ` : ""}
              {t.trees ? `${t.trees} trees practiced. ` : ""}
              {t.finals.length ? `Final check: ${t.finals.map((f) => `${f.within}/${f.of} on ${fmtDay(f.at)}`).join(", ")}.` : ""}
            </div>
          </Card>
        );
      })}
      {me?.role === "owner" && <RatesEditor />}
      <Card><PackUpload /></Card>
    </div>
  );
}

function RatesEditor() {
  const [r, setR] = useState<Rates | null>(null);
  const [msg, setMsg] = useState("");
  const { busy, err, run } = useBusy();
  useEffect(() => { api<{ rates: Rates }>("/api/training").then((d) => setR(d.rates)).catch(() => {}); }, []);
  if (!r) return null;
  const n = (k: keyof Rates, label: string) => (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input inputMode="decimal" value={String(r[k])} onChange={(e) => setR({ ...r, [k]: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
    </label>
  );
  return (
    <Card className="space-y-3">
      <div>
        <div className="font-bold text-lg" style={{ color: NAVY }}>Rates</div>
        <p className="text-sm text-slate-500">The lessons' price helper and tree trainer use these. Owners only.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {n("rooflinePerFt", "Roofline $ per foot")}
        {n("perStrand", "Minis $ per strand")}
        {n("pillar", "Pillar $ each")}
        {Object.keys(r.wreath).map((s) => (
          <label key={s} className="block">
            <span className="text-sm font-semibold">{s}" wreath $</span>
            <input inputMode="decimal" value={String(r.wreath[s])} onChange={(e) => setR({ ...r, wreath: { ...r.wreath, [s]: e.target.value as any } })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
          </label>
        ))}
        {n("depositPct", "Deposit %")}
        {n("taxPct", "Sales tax %")}
        {n("cashDiscountPct", "Cash discount %")}
        {n("returningDiscountPct", "Returning customer %")}
        {n("returningBefore", "Returning discount before")}
        {n("passPct", "Pass bar (% off)")}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex items-center gap-3">
        <Btn disabled={busy} onClick={() => run(async () => { setR(await api("/api/training", { method: "POST", json: { action: "rates", rates: r } })); setMsg("Saved."); })}>Save rates</Btn>
        {msg && <span className="text-sm" style={{ color: GREEN }}>{msg}</span>}
      </div>
    </Card>
  );
}
