"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleHelp, Clock, ExternalLink, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import type { Sub, SubCoi, SubDoc } from "@/lib/insurance";

/* Per-subcontractor compliance for 1099 workers: hold harmless, their own workers' comp + employer's liability,
   and a liability certificate with limits at least ours, waiver of subrogation and Light DMV as additional insured. */

type Level = "ok" | "soon" | "unknown" | "bad";
const LOOK: Record<Level, { fg: string; bg: string; icon: typeof CircleCheck }> = {
  ok: { fg: "#067647", bg: "#ECFDF3", icon: CircleCheck },
  soon: { fg: "#B54708", bg: "#FFFAEB", icon: Clock },
  unknown: { fg: "#475467", bg: "#F2F4F7", icon: CircleHelp },
  bad: { fg: "#B42318", bg: "#FEF3F2", icon: TriangleAlert },
};
const RANK: Level[] = ["bad", "soon", "unknown", "ok"];
const worst = (ls: Level[]) => RANK.find((r) => ls.includes(r)) ?? "ok";

const DAY = 86_400_000;
const daysTo = (d: string) => Math.round((new Date(`${d}T12:00:00`).getTime() - Date.now()) / DAY);
const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Check = { label: string; level: Level; text: string; url?: string };

function expiry(d: SubDoc, what: string): { level: Level; text: string } {
  if (!d.onFile) return { level: "bad", text: `No ${what} on file` };
  if (!d.expires) return { level: "unknown", text: "On file, no expiry date entered" };
  const n = daysTo(d.expires);
  if (n < 0) return { level: "bad", text: `Expired ${fmt(d.expires)}` };
  if (n <= 30) return { level: "soon", text: `Expires ${fmt(d.expires)} (in ${n} days)` };
  return { level: "ok", text: `Good to ${fmt(d.expires)}${d.carrier ? ` · ${d.carrier}` : ""}` };
}

export type OurLimits = { eachOccurrence?: number; aggregate?: number };

export function checksFor(s: Sub, ours: OurLimits): Check[] {
  const hh: Check = s.holdHarmless.onFile
    ? { label: "Hold harmless", level: s.holdHarmless.expires && daysTo(s.holdHarmless.expires) < 0 ? "bad" : "ok", text: s.holdHarmless.date ? `Signed ${fmt(s.holdHarmless.date)}` : "Signed", url: s.holdHarmless.url }
    : { label: "Hold harmless", level: "bad", text: "Not signed yet" };
  const wc: Check = { label: "Workers' comp + employer's liability", ...expiry(s.workersComp, "workers' comp proof"), url: s.workersComp.url };
  const gl: Check = { label: "Liability certificate", ...expiry(s.gl, "liability certificate"), url: s.gl.url };
  const limits = limitCheck(s.gl, ours);
  const flag = (on: boolean | undefined, label: string): Check =>
    !s.gl.onFile ? { label, level: "unknown", text: "Waiting on the certificate" }
      : on ? { label, level: "ok", text: "Shown on the certificate" } : { label, level: "bad", text: "Not on the certificate" };
  return [hh, wc, gl, limits, flag(s.gl.waiver, "Waiver of subrogation"), flag(s.gl.additionalInsured, "Light DMV as additional insured")];
}

function limitCheck(c: SubCoi, ours: OurLimits): Check {
  const label = "Limits at least ours";
  if (!c.onFile) return { label, level: "unknown", text: "Waiting on the certificate" };
  if (c.eachOccurrence == null || c.aggregate == null) return { label, level: "unknown", text: "Enter the certificate's limits" };
  const short: string[] = [];
  if (ours.eachOccurrence && c.eachOccurrence < ours.eachOccurrence) short.push(`${money(c.eachOccurrence)} per occurrence (we carry ${money(ours.eachOccurrence)})`);
  if (ours.aggregate && c.aggregate < ours.aggregate) short.push(`${money(c.aggregate)} aggregate (we carry ${money(ours.aggregate)})`);
  return short.length ? { label, level: "bad", text: `Too low: ${short.join(", ")}` }
    : { label, level: "ok", text: `${money(c.eachOccurrence)} / ${money(c.aggregate)}` };
}

