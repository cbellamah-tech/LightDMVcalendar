"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, LocateFixed, MapPin, Navigation, Play, RefreshCw, Route as RouteIcon, Search, Square } from "lucide-react";
import AddSignButton from "../AddSignButton";
import VisitSheet from "../VisitSheet";
import { arrived, useGps } from "../useGps";
import { ago, api, NAVY } from "@/components/ui";
import { distanceM, fmtDist, mapsLink } from "@/lib/geo";
import { mapsMultiLink, pathLengthM, planOrder } from "@/lib/routeplan";
import { SignsData, Stop, STATUS_COLOR, STATUS_LABEL } from "../types";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });

type From = { lat: number; lng: number; label: string };
/** A run in progress, kept on this phone so a reload doesn't lose it. */
type Run = { start: number; group: string; order: string[]; from: From };
const ALL = "__all";

export default function RoutePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SignsData | null>(null);
  const [err, setErr] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [group, setGroup] = useState(ALL);
  const [from, setFrom] = useState<From | null>(null);
  const [addr, setAddr] = useState("");
  const [finding, setFinding] = useState("");
  const [fromErr, setFromErr] = useState("");
  const [added, setAdded] = useState("");
  const [sheet, setSheet] = useState<{ stop: Stop; auto: boolean } | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const runKey = `ldmv-run-${params.id}`;

  const load = useCallback(() => api<SignsData>("/api/signs").then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
    try {
      const v = JSON.parse(localStorage.getItem(runKey) || "null");
      if (v && typeof v === "object" && Array.isArray(v.order)) { setRun(v); setGroup(v.group); setFrom(v.from); }
    } catch {}
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load, runKey]);

  const route = data?.routes.find((r) => r.id === params.id);
  const lastVisit = useMemo(() => data?.lastVisit || {}, [data]);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of route?.stops || []) if (s.cluster) m.set(s.cluster, (m.get(s.cluster) || 0) + 1);
    return [...m.entries()];
  }, [route]);
  const inGroup = useCallback((s: Stop) => group === ALL || s.cluster === group, [group]);
  const groupStops = useMemo(() => (route?.stops || []).filter(inGroup), [route, inGroup]);

  const running = !!run;
  const doneInRun = useCallback((s: Stop) => !!run && (lastVisit[s.id]?.at || 0) >= run.start, [run, lastVisit]);

  // Before starting: preview the best order from the chosen start point.
  const preview = useMemo(() => (from && !running ? planOrder(from, groupStops) : []), [from, running, groupStops]);
  // While running: the planned order, plus any spot added to this group since.
  const ordered = useMemo(() => {
    if (!route) return [];
    if (!run) return preview.length ? preview : groupStops;
    const byId = new Map(route.stops.map((s) => [s.id, s]));
    const list = run.order.map((id) => byId.get(id)).filter(Boolean) as Stop[];
    return [...list, ...groupStops.filter((s) => !run.order.includes(s.id))];
  }, [route, run, preview, groupStops]);
  const nextStop = running ? ordered.find((s) => !doneInRun(s)) : undefined;
  const doneCount = ordered.filter(doneInRun).length;

  const { pos, err: gpsErr } = useGps(running && !!route, route?.id);
  const doneInRunRef = useRef(doneInRun);
  doneInRunRef.current = doneInRun;
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  // Arrival: the closest spot in this run not yet done, inside its radius.
  useEffect(() => {
    if (!pos || !route || sheetRef.current) return;
    let best: { s: Stop; d: number } | null = null;
    for (const s of orderedRef.current) {
      if (doneInRunRef.current(s) || dismissed.current.has(s.id)) continue;
      const d = distanceM(pos, s);
      if (!best || d < best.d) best = { s, d };
    }
    if (best && arrived(best.d, best.s.radiusM, pos.accuracyM)) {
      navigator.vibrate?.([200, 100, 200]);
      setSheet({ stop: best.s, auto: true });
    }
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  function takeMyLocation() {
    setFromErr(""); setFinding("gps");
    if (!("geolocation" in navigator)) { setFromErr("This phone's browser doesn't share location. Type an address instead."); setFinding(""); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setFrom({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Your location" }); setFinding(""); },
      (e) => { setFromErr(e.code === 1 ? "Location is blocked. Allow it in your phone settings, or type an address." : "Couldn't get a GPS fix. Try again or type an address."); setFinding(""); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  }
  async function findAddress() {
    if (!addr.trim()) return;
    setFromErr(""); setFinding("addr");
    try { setFrom(await api<From>(`/api/geocode?q=${encodeURIComponent(addr)}`)); }
    catch (e: any) { setFromErr(e.message); }
    finally { setFinding(""); }
  }

  function save(r: Run | null) {
    try { r ? localStorage.setItem(runKey, JSON.stringify(r)) : localStorage.removeItem(runKey); } catch {}
    setRun(r);
  }
  function start() {
    if (!from) return;
    dismissed.current.clear();
    save({ start: Date.now(), group, order: preview.map((s) => s.id), from });
  }
  // Reorder what's left from where the truck is now (after a detour or a skipped spot).
  function replan() {
    if (!run || !pos) return;
    const done = ordered.filter(doneInRun);
    const left = planOrder(pos, ordered.filter((s) => !doneInRun(s)));
    save({ ...run, order: [...done, ...left].map((s) => s.id) });
  }
  function finish() { save(null); }

  const nextUp = running ? ordered.filter((s) => !doneInRun(s)) : ordered;
  const points = useMemo(() => (route?.stops || []).filter(inGroup).map((s) => {
    const v = lastVisit[s.id];
    const fresh = doneInRun(s);
    const n = ordered.indexOf(s) + 1;
    return {
      id: s.id, lat: s.lat, lng: s.lng, radiusM: running ? s.radiusM : undefined, big: s.id === nextStop?.id,
      color: running ? (fresh ? STATUS_COLOR[v!.status] : s.id === nextStop?.id ? NAVY : STATUS_COLOR.none) : STATUS_COLOR[v?.status || "none"],
      label: `${n ? `${n}. ` : ""}${s.name}`,
    };
  }), [route, inGroup, lastVisit, running, nextStop?.id, doneInRun, ordered]);
  const line = useMemo(() => {
    const pts = (running || from) ? [...(from && !running ? [from] : []), ...nextUp] : [];
    return pts.map((s) => [s.lat, s.lng] as [number, number]);
  }, [running, from, nextUp]);

  if (!data) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading route...</>}</div>;
  if (!route) return <div className="p-6">Route not found. <Link className="underline" href="/signs">Back to routes</Link></div>;

  const distNext = pos && nextStop ? distanceM(pos, nextStop) : null;
  const groupLabel = group === ALL ? "Whole route" : group;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <Link href="/signs" className="text-sm text-slate-500 flex items-center gap-1"><ArrowLeft size={16} /> All routes</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-400">{route.id} · {route.stops.length} spots{groups.length ? ` in ${groups.length} groups` : ""}</div>
          <h1 className="text-xl font-extrabold" style={{ color: NAVY }}>{route.name}</h1>
        </div>
        {running && <button onClick={finish} className="rounded-lg px-3 py-2 font-semibold border border-slate-300 flex items-center gap-1 text-sm"><Square size={14} /> Finish</button>}
      </div>

      {!running && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          {groups.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase text-slate-400 mb-1.5">1. Pick a group</div>
              <div className="flex flex-wrap gap-2">
                {[[ALL, route.stops.length] as [string, number], ...groups].map(([g, n]) => (
                  <button key={g} onClick={() => setGroup(g)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${group === g ? "text-white" : "bg-white border-slate-300"}`}
                    style={group === g ? { background: NAVY, borderColor: NAVY } : undefined}>
                    {g === ALL ? "Whole route" : g} <span className="opacity-70">({n})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs font-bold uppercase text-slate-400 mb-1.5">{groups.length ? "2. " : ""}Where are you starting from?</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={takeMyLocation} disabled={!!finding} className="rounded-lg px-3 py-2 font-semibold text-sm border border-slate-300 flex items-center gap-2">
                {finding === "gps" ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} My location
              </button>
              <form className="flex-1 min-w-[220px] flex gap-2" onSubmit={(e) => { e.preventDefault(); findAddress(); }}>
                <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Or type an address"
                  className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                <button disabled={!!finding || !addr.trim()} className="rounded-lg px-3 py-2 border border-slate-300 disabled:opacity-40" aria-label="Find address">
                  {finding === "addr" ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              </form>
            </div>
            {from && <p className="text-sm text-green-700 mt-1.5">Starting from {from.label}.</p>}
            {fromErr && <p className="text-sm text-red-600 mt-1.5">{fromErr}</p>}
          </div>
          {from && preview.length > 0 && (
            <>
              <div className="text-sm text-slate-600">
                Best order for <b>{groupLabel}</b>: {preview.length} spots, about {fmtDist(pathLengthM(from, preview))} of driving (straight-line estimate).
              </div>
              <button onClick={start} className="w-full rounded-lg py-3 font-bold text-white flex justify-center items-center gap-2" style={{ background: "#1F9D55" }}>
                <Play size={18} /> Start in this order
              </button>
            </>
          )}
        </div>
      )}

      {running && (
        <div className="bg-white rounded-xl border-2 p-4 space-y-2" style={{ borderColor: NAVY }}>
          <div className="text-sm text-slate-500">{groupLabel} · {doneCount} of {ordered.length} done · started {ago(run!.start)}</div>
          {nextStop ? (
            <>
              <div className="text-xs font-bold uppercase text-slate-400">Next spot ({ordered.indexOf(nextStop) + 1} of {ordered.length})</div>
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
              <div className="flex gap-3 text-sm">
                <a href={mapsMultiLink(pos, nextUp)} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline text-slate-600">
                  <RouteIcon size={14} /> Next {Math.min(10, nextUp.length)} in Google Maps
                </a>
                <button onClick={replan} disabled={!pos} className="flex items-center gap-1 underline text-slate-600 disabled:opacity-40">
                  <RefreshCw size={14} /> Re-plan from here
                </button>
              </div>
            </>
          ) : (
            <div className="font-bold text-green-700 flex items-center gap-2"><Check /> Every spot in {groupLabel.toLowerCase() === "whole route" ? "this route" : groupLabel} is logged. Tap Finish.</div>
          )}
          <AddSignButton pos={pos} routeId={route.id} onAdded={(m) => { setAdded(m); load(); }} />
          {added && <p className="text-sm text-green-700">{added}</p>}
          {gpsErr && distNext != null && <div className="text-xs text-amber-700">{gpsErr}</div>}
          <p className="text-xs text-slate-400">Keep this screen open while driving. Phones stop sharing location when the app is closed.</p>
        </div>
      )}

      <SignMap points={points} me={pos || (from && !running ? from : null)} line={line} height={320} fitKey={`${group}|${route.stops.length}`}
        onPick={(id) => {
          const s = route.stops.find((x) => x.id === id);
          if (s) setSheet({ stop: s, auto: false });
        }} />

      <ol className="bg-white rounded-xl border border-slate-200 divide-y">
        {ordered.map((s, i) => {
          const v = lastVisit[s.id];
          const planned = running || preview.length > 0;
          return (
            <li key={s.id}>
              <button className="w-full text-left p-3 flex gap-3 items-center" onClick={() => setSheet({ stop: s, auto: false })}>
                <span className="w-7 h-7 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={{ background: running && doneInRun(s) ? STATUS_COLOR[v!.status] : !running && v ? STATUS_COLOR[v.status] : s.id === nextStop?.id ? NAVY : "#94A3B8" }}>
                  {planned ? i + 1 : s.order}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{s.name}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {s.cluster && group === ALL ? `${s.cluster} · ` : ""}{s.type}{s.near ? ` · ${s.near}` : ""}{v ? ` · ${STATUS_LABEL[v.status]} by ${v.byName} ${ago(v.at)}` : ""}
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
