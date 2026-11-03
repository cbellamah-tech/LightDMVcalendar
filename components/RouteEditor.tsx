"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Route, RotateCcw } from "lucide-react";
import { api, NAVY } from "./ui";

type S = { jobId: string; n: number; kind: string; status: "done" | "here" | "next" | "later"; client: string; address: string; onMap: boolean; etaFrom?: number; etaTo?: number };
type V = { crew: string; lead: string; custom: boolean; by?: string; stops: S[] };

const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const locked = (s: S) => s.status === "done" || s.status === "here";

/* Today's stops in the order the crew will drive them. Arrows move a stop; "Shortest drive" puts the homes still to do
   in the order with the least driving from where the van is. Homes done or on site stay where they are. The office map,
   the crew's Today list and every customer's ETA follow whatever order is saved here. */
export default function RouteEditor({ crew, onChange }: { crew?: string; onChange?: () => void }) {
  const [v, setV] = useState<V | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const q = crew ? `?crew=${encodeURIComponent(crew)}` : "";
  useEffect(() => { api<V>(`/api/jobs/route-order${q}`).then(setV).catch((e) => setErr(e.message)); }, [q]);

  const save = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try { setV(await api<V>("/api/jobs/route-order", { method: "POST", json: { crew, ...body } })); onChange?.(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }, [crew, onChange]);

  if (!v) return <div className="text-sm text-slate-500 flex gap-2 p-2">{err || <><Loader2 className="animate-spin" size={16} /> Loading the route...</>}</div>;
  if (!v.stops.length) return <p className="text-sm text-slate-500 p-2">No stops today.</p>;

  const move = (i: number, d: -1 | 1) => {
    const ids = v.stops.map((s) => s.jobId);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setV({ ...v, stops: ids.map((id) => v.stops.find((s) => s.jobId === id)!) }); // move right away; ETAs come back with the save
    save({ order: ids });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <button disabled={busy} onClick={() => save({ best: true })} className="rounded-lg px-3 py-2 text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: NAVY }}>
          <Route size={15} /> Shortest drive
        </button>
        {v.custom && (
          <button disabled={busy} onClick={() => save({ reset: true })} className="rounded-lg px-3 py-2 text-sm font-semibold border border-slate-300 bg-white flex items-center gap-1.5 disabled:opacity-50">
            <RotateCcw size={15} /> Back to Jobber's order
          </button>
        )}
        {busy && <Loader2 className="animate-spin text-slate-400 self-center" size={16} />}
      </div>
      <p className="text-xs text-slate-500">{v.custom ? `Order changed by ${v.by}. ` : "Jobber's order. "}Customers' ETAs follow this order.</p>
      <ol className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {v.stops.map((s, i) => {
          const up = i > 0 && !locked(s) && !locked(v.stops[i - 1]);
          const down = i < v.stops.length - 1 && !locked(s) && !locked(v.stops[i + 1]);
          return (
            <li key={s.jobId} className={`flex items-center gap-2 px-3 py-2 ${s.status === "done" ? "opacity-50" : ""}`}>
              <span className="w-6 h-6 rounded-full text-white text-[11px] font-bold grid place-items-center shrink-0"
                style={{ background: s.status === "done" ? "#1F9D55" : s.status === "here" ? "#F5A524" : NAVY }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{s.client || s.address}</div>
                <div className="text-xs text-slate-500 truncate">
                  {s.status === "done" ? "Done" : s.status === "here" ? "On site now" : s.etaFrom && s.etaTo ? `ETA ${clock(s.etaFrom)} to ${clock(s.etaTo)}` : ""}
                  {s.onMap ? "" : " · not on the map yet"}
                </div>
              </div>
              <button aria-label="Move up" disabled={!up || busy} onClick={() => move(i, -1)} className="p-2 rounded-lg border border-slate-200 disabled:opacity-25"><ArrowUp size={16} /></button>
              <button aria-label="Move down" disabled={!down || busy} onClick={() => move(i, 1)} className="p-2 rounded-lg border border-slate-200 disabled:opacity-25"><ArrowDown size={16} /></button>
            </li>
          );
        })}
      </ol>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
