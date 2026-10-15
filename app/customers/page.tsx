"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";

/* Owners' customer database: every Jobber client and GoHighLevel contact, merged into one row per household. */

type Row = {
  id: string; name: string; aka: string[]; address?: string; phone?: string; email?: string;
  seasons: number[]; total: number; lastAt: number; jobs: number; quotes: number; status: "customer" | "quoted" | "lead"; jobber: boolean; ghl: boolean;
};
type Cur = { done: boolean; count: number };
type State = {
  passStartedAt?: number; passDoneAt?: number; fullAt?: number; since?: string; builtAt?: number; customers?: number;
  jobber: Record<string, Cur>; ghl: Record<string, Cur>; queues?: { messages: number; notes: number }; errors: { jobber?: string; ghl?: string };
};
type Data = { rows: Row[]; found: number; counts: { all: number; customer: number; quoted: number; lead: number }; state: State };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const card = "bg-white rounded-xl border border-slate-200";
const FILTERS = [["all", "All"], ["customer", "Customers"], ["quoted", "Quoted"], ["lead", "Leads"]] as const;

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(100);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await api<Data>(`/api/customers?q=${encodeURIComponent(q)}&status=${status}&limit=${limit}`);
      if (n === seq.current) { setD(r); setErr(""); }
    } catch (e: any) { if (n === seq.current) setErr(e.message); }
  }, [q, status, limit]);
  useEffect(() => { const t = setTimeout(load, q ? 200 : 0); return () => clearTimeout(t); }, [load, q]);

  // While a sync is running, pick up new customers as they arrive.
  const running = !!d && !!d.state.passStartedAt && (!d.state.passDoneAt || d.state.passDoneAt < d.state.passStartedAt);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [running, load]);

  async function syncNow() {
    setBusy(true);
    try { await api("/api/customers", { method: "POST", json: { sync: true } }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Customers</h1>
        <p className="text-sm text-slate-500">Everyone in Jobber and GoHighLevel, one row per household. Tap a customer for every year, photos, texts and notes.</p>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} placeholder="Name, street, phone or email"
          className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-300 text-base" autoFocus />
      </div>

      {d && (
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => { setStatus(k); setLimit(100); }}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border ${status === k ? "text-white border-transparent" : "bg-white border-slate-300 text-slate-700"}`}
              style={status === k ? { background: NAVY } : undefined}>
              {label} {d.counts[k].toLocaleString()}
            </button>
          ))}
        </div>
      )}

      {err && <div className="text-red-600 text-sm">{err}</div>}
      {!d ? <div className="p-6 text-slate-500 flex gap-2"><Loader2 className="animate-spin" /> Loading...</div> : (
        <>
          <SyncLine s={d.state} running={running} busy={busy} onSync={syncNow} />
          {d.rows.length === 0 ? (
            <div className={`${card} p-4 text-sm text-slate-500`}>
              {d.counts.all === 0 ? "No customers yet. The first read of Jobber and GoHighLevel is running; they appear here as they come in." : "Nobody matches that."}
            </div>
          ) : (
            <ul className={`${card} divide-y`}>
              {d.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/customers/${r.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">
                        {r.name}{r.aka.length > 0 && <span className="font-normal text-slate-400"> · also {r.aka.join(", ")}</span>}
                      </div>
                      <div className="text-sm text-slate-500 truncate">{[r.address, r.phone].filter(Boolean).join(" · ") || r.email || "No address or phone"}</div>
                      <div className="text-xs text-slate-400">
                        {r.seasons.length ? `${r.seasons.length} season${r.seasons.length > 1 ? "s" : ""}: ${[...r.seasons].sort().join(", ")}` : r.status === "quoted" ? `${r.quotes} quote${r.quotes > 1 ? "s" : ""}, not sold` : "Lead"}
                      </div>
                    </div>
                    {r.total > 0 && <div className="text-right font-bold" style={{ color: NAVY }}>{money(r.total)}</div>}
                    <ChevronRight size={18} className="text-slate-300 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.found > d.rows.length && (
            <button onClick={() => setLimit(limit + 200)} className="w-full py-3 text-sm font-semibold" style={{ color: NAVY }}>
              Show more ({(d.found - d.rows.length).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SyncLine({ s, running, busy, onSync }: { s: State; running: boolean; busy: boolean; onSync: () => void }) {
  const read = (c?: Cur) => c?.count ?? 0;
  return (
    <div className="text-xs text-slate-500 space-y-1">
      <div className="flex items-center gap-2 justify-between">
        <span>
          {running
            ? `Reading Jobber and GoHighLevel now${s.since ? " (changes only)" : ""}: ${(read(s.jobber.Client) + read(s.jobber.Quote) + read(s.jobber.Job)).toLocaleString()} Jobber records, ${read(s.ghl.contacts).toLocaleString()} contacts${s.queues?.messages || s.queues?.notes ? `, ${((s.queues?.messages ?? 0) + (s.queues?.notes ?? 0)).toLocaleString()} conversations and notes to go` : ""}.`
            : s.passDoneAt ? `Up to date with Jobber and GoHighLevel as of ${ago(s.passDoneAt)}. Refreshes by itself.` : "Not read yet."}
        </span>
        <button onClick={onSync} disabled={busy || running} className="font-semibold flex items-center gap-1 shrink-0 disabled:opacity-50" style={{ color: NAVY }}>
          {busy || running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh now
        </button>
      </div>
      {s.errors.jobber && <div className="text-amber-700">Jobber: {s.errors.jobber}</div>}
      {s.errors.ghl && <div className="text-amber-700">GoHighLevel: {s.errors.ghl}</div>}
    </div>
  );
}
