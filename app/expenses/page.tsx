"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Mail, Plus, RefreshCw, Sheet, Trash2, Upload } from "lucide-react";
import { api, GREEN, NAVY } from "@/components/ui";
import { uploadPhoto } from "@/components/PhotoButton";

/* Owners' Expenses: where the money goes. One total, then buckets biggest first; tap a bucket for every line in it. */

type Line = { id: string; day: string; amount: number; cat: string; vendor: string; what: string; source: string; link?: string; photo?: string; skipped?: boolean; why?: string; auto?: string };
type Data = {
  lines: Line[]; cats: Record<string, string>; sources: Record<string, string>; google: boolean; seasonStart: string;
  email: { lastAt: number; found: number; read: number; error?: string };
  sheet: { url: string; syncedAt: number } | null;
};

const $ = (n: number) => "$" + Math.round(n).toLocaleString();
const $c = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = "bg-white rounded-xl border border-slate-200 p-4";
const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10);
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };

type Period = "month" | "lastMonth" | "season" | "lastSeason" | "all";
function range(p: Period, seasonStart: string): [string, string, string] {
  const t = today(), m = t.slice(0, 7);
  const lastM = addDays(`${m}-01`, -1).slice(0, 7);
  const lastSs = `${+seasonStart.slice(0, 4) - 1}-08-01`;
  const sy = +seasonStart.slice(0, 4);
  switch (p) {
    case "month": return [`${m}-01`, "9999", monthName(m)];
    case "lastMonth": return [`${lastM}-01`, `${m}-01`, monthName(lastM)];
    case "season": return [seasonStart, "9999", `Season ${sy}-${String(sy + 1).slice(2)} (since Aug 1)`];
    case "lastSeason": return [lastSs, seasonStart, `Season ${sy - 1}-${String(sy).slice(2)}`];
    default: return ["0000", "9999", "Everything"];
  }
}
const PERIODS: [Period, string][] = [["month", "This month"], ["lastMonth", "Last month"], ["season", "This season"], ["lastSeason", "Last season"], ["all", "Everything"]];

