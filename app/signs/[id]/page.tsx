"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, MapPin, Navigation, Play, Square, X } from "lucide-react";
import AddSignButton from "../AddSignButton";
import VisitSheet from "../VisitSheet";
import { arrived, useGps } from "../useGps";
import { ago, api, NAVY } from "@/components/ui";
import { distanceM, fmtDist, mapsLink } from "@/lib/geo";
import { SignsData, Stop, STATUS_COLOR, STATUS_LABEL, Visit } from "../types";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });


export default function RoutePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SignsData | null>(null);
  const [err, setErr] = useState("");
  const [runStart, setRunStart] = useState<number | null>(null);
  const [added, setAdded] = useState("");
  const [sheet, setSheet] = useState<{ stop: Stop; auto: boolean } | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
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

  const { pos, err: gpsErr } = useGps(running && !!route, route?.id);
  const doneInRunRef = useRef(doneInRun);
  doneInRunRef.current = doneInRun;

  // Arrival: the closest stop not yet done on this run, inside its radius.
  useEffect(() => {
    if (!pos || !route || sheetRef.current) return;
    let best: { s: Stop; d: number } | null = null;
    for (const s of route.stops) {
      if (doneInRunRef.current(s) || dismissed.current.has(s.id)) continue;
      const d = distanceM(pos, s);
      if (!best || d < best.d) best = { s, d };
    }
    if (best && arrived(best.d, best.s.radiusM, pos.accuracyM)) {
      navigator.vibrate?.([200, 100, 200]);
      setSheet({ stop: best.s, auto: true });
    }
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    const t = Date.now();
    try { localStorage.setItem(runKey, String(t)); } catch {}
    dismissed.current.clear();
    setRunStart(t);
  }
  function finish() {
    try { localStorage.removeItem(runKey); } catch {}
    setRunStart(null);
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
          <AddSignButton pos={pos} routeId={route.id} onAdded={(m) => { setAdded(m); load(); }} />
          {added && <p className="text-sm text-green-700">{added}</p>}
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