export function Subcontractors({ ours }: { ours: OurLimits }) {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [editing, setEditing] = useState<Sub | "new" | null>(null);
  useEffect(() => { api<{ subs: Sub[] }>("/api/insurance/subs").then((r) => setSubs(r.subs)).catch(() => setSubs([])); }, []);

  const active = (subs ?? []).filter((s) => s.active);
  const rated = active.map((s) => ({ s, checks: checksFor(s, ours) })).map((x) => ({ ...x, level: worst(x.checks.map((c) => c.level)) }))
    .sort((a, b) => RANK.indexOf(a.level) - RANK.indexOf(b.level) || a.s.name.localeCompare(b.s.name));
  const count = (l: Level) => rated.filter((x) => x.level === l).length;

  return (
    <section id="subs">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Subcontractors (1099 only)</h2>
          <p className="text-sm text-slate-500">
            Before a sub works a job: signed hold harmless, their own workers&apos; comp and employer&apos;s liability, and a
            liability certificate with limits at least ours{ours.eachOccurrence ? ` (${money(ours.eachOccurrence)} / ${money(ours.aggregate ?? 0)})` : ""}, waiver of subrogation and Light DMV as additional insured.
          </p>
        </div>
        <button onClick={() => setEditing("new")} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: NAVY }}>
          <Plus size={16} /> Add
        </button>
      </div>

      {rated.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs font-semibold">
          {count("bad") > 0 && <span className="rounded-full px-3 py-1" style={{ background: LOOK.bad.bg, color: LOOK.bad.fg }}>{count("bad")} can&apos;t work yet</span>}
          {count("soon") > 0 && <span className="rounded-full px-3 py-1" style={{ background: LOOK.soon.bg, color: LOOK.soon.fg }}>{count("soon")} expiring within 30 days</span>}
          {count("unknown") > 0 && <span className="rounded-full px-3 py-1" style={{ background: LOOK.unknown.bg, color: LOOK.unknown.fg }}>{count("unknown")} missing details</span>}
          {count("ok") > 0 && <span className="rounded-full px-3 py-1" style={{ background: LOOK.ok.bg, color: LOOK.ok.fg }}>{count("ok")} cleared</span>}
        </div>
      )}

      {editing && <SubForm sub={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(s) => { setSubs(s); setEditing(null); }} />}

      {subs === null ? <p className="text-sm text-slate-500">Loading…</p>
        : rated.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No subcontractors added yet. Add each 1099 worker and their papers here; anyone missing a document shows in red.
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {rated.map(({ s, checks, level }) => {
              const L = LOOK[level];
              return (
                <div key={s.id} className="bg-white rounded-xl border p-4" style={{ borderColor: L.fg + "55", borderLeftWidth: 5 }}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{s.name}</div>
                      {s.company && <div className="text-sm text-slate-500">{s.company}</div>}
                    </div>
                    <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: L.bg, color: L.fg }}>
                      {level === "ok" ? "Cleared to work" : level === "bad" ? "Can't work yet" : level === "soon" ? "Expiring soon" : "Missing details"}
                    </span>
                    <button aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Pencil size={16} /></button>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {checks.map((c) => {
                      const C = LOOK[c.level];
                      return (
                        <li key={c.label} className="flex gap-2 text-sm">
                          <C.icon size={16} className="shrink-0 mt-0.5" style={{ color: C.fg }} />
                          <span className="min-w-0">
                            <b className="font-semibold">{c.label}</b>
                            <span className="text-slate-500"> · </span>
                            <span style={{ color: c.level === "ok" ? "#475467" : C.fg }}>{c.text}</span>
                            {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle text-slate-400 hover:text-slate-700" aria-label="Open document"><ExternalLink size={13} /></a>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}

const blank = (): Sub => ({
  id: "", name: "", active: true, updatedAt: "",
  holdHarmless: { onFile: false }, workersComp: { onFile: false }, gl: { onFile: false, waiver: false, additionalInsured: false },
});

function SubForm({ sub, onClose, onSaved }: { sub: Sub | null; onClose: () => void; onSaved: (s: Sub[]) => void }) {
  const [f, setF] = useState<Sub>(sub ? structuredClone(sub) : blank());
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<Sub>) => setF({ ...f, ...patch });
  const setDoc = (k: "holdHarmless" | "workersComp" | "gl", patch: Partial<SubCoi>) => setF({ ...f, [k]: { ...f[k], ...patch } });

  async function save() {
    setMsg("Saving…");
    try { onSaved((await api<{ subs: Sub[] }>("/api/insurance/subs", { method: "POST", json: f })).subs); }
    catch (e: any) { setMsg(e.message); }
  }
  async function remove() {
    if (!sub || !confirm(`Remove ${sub.name}?`)) return;
    onSaved((await api<{ subs: Sub[] }>(`/api/insurance/subs?id=${encodeURIComponent(sub.id)}`, { method: "DELETE" })).subs);
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const lab = "text-xs font-semibold text-slate-500";
  return (
    <div className="bg-white rounded-xl border-2 p-4 mb-3 space-y-4" style={{ borderColor: NAVY }}>
      <div className="flex items-center justify-between">
        <div className="font-bold">{sub ? `Edit ${sub.name}` : "Add a subcontractor"}</div>
        <button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <label><span className={lab}>Name</span><input className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label><span className={lab}>Company (if any)</span><input className={input} value={f.company ?? ""} onChange={(e) => set({ company: e.target.value })} /></label>
        <label><span className={lab}>Phone</span><input className={input} value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></label>
        <label><span className={lab}>Email</span><input className={input} value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></label>
      </div>

      <DocFields title="Hold harmless agreement" d={f.holdHarmless} onChange={(p) => setDoc("holdHarmless", p)} dateLabel="Signed on" noCarrier />
      <DocFields title="Workers' comp + employer's liability" d={f.workersComp} onChange={(p) => setDoc("workersComp", p)} />
      <DocFields title="Liability certificate" d={f.gl} onChange={(p) => setDoc("gl", p)}>
        <div className="grid grid-cols-2 gap-2">
          <label><span className={lab}>Each occurrence ($)</span><input className={input} inputMode="numeric" value={f.gl.eachOccurrence ?? ""} onChange={(e) => setDoc("gl", { eachOccurrence: e.target.value === "" ? undefined : Number(e.target.value.replace(/\D/g, "")) })} /></label>
          <label><span className={lab}>General aggregate ($)</span><input className={input} inputMode="numeric" value={f.gl.aggregate ?? ""} onChange={(e) => setDoc("gl", { aggregate: e.target.value === "" ? undefined : Number(e.target.value.replace(/\D/g, "")) })} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.gl.waiver} onChange={(e) => setDoc("gl", { waiver: e.target.checked })} /> Waiver of subrogation shown</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.gl.additionalInsured} onChange={(e) => setDoc("gl", { additionalInsured: e.target.checked })} /> Light DMV listed as additional insured</label>
      </DocFields>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Still working with us</label>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: NAVY }}>Save</button>
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold border border-slate-300">Cancel</button>
        {sub && <button onClick={remove} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-red-700"><Trash2 size={15} /> Remove</button>}
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </div>
  );
}

function DocFields({ title, d, onChange, dateLabel, noCarrier, children }: {
  title: string; d: SubDoc; onChange: (p: Partial<SubDoc>) => void; dateLabel?: string; noCarrier?: boolean; children?: React.ReactNode;
}) {
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const lab = "text-xs font-semibold text-slate-500";
  return (
    <fieldset className="rounded-lg border border-slate-200 p-3 space-y-2">
      <label className="flex items-center gap-2 font-semibold text-sm">
        <input type="checkbox" checked={d.onFile} onChange={(e) => onChange({ onFile: e.target.checked })} /> {title} on file
      </label>
      {d.onFile && (
        <>
          <div className="grid sm:grid-cols-3 gap-2">
            {dateLabel
              ? <label><span className={lab}>{dateLabel}</span><input type="date" className={input} value={d.date ?? ""} onChange={(e) => onChange({ date: e.target.value || undefined })} /></label>
              : <label><span className={lab}>Expires</span><input type="date" className={input} value={d.expires ?? ""} onChange={(e) => onChange({ expires: e.target.value || undefined })} /></label>}
            {!noCarrier && <label><span className={lab}>Insurance company</span><input className={input} value={d.carrier ?? ""} onChange={(e) => onChange({ carrier: e.target.value })} /></label>}
            <label className={noCarrier ? "sm:col-span-2" : ""}><span className={lab}>Link (Google Drive)</span><input className={input} value={d.url ?? ""} placeholder="https://drive.google.com/…" onChange={(e) => onChange({ url: e.target.value })} /></label>
          </div>
          {children}
        </>
      )}
    </fieldset>
  );
}
