"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, LocateFixed, Navigation, Upload } from "lucide-react";
import { distanceM, fmtDist, mapsLink } from "@/lib/geo";
import AddSignButton from "./AddSignButton";
import MyPay from "./MyPay";
import SignPay from "./SignPay";
import VisitSheet from "./VisitSheet";
import { arrived, useGps } from "./useGps";
import { ago, api, NAVY } from "@/components/ui";
import { CREW_LABEL, NearStop, SignsData, Stop, STATUS_COLOR, STATUS_LABEL, Visit } from "./types";
import { useRouter } from "next/navigation";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });

export default function SignsPage() {
  const [data, setData] = useState<SignsData | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [gpsOn, setGpsOn] = useState(false);
  const { pos, err: gpsErr } = useGps(gpsOn);
  const [sheet, setSheet] = useState<{ stop: Stop; auto: boolean } | null>(null);
  const [added, setAdded] = useState("");
  const [q, setQ] = useState("");
  const [payBump, setPayBump] = useState(0);
  const dismissed = useRef<Set<string>>(new Set());
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  // GPS mode is remembered on this phone, so crews only turn it on once.
  // The sign placer gets GPS on by default; he can still turn it off.
  useEffect(() => { try { if (localStorage.getItem("ldmv-gps") === "on") setGpsOn(true); } catch {} }, []);
  const placer = data?.me.role === "signs";
  useEffect(() => {
    if (!placer) return;
    try { if (localStorage.getItem("ldmv-gps") !== "off") setGpsOn(true); } catch { setGpsOn(true); }
  }, [placer]);
  function toggleGps(on: boolean) {
    setGpsOn(on);
    try { localStorage.setItem("ldmv-gps", on ? "on" : "off"); } catch {}
  }

  // Spots near the phone, fetched from the server (there are thousands) when the truck has moved.
  const [near, setNear] = useState<{ stops: NearStop[]; lastVisit: Record<string, Visit> } | null>(null);
  const nearFrom = useRef<{ lat: number; lng: number; at: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const f = nearFrom.current;
    if (f && distanceM(f, pos) < 300 && Date.now() - f.at < 60_000) return;
    nearFrom.current = { lat: pos.lat, lng: pos.lng, at: Date.now() };
    api(`/api/signs/near?lat=${pos.lat}&lng=${pos.lng}`).then(setNear).catch(() => {});
  }, [pos]);
  const nearest = useMemo(() => {
    if (!pos || !near) return null;
    let best: { stop: Stop; routeName: string; d: number } | null = null;
    for (const st of near.stops) {
      const d = distanceM(pos, st);
      if (!best || d < best.d) best = { stop: st, routeName: st.routeName, d };
    }
    return best;
  }, [pos, near]);

  // Arriving at a spot opens the photo prompt, unless it was logged in the last 12 hours.
  useEffect(() => {
    if (!nearest || !pos || !near || sheetRef.current || dismissed.current.has(nearest.stop.id)) return;
    const last = near.lastVisit[nearest.stop.id];
    if (last && Date.now() - last.at < 12 * 3600_000) return;
    if (arrived(nearest.d, nearest.stop.radiusM, pos.accuracyM)) {
      navigator.vibrate?.([200, 100, 200]);
      setSheet({ stop: nearest.stop, auto: true });
    }
  }, [nearest, pos, near]);

  const load = useCallback(() => api<SignsData>("/api/signs").then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  // One marker per route (its center), sized up for the best-ranked areas; tap to open the route.
  const router = useRouter();
  const points = useMemo(() => {
    if (!data) return [];
    const routes = data.routes.map((r) => ({
      id: r.id, lat: r.lat, lng: r.lng, big: (r.rank ?? 99) <= 10,
      color: r.visited ? (r.visited >= r.stops ? STATUS_COLOR.placed : "#D97706") : NAVY,
      label: `${r.rank ? `#${r.rank} ` : ""}${r.name} · ${r.visited}/${r.stops} signs`,
    }));
    // A pin is where the phone last shared GPS. Older than 10 minutes means the app is closed or the phone is locked.
    const crews = data.live.filter((p) => p.uid !== data.me.uid).map((p) => {
      const fresh = Date.now() - p.at < 10 * 60_000;
      return {
        id: `live-${p.uid}`, lat: p.lat, lng: p.lng, color: fresh ? "#2563EB" : "#94A3B8", big: true, radiusM: fresh && p.accuracyM ? p.accuracyM : undefined,
        label: `${p.name}: ${fresh ? "live" : "last seen"} ${ago(p.at)}${p.accuracyM ? ` (±${Math.round(p.accuracyM)} m)` : ""}`,
      };
    });
    const spots = (near?.stops || []).map((st) => ({
      id: `near-${st.id}`, lat: st.lat, lng: st.lng, color: STATUS_COLOR[near!.lastVisit[st.id]?.status || "none"], label: `${st.name} (${st.routeName})`,
    }));
    return [...routes, ...spots, ...crews];
  }, [data, near]);

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
            {data.routes.length} routes, {data.routes.reduce((n, r) => n + r.stops, 0)} spots, best areas first
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

      {placer && <MyPay bump={payBump} />}
      {data.me.role === "owner" && <SignPay />}
      {placer && (
        <p className="text-sm text-slate-600">
          Pick a route below (closest first when GPS is on), tap <b>Open</b>, then <b>Start in this order</b>. Each spot needs a photo; tap <b>Add sign location</b> for a spot that isn't on the list.
        </p>
      )}

      <div className="bg-white rounded-xl border-2 p-4 space-y-3" style={{ borderColor: gpsOn ? "#1F9D55" : "#E2E8F0" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold"><LocateFixed size={18} className={gpsOn ? "text-green-700" : "text-slate-400"} /> GPS {gpsOn ? "on" : "off"}</div>
          <button onClick={() => toggleGps(!gpsOn)} className="rounded-lg px-4 py-2 font-semibold text-sm text-white" style={{ background: gpsOn ? "#64748B" : "#1F9D55" }}>
            {gpsOn ? "Turn off" : "Turn on GPS"}
          </button>
        </div>
        {!gpsOn ? (
          <p className="text-sm text-slate-500">Turn on GPS and keep this page open while driving. When you pull up to any sign spot, it asks for a picture on its own.</p>
        ) : (
          <>
            {gpsErr && <p className="text-sm text-amber-700">{gpsErr}</p>}
            {nearest && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 font-bold uppercase">Nearest sign spot · {fmtDist(nearest.d)}</div>
                  <div className="font-semibold truncate">{nearest.stop.name}</div>
                  <div className="text-xs text-slate-500 truncate">{nearest.routeName}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a href={mapsLink(nearest.stop.lat, nearest.stop.lng)} target="_blank" rel="noreferrer" className="rounded-lg p-2 border border-slate-300" aria-label="Navigate"><Navigation size={18} /></a>
                  <button onClick={() => setSheet({ stop: nearest.stop, auto: false })} className="rounded-lg px-3 py-2 border border-slate-300 text-sm font-semibold">I'm here</button>
                </div>
              </div>
            )}
            <AddSignButton pos={pos} className="w-full" onAdded={(m) => { setAdded(m); load(); nearFrom.current = null; setPayBump((n) => n + 1); }} />
            {added && <p className="text-sm text-green-700">{added}</p>}
          </>
        )}
      </div>

      {data.office && data.live.length > 0 && (
        <div className="text-sm text-slate-600 space-y-0.5">
          {data.live.filter((p) => p.uid !== data.me.uid).map((p) => {
            const fresh = Date.now() - p.at < 10 * 60_000;
            return (
              <div key={p.uid}>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: fresh ? "#2563EB" : "#94A3B8" }} />
                <b>{p.name}</b> {fresh ? `is live on the map (updated ${ago(p.at)})` : `last shared GPS ${ago(p.at)}. The pin stays where he was until he opens the app again.`}
              </div>
            );
          })}
        </div>
      )}

      <SignMap points={points} me={pos} height={380} fitKey={String(data.routes.length)}
        onPick={(id) => { if (data.routes.some((r) => r.id === id)) router.push(`/signs/${id}`); }} />

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${data.routes.length} routes by area`}
        className="w-full border border-slate-300 rounded-lg px-3 py-2" />

      <div className="grid md:grid-cols-2 gap-3">
        {data.routes.filter((r) => !q.trim() || `${r.name} ${r.id} ${r.state || ""}`.toLowerCase().includes(q.trim().toLowerCase()))
          .map((r) => ({ ...r, away: pos ? distanceM(pos, r) : undefined }))
          .sort((a, b) => (placer && a.away != null && b.away != null ? a.away - b.away : 0))
          .map((r) => {
          const visited = r.visited;
          const last = r.lastAt;
          return (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-400">{r.rank ? `#${r.rank} · ` : ""}{r.id}{r.state ? ` · ${r.state}` : ""} · {r.groups ? `${r.groups} groups` : ""}</div>
                  <div className="font-bold">{r.name}</div>
                  <div className="text-sm text-slate-500">{visited}/{r.stops} spots done{last ? ` · last stop ${ago(last)}` : ""}{r.away != null ? ` · ${fmtDist(r.away)} away` : ""}</div>
                </div>
                <Link href={`/signs/${r.id}`} className="shrink-0 rounded-lg px-3 py-2 text-white font-semibold text-sm flex items-center" style={{ background: NAVY }}>
                  Open <ChevronRight size={16} />
                </Link>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-600" style={{ width: `${(visited / Math.max(1, r.stops)) * 100}%` }} />
              </div>
              {data.office ? (
                <select className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                  value={r.assignedUser ? `user:${r.assignedUser}` : r.assignedCrew ? `crew:${r.assignedCrew}` : ""}
                  onChange={(e) => assign(r.id, e.target.value)}>
                  <option value="">Not assigned (any crew can run it)</option>
                  {Object.entries(CREW_LABEL).map(([k, v]) => <option key={k} value={`crew:${k}`}>{v}</option>)}
                  {(data.placers || []).map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                </select>
              ) : (
                <div className="text-xs text-slate-500">{r.assignedCrew ? CREW_LABEL[r.assignedCrew] : r.assignedUser ? "Assigned to you" : "Open route"}</div>
              )}
            </div>
          );
        })}
      </div>

      {sheet && (
        <VisitSheet stop={sheet.stop} auto={sheet.auto} pos={pos} last={near?.lastVisit[sheet.stop.id]}
          routeName={data.routes.find((r) => r.id === sheet.stop.routeId)?.name}
          onClose={() => { dismissed.current.add(sheet.stop.id); setSheet(null); }}
          onSaved={() => { dismissed.current.add(sheet.stop.id); setSheet(null); load(); nearFrom.current = null; setPayBump((n) => n + 1); }} />
      )}

      {data.office && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <h2 className="font-bold">Update the stop list</h2>
          <p className="text-sm text-slate-500">
            Upload a CSV with columns route_id, route_name, stop_order, stop_id, name, lat, lng, type, near, near_m, homes_nearby,
            state, photo_required, arrival_radius_m, notes, and optionally cluster to split a route into groups. Importing again is safe: crew assignments, sign photos and spots crews added in the field all stay.
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
