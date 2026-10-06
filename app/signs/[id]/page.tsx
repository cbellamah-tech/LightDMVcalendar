"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, MapPin, Navigation, Play, Square, X } from "lucide-react";
import PhotoButton from "@/components/PhotoButton";
import { ago, api, NAVY } from "@/components/ui";
import { distanceM, fmtDist, mapsLink } from "@/lib/geo";
import { SignsData, Stop, STATUS_COLOR, STATUS_LABEL, Visit } from "../types";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });

type Pos = { lat: number; lng: number; accuracyM: number; at: number };
const PING_MS = 30_000;

export default function RoutePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SignsData | null>(null);
  const [err, setErr] = useState("");
  const [runStart, setRunStart] = useState<number | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [gpsErr, setGpsErr] = useState("");
  const [sheet, setSheet] = useState<{ stop: Stop; auto: boolean } | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
  const lastPing = useRef(0);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const runKey = `ldmv-run-${params.id}`;

  const load = useCallback(() => api<SignsData>("/api/signs").then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
    try { const v = localStorage.getItem(runKey); if (v) setRunStart(Number(v)); } catch {}
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load, runKey]);

  const route = data?.routes.find((r) => r.id === params.id);
  const lastVisit = data?.lastVisit || {};
  const doneInRun = useCallback((s: Stop) => !!runStart && (lastVisit[s.id]?.at || 0) >= runStart, [runStart, lastVisit]);
  // Next stop: the first one not yet logged after the last stop logged on this run, so a crew can start mid-route.
  const nextStop = useMemo(() => {
    if (!route) return undefined;
    const done = route.stops.filter(doneInRun);
    const lastDone = done.sort((a, b) => (lastVisit[b.id]?.at || 0) - (lastVisit[a.id]?.at || 0))[0];
    const after = lastDone ? route.stops.find((s) => s.order > lastDone.order && !doneInRun(s)) : undefined;
    return after || route.stops.find((s) => !doneInRun(s));
  }, [route, doneInRun, lastVisit]);
  const doneCount = route ? route.stops.filter(doneInRun).length : 0;
  const running = !!runStart;

  // GPS watch while a route is running.
  useEffect(() => {
    if (!running || !route) return;
    if (!("geolocation" in navigator)) { setGpsErr("This phone's browser doesn't share location."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: Date.now() };
        setPos(here);
        setGpsErr("");
        if (Date.now() - lastPing.current > PING_MS) {
          lastPing.current = Date.now();
          api("/api/signs/ping", { method: "POST", json: { ...here, routeId: route.id } }).catch(() => {});
        }
        if (sheetRef.current || here.accuracyM > 100) return;
        // Arrival: the closest stop not yet done on this run, inside its radius (allowing some GPS wobble).
        const candidates = route.stops.filter((s) => !doneInRunRef.current(s) && !dismissed.current.has(s.id));
        let best: { s: Stop; d: number } | null = null;
        for (const s of candidates) {
          const d = distanceM(here, s);
          if (!best || d < best.d) best = { s, d };
        }
        if (best && best.d <= best.s.radiusM + Math.min(here.accuracyM, 40)) {
          navigator.vibrate?.([200, 100, 200]);
          setSheet({ stop: best.s, auto: true });
        }
      },
      (e) => setGpsErr(e.code === 1 ? "Location is blocked. Allow location for this site in your phone settings." : "Waiting for GPS..."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [running, route?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const doneInRunRef = useRef(doneInRun);
  doneInRunRef.current = doneInRun;

  // Keep the screen awake while driving the route.
  useEffect(() => {
    if (!running) return;
    let lock: any = null;
    const get = () => (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release?.(); };
  }, [running]);

  function start() {
    const t = Date.now();
    try { localStorage.setItem(runKey, String(t)); } catch {}
    dismissed.current.clear();
    setRunStart(t);
  }
  function finish() {
    try { localStorage.removeItem(runKey); } catch {}
    setRunStart(null);
    setPos(null);
  }

  const points = useMemo(() => (route?.stops || []).map((s) => {
    const v = lastVisit[s.id];
    const fresh = doneInRun(s);
    return {
      id: s.id, lat: s.lat, lng: s.lng, radiusM: running ? s.radiusM : undefined, big: s.id === nextStop?.id,
      color: running ? (fresh ? STATUS_COLOR[v!.status] : s.id === nextStop?.id ? NAVY : STATUS_COLOR.none) : STATUS_COLOR[v?.status || "none"],
      label: `#${s.order} ${s.name}`,
    };
  }), [route, lastVisit, running, nextStop?.id, doneInRun]);

  if (!data) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading route...</>}</div>;
  if (!route) return <div className="p-6">Route not found. <Link className="underline" href="/signs">Back to routes</Link></div>;

  const distNext = pos && nextStop ? distanceM(pos, nextStop) : null;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <Link href="/signs" className="text-sm text-slate-500 flex items-center gap-1"><ArrowLeft size={16} /> All routes</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-400">{route.id} · {route.stops.length} stops</div>
          <h1 className="text-xl font-extrabold" style={{ color: NAVY }}>{route.name}</h1>
        </div>
        {running ? (
          <button onClick={finish} className="rounded-lg px-3 py-2 font-semibold border border-slate-300 flex items-center gap-1 text-sm"><Square size={14} /> Finish</button>
        ) : (
          <button onClick={start} className="rounded-lg px-4 py-2.5 font-bold text-white flex items-center gap-2" style={{ background: "#1F9D55" }}><Play size={16} /> Start route</button>
        )}
      </div>

      {running && (
        <div className="bg-white rounded-xl border-2 p-4 space-y-2" style={{ borderColor: NAVY }}>
          <div className="text-sm text-slate-500">{doneCount} of {route.stops.length} done on this run · started {ago(runStart!)}</div>
          {nextStop ? (
            <>
              <div className="text-xs font-bold uppercase text-slate-400">Next stop #{nextStop.order}</div>
              <div className="text-lg font-bold">{nextStop.name}</div>
              {nextStop.near && <div className="text-sm text-slate-500">Near {nextStop.near} ({nextStop.type})</div>}
              {nextStop.notes && <div className="text-sm bg-amber-50 text-amber-900 rounded-lg p-2">{nextStop.notes}</div>}
              <div className="text-sm">{distNext != null ? <>About <b>{fmtDist(distNext)}</b> away. The photo prompt opens within {nextStop.radiusM} m.</> : gpsErr || "Finding your location..."}</div>
              <div className="flex gap-2">
                <a href={mapsLink(nextStop.lat, nextStop.lng)} target="_blank" rel="noreferrer" className="flex-1 rounded-lg py-2.5 font-semibold text-white flex justify-center items-center gap-2" style={{ background: NAVY }}>
                  <Navigation size={16} /> Navigate
                </a>
                <button onClick={() => setSheet({ stop: nextStop, auto: false })} className="flex-1 rounded-lg py-2.5 font-semibold border border-slate-300 flex justify-center items-center gap-2">
                  <MapPin size={16} /> I'm here
                </button>
              </div>
            </>
          ) : (
            <div className="font-bold text-green-700 flex items-center gap-2"><Check /> Every stop on this route is logged. Tap Finish.</div>
          )}
          {gpsErr && distNext != null && <div className="text-xs text-amber-700">{gpsErr}</div>}
          <p className="text-xs text-slate-400">Keep this screen open while driving. Phones stop sharing location when the app is closed.</p>
        </div>
      )}

      <SignMap points={points} me={pos} line={route.stops.map((s) => [s.lat, s.lng])} height={300} onPick={(id) => {
        const s = route.stops.find((x) => x.id === id);
        if (s) setSheet({ stop: s, auto: false });
      }} />

      <ol className="bg-white rounded-xl border border-slate-200 divide-y">
        {route.stops.map((s) => {
          const v = lastVisit[s.id];
          return (
            <li key={s.id}>
              <button className="w-full text-left p-3 flex gap-3 items-center" onClick={() => setSheet({ stop: s, auto: false })}>
                <span className="w-7 h-7 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={{ background: running && doneInRun(s) ? STATUS_COLOR[v!.status] : !running && v ? STATUS_COLOR[v.status] : "#94A3B8" }}>{s.order}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{s.name}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {s.type}{s.near ? ` · ${s.near}` : ""}{v ? ` · ${STATUS_LABEL[v.status]} by ${v.byName} ${ago(v.at)}` : ""}
                  </span>
                </span>
                {v?.photoUrl && <img src={v.photoUrl} alt="" className="w-12 h-12 object-cover rounded-md" />}
              </button>
            </li>
          );
        })}
      </ol>

      {sheet && (
        <VisitSheet stop={sheet.stop} auto={sheet.auto} pos={pos} last={lastVisit[sheet.stop.id]}
          onClose={() => { dismissed.current.add(sheet.stop.id); setSheet(null); }}
          onSaved={() => { dismissed.current.add(sheet.stop.id); setSheet(null); load(); }} />
      )}
    </div>
  );
}

function VisitSheet({ stop, auto, pos, last, onClose, onSaved }: {
  stop: Stop; auto: boolean; pos: Pos | null; last?: Visit; onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState<Visit["status"]>(last && last.status !== "skipped" ? "still_there" : "placed");
  const [photo, setPhoto] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needPhoto = stop.photoRequired && status !== "skipped";
  const dist = pos ? distanceM(pos, stop) : null;

  async function save() {
    setBusy(true); setErr("");
    try {
      await api("/api/signs/visit", { method: "POST", json: { stopId: stop.id, status, photoUrl: photo || undefined, note, ...(pos || {}) } });
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex justify-between items-start gap-2">
          <div>
            {auto && <div className="text-xs font-bold uppercase text-green-700">You've arrived</div>}
            <div className="text-lg font-bold">#{stop.order} {stop.name}</div>
            <div className="text-sm text-slate-500">{stop.type}{stop.near ? ` · near ${stop.near}` : ""}{dist != null ? ` · ${fmtDist(dist)} from you` : ""}</div>
          </div>
          <button onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {stop.notes && <div className="text-sm bg-amber-50 text-amber-900 rounded-lg p-2">{stop.notes}</div>}
        <div className="grid grid-cols-2 gap-2">
          {(["placed", "still_there", "replaced", "skipped"] as const).map((k) => (
            <button key={k} onClick={() => setStatus(k)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold border-2 ${status === k ? "text-white" : "bg-white"}`}
              style={{ borderColor: STATUS_COLOR[k], background: status === k ? STATUS_COLOR[k] : undefined }}>
              {STATUS_LABEL[k]}
            </button>
          ))}
        </div>
        {photo ? (
          <div className="relative">
            <img src={photo} alt="Sign" className="w-full max-h-64 object-cover rounded-lg" />
            <button onClick={() => setPhoto("")} className="absolute top-2 right-2 bg-white/90 rounded-full p-1" aria-label="Remove photo"><X size={16} /></button>
          </div>
        ) : (
          <PhotoButton folder={`signs/${stop.id}`} multiple={false} label={needPhoto ? "Take sign photo (required)" : "Take sign photo"} className="w-full py-3"
            onUploaded={(urls) => setPhoto(urls[0])} />
        )}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder={status === "skipped" ? "Why couldn't you place it?" : "Note (optional)"}
          className="w-full border border-slate-300 rounded-lg p-2 text-sm" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || (needPhoto && !photo) || (status === "skipped" && !note.trim())} onClick={save}
          className="w-full rounded-lg py-3 font-bold text-white disabled:opacity-40 flex justify-center gap-2" style={{ background: "#1F9D55" }}>
          {busy && <Loader2 className="animate-spin" size={20} />} Save stop
        </button>
      </div>
    </div>
  );
}
