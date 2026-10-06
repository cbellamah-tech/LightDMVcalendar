"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, Upload } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { CREW_LABEL, SignsData, STATUS_COLOR, STATUS_LABEL } from "./types";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });

export default function SignsPage() {
  const [data, setData] = useState<SignsData | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<SignsData>("/api/signs").then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const points = useMemo(() => {
    if (!data) return [];
    const stops = data.routes.flatMap((r) => r.stops.map((s) => {
      const v = data.lastVisit[s.id];
      return {
        id: s.id, lat: s.lat, lng: s.lng, color: STATUS_COLOR[v?.status || "none"],
        label: `${r.id} #${s.order}: ${s.name}`,
        popup: `<b>${s.name}</b><br/>${r.name}<br/>${STATUS_LABEL[v?.status || "none"]}${v ? ` by ${v.byName}, ${ago(v.at)}` : ""}`,
      };
    }));
    const crews = data.live.map((p) => ({
      id: `live-${p.uid}`, lat: p.lat, lng: p.lng, color: "#2563EB", big: true,
      label: `${p.name} (${ago(p.at)})`,
    }));
    return [...stops, ...crews];
  }, [data]);

  async function assign(routeId: string, value: string) {
    const [kind, id] = value.split(":");
    await api("/api/signs/assign", { method: "POST", json: { routeId, crew: kind === "crew" ? id : undefined, user: kind === "user" ? id : undefined } });
    load();
  }

  async function importCsv(csv?: string, filename?: string) {
    setBusy(true); setMsg(""); setErr("");
    try {
      const m = await api("/api/signs/import", { method: "POST", json: { csv, filename } });
      setMsg(`Imported ${m.routes} routes and ${m.stops} stops. Visit history and crew assignments were kept.`);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!data) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading routes...</>}</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Yard sign routes</h1>
          <p className="text-sm text-slate-500">
            {data.routes.length} routes, {data.routes.reduce((n, r) => n + r.stops.length, 0)} stops
            {data.meta && <> · stops from {data.meta.source}, imported {ago(data.meta.importedAt)}</>}
          </p>
        </div>
        <div className="flex gap-3 text-xs flex-wrap">
          {["none", "placed", "replaced", "skipped"].map((k) => (
            <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLOR[k] }} />{STATUS_LABEL[k]}</span>
          ))}
          {data.office && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600" />Crew live location</span>}
        </div>
      </div>

      <SignMap points={points} height={380} fitKey={data.routes.map((r) => r.id).join(",")} />

      <div className="grid md:grid-cols-2 gap-3">
        {data.routes.map((r) => {
          const visited = r.stops.filter((s) => data.lastVisit[s.id] && data.lastVisit[s.id].status !== "skipped").length;
          const last = r.stops.map((s) => data.lastVisit[s.id]?.at || 0).reduce((a, b) => Math.max(a, b), 0);
          return (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-400">{r.id} · {r.state}</div>
                  <div className="font-bold">{r.name}</div>
                  <div className="text-sm text-slate-500">{visited}/{r.stops.length} signs out{last ? ` · last stop ${ago(last)}` : ""}</div>
                </div>
                <Link href={`/signs/${r.id}`} className="shrink-0 rounded-lg px-3 py-2 text-white font-semibold text-sm flex items-center" style={{ background: NAVY }}>
                  Open <ChevronRight size={16} />
                </Link>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-600" style={{ width: `${(visited / Math.max(1, r.stops.length)) * 100}%` }} />
              </div>
              {data.office ? (
                <select className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                  value={r.assignedUser ? `user:${r.assignedUser}` : r.assignedCrew ? `crew:${r.assignedCrew}` : ""}
                  onChange={(e) => assign(r.id, e.target.value)}>
                  <option value="">Not assigned (any crew can run it)</option>
                  {Object.entries(CREW_LABEL).map(([k, v]) => <option key={k} value={`crew:${k}`}>{v}</option>)}
                </select>
              ) : (
                <div className="text-xs text-slate-500">{r.assignedCrew ? CREW_LABEL[r.assignedCrew] : r.assignedUser ? "Assigned to you" : "Open route"}</div>
              )}
            </div>
          );
        })}
      </div>

      {data.office && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <h2 className="font-bold">Update the stop list</h2>
          <p className="text-sm text-slate-500">
            Upload a CSV with columns route_id, route_name, stop_order, stop_id, name, lat, lng, type, near, near_m, homes_nearby,
            state, photo_required, arrival_radius_m, notes. Importing again is safe: crew assignments and sign photos stay, matched by stop id.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-lg px-3 py-2 text-white font-semibold text-sm flex items-center gap-2" style={{ background: NAVY }}>
              <Upload size={16} /> Upload CSV
            </button>
            <button disabled={busy} onClick={() => importCsv()} className="rounded-lg px-3 py-2 font-semibold text-sm border border-slate-300">
              Re-import the bundled draft
            </button>
            {busy && <Loader2 className="animate-spin" />}
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importCsv(await f.text(), f.name);
          }} />
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