export default function ExpensesPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState<Period>("season");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<Data>("/api/expenses").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function post(json: any, label: string) {
    setBusy(label); setErr(""); setNote("");
    try { const r = await api<any>("/api/expenses", { method: "POST", json }); await load(); return r; }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  }

  const view = useMemo(() => {
    if (!d) return null;
    const [from, to, label] = range(period, d.seasonStart);
    const inRange = d.lines.filter((l) => l.day >= from && l.day < to);
    const counted = inRange.filter((l) => !l.skipped);
    const total = counted.reduce((t, l) => t + l.amount, 0);
    const byCat = Object.keys(d.cats).map((c) => {
      const lines = counted.filter((l) => l.cat === c);
      return { cat: c, name: d.cats[c], lines, total: lines.reduce((t, l) => t + l.amount, 0) };
    }).filter((c) => c.lines.length).sort((a, b) => b.total - a.total);
    const months = new Map<string, number>();
    for (const l of counted) months.set(l.day.slice(0, 7), (months.get(l.day.slice(0, 7)) ?? 0) + l.amount);
    return { label, total, byCat, count: counted.length, skipped: inRange.filter((l) => l.skipped), months: [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])) };
  }, [d, period]);

  async function bankFile(f: File) {
    const r = await post({ action: "bank", text: await f.text(), name: f.name }, "bank");
    if (r) setNote(`${r.added} new line${r.added === 1 ? "" : "s"} added from ${f.name}${r.read > r.added ? ` (${r.read - r.added} were already in)` : ""}.`);
  }

  if (!d || !view) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;
  const max = view.byCat[0]?.total || 1;
  const maxMonth = Math.max(1, ...view.months.map(([, v]) => v));

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Expenses</h1>
        <p className="text-sm text-slate-500">Owners only. Where the money goes. Tap a bucket to see every expense in it.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map(([p, l]) => (
          <button key={p} onClick={() => { setPeriod(p); setOpen(null); }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${period === p ? "text-white border-transparent" : "bg-white border-slate-300"}`}
            style={period === p ? { background: NAVY } : undefined}>{l}</button>
        ))}
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{err}</div>}
      {note && <div className="rounded-lg bg-green-50 text-green-800 px-3 py-2 text-sm">{note}</div>}

      <div className={card}>
        <div className="text-sm text-slate-500">{view.label}</div>
        <div className="text-4xl font-extrabold" style={{ color: NAVY }}>{$(view.total)}</div>
        <div className="text-sm text-slate-500">spent, {view.count} expense{view.count === 1 ? "" : "s"}</div>

        <div className="mt-4 divide-y">
          {view.byCat.length === 0 && <p className="text-sm text-slate-500 py-2">Nothing yet for this stretch.</p>}
          {view.byCat.map((c) => (
            <div key={c.cat}>
              <button onClick={() => setOpen(open === c.cat ? null : c.cat)} className="w-full text-left py-3 flex items-center gap-3">
                {open === c.cat ? <ChevronDown size={18} className="shrink-0 text-slate-400" /> : <ChevronRight size={18} className="shrink-0 text-slate-400" />}
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between gap-2 font-bold">
                    <span className="truncate">{c.name}</span>
                    <span>{$(c.total)} <span className="text-slate-400 font-semibold text-sm">{view.total ? Math.round((c.total / view.total) * 100) : 0}%</span></span>
                  </span>
                  <span className="block h-2 mt-1 rounded-full bg-slate-100 overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(c.total / max) * 100}%`, background: NAVY }} />
                  </span>
                </span>
              </button>
              {open === c.cat && <Lines lines={c.lines} d={d} post={post} />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => setAdding(!adding)}><Plus size={16} /> Add an expense</button>
        <button className={btn} disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "bank" ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload bank or card file
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) bankFile(f); }} />
        {d.sheet && <a className={btn} href={d.sheet.url} target="_blank" rel="noreferrer"><Sheet size={16} /> Google Sheet <ExternalLink size={14} /></a>}
        {d.google && (
          <button className={btn} disabled={!!busy} onClick={async () => { const r = await post({ action: "sheet" }, "sheet"); if (r?.url) setNote("Google Sheet updated."); }}>
            {busy === "sheet" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {d.sheet ? "Update the sheet" : "Make the Google Sheet"}
          </button>
        )}
        {d.google && (
          <button className={btn} disabled={!!busy} onClick={async () => { const r = await post({ action: "email" }, "email"); if (r) setNote(r.error ? `Email: ${r.error}` : `Read ${r.read} emails, found ${r.found} new receipt${r.found === 1 ? "" : "s"}${r.left ? ". Tap again for older ones." : "."}`); }}>
            {busy === "email" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Check email for receipts
          </button>
        )}
      </div>

      {adding && <AddForm cats={d.cats} onDone={async (line) => { const r = await post({ action: "add", line }, "add"); if (r) setAdding(false); }} busy={busy === "add"} />}

      <details className={card}>
        <summary className="font-bold cursor-pointer" style={{ color: NAVY }}>By month</summary>
        <div className="mt-3 space-y-2">
          {view.months.map(([ym, v]) => (
            <div key={ym} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">{monthName(ym)}</span>
              <span className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(v / maxMonth) * 100}%`, background: NAVY }} /></span>
              <span className="w-20 text-right font-semibold">{$(v)}</span>
            </div>
          ))}
        </div>
      </details>

      {view.skipped.length > 0 && (
        <details className={card}>
          <summary className="font-bold cursor-pointer" style={{ color: NAVY }}>Not counted ({view.skipped.length})</summary>
          <p className="text-sm text-slate-500 mt-1">Lines left out so nothing counts twice, or that you marked not a business expense. Tap Count it to add one back.</p>
          <ul className="mt-2 divide-y text-sm">
            {view.skipped.map((l) => (
              <li key={l.id} className="py-2 flex items-center gap-3">
                <span className="w-14 shrink-0 text-slate-500">{shortDay(l.day)}</span>
                <span className="flex-1 min-w-0"><span className="block truncate font-semibold">{l.vendor}</span><span className="block text-xs text-slate-500 truncate">{l.why}</span></span>
                <span className="font-semibold">{$c(l.amount)}</span>
                <button className="text-xs underline" onClick={() => post({ action: "edit", id: l.id, vendor: l.vendor, skip: false }, "edit")}>Count it</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="text-xs text-slate-500 space-y-1">
        <p>Fills in by itself: crew pay on every install and takedown, crew receipts, review bonuses, yard sign pay, supplier orders on <a className="underline" href="/costs">Costs</a>, Facebook and Google ads, the radio and email deals, insurance (each policy's yearly price split by month), and receipts and invoices in the info@ inbox{d.email.lastAt ? ` (checked ${ago(d.email.lastAt)}, ${d.email.found} found)` : ""}.{d.email.error ? ` Email: ${d.email.error}.` : ""}</p>
        <p>Gas, tolls, cash and anything else paid by card won't show until the card's statement is in: once a month, download it as a CSV from the bank's website and tap <b>Upload bank or card file</b>. Lines already counted from somewhere else are left out on their own.</p>
        {!d.google && <p>Connect Google on the Marketing tab to read receipts from email and keep the Google Sheet.</p>}
        {d.sheet?.syncedAt ? <p>Google Sheet "Light DMV expenses" updated {ago(d.sheet.syncedAt)}.</p> : null}
      </div>
    </div>
  );
}

function Lines({ lines, d, post }: { lines: Line[]; d: Data; post: (json: any, label: string) => Promise<any> }) {
  const [show, setShow] = useState(40);
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <ul className="pb-3 pl-7 divide-y text-sm">
      {lines.slice(0, show).map((l) => (
        <li key={l.id} className="py-2">
          <div className="flex items-start gap-3">
            <span className="w-14 shrink-0 text-slate-500">{shortDay(l.day)}</span>
            {l.photo && <a href={l.photo} target="_blank" rel="noreferrer"><img src={l.photo} alt="" className="w-10 h-10 object-cover rounded" /></a>}
            <button className="flex-1 min-w-0 text-left" onClick={() => setEdit(edit === l.id ? null : l.id)}>
              <span className="block font-semibold truncate">{l.vendor}</span>
              <span className="block text-xs text-slate-500 truncate">{l.what} · {d.sources[l.source]}</span>
            </button>
            <span className="font-semibold whitespace-nowrap">{$c(l.amount)}</span>
          </div>
          {edit === l.id && (
            <div className="mt-2 ml-16 flex flex-wrap items-center gap-2 text-xs">
              {l.link && <a className="underline inline-flex items-center gap-1" href={l.link} target={l.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer">Open <ExternalLink size={12} /></a>}
              <label className="inline-flex items-center gap-1">Move to
                <select className="border rounded px-1 py-0.5" value={l.cat} onChange={(e) => post({ action: "edit", id: l.id, vendor: l.vendor, cat: e.target.value }, "edit")}>
                  {Object.entries(d.cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <button className="underline" onClick={() => post({ action: "edit", id: l.id, vendor: l.vendor, skip: true }, "edit")}>Not a business expense</button>
              {l.source === "manual" && (
                <button className="inline-flex items-center gap-1 text-red-700 underline" onClick={() => post({ action: "remove", id: l.id.replace(/_\d{4}-\d{2}$/, "") }, "remove")}>
                  <Trash2 size={12} /> {/_\d{4}-\d{2}$/.test(l.id) ? "Stop repeating" : "Remove"}
                </button>
              )}
            </div>
          )}
        </li>
      ))}
      {lines.length > show && <li className="py-2"><button className="underline text-sm" onClick={() => setShow(show + 100)}>Show {Math.min(100, lines.length - show)} more</button></li>}
    </ul>
  );
}

function AddForm({ cats, onDone, busy }: { cats: Record<string, string>; onDone: (line: any) => void; busy: boolean }) {
  const [f, setF] = useState({ amount: "", what: "", vendor: "", cat: "", day: today(), monthly: false, photo: "" });
  const [up, setUp] = useState(false);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const inp = "border border-slate-300 rounded-lg px-3 py-2 w-full";
  return (
    <div className={card}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Amount<input className={inp} inputMode="decimal" placeholder="120.00" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></label>
        <label className="text-sm">Date<input className={inp} type="date" value={f.day} onChange={(e) => set("day", e.target.value)} /></label>
        <label className="text-sm col-span-2">What for<input className={inp} placeholder="Van payment, warehouse rent, ladder..." value={f.what} onChange={(e) => set("what", e.target.value)} /></label>
        <label className="text-sm">Paid to (optional)<input className={inp} placeholder="Ford Credit" value={f.vendor} onChange={(e) => set("vendor", e.target.value)} /></label>
        <label className="text-sm">Bucket
          <select className={inp} value={f.cat} onChange={(e) => set("cat", e.target.value)}>
            <option value="">Pick for me</option>
            {Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.monthly} onChange={(e) => set("monthly", e.target.checked)} /> Every month</label>
        <label className="inline-flex items-center gap-2 underline cursor-pointer">
          {up ? <Loader2 size={14} className="animate-spin" /> : null}{f.photo ? "Receipt added" : "Add a receipt photo"}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            setUp(true);
            try { set("photo", await uploadPhoto(file, "expenses/owner")); } catch {} finally { setUp(false); }
          }} />
        </label>
        <button className="ml-auto rounded-lg px-4 py-2 text-white font-bold disabled:opacity-50" style={{ background: GREEN }} disabled={busy || up} onClick={() => onDone(f)}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
