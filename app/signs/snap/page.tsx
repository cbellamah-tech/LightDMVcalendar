"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, CloudUpload, Navigation, Route as RouteIcon, X } from "lucide-react";
import { api } from "@/components/ui";
import { distanceM, fmtDist, mapsLink } from "@/lib/geo";
import { mapsMultiLink, planOrder } from "@/lib/routeplan";
import { useGps, type Pos } from "../useGps";
import { allSnaps, newSnapId, putSnap, sendSnap, type Snap } from "../snapQueue";
import type { RouteData, SignsData, Stop } from "../types";

/* Snap mode: the camera is open the whole time. Tap the button, the sign is logged with its exact GPS pin,
   the count goes up, and the camera is ready for the next one. Uploads run behind it and retry until they land. */

const FRESH_MS = 20_000;
const DONE_MS = 12 * 3600_000;

export default function SnapPage() {
  const video = useRef<HTMLVideoElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [camErr, setCamErr] = useState("");
  const [flash, setFlash] = useState(false);
  const [routeId, setRouteId] = useState<string | undefined>();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState("");
  const [today, setToday] = useState<{ signs: number; amount: number } | null>(null);
  const [mine, setMine] = useState(0); // snaps taken on this screen that the server hasn't counted yet
  const [last, setLast] = useState<{ url: string; text: string } | null>(null);
  const [placer, setPlacer] = useState(false);
  const { pos, err: gpsErr } = useGps(true, routeId);
  const posRef = useRef<Pos | null>(null);
  posRef.current = pos;

  // Which route: ?route=R05, else the closest one once GPS is in.
  useEffect(() => { setRouteId(new URLSearchParams(window.location.search).get("route") || undefined); }, []);
  const [routes, setRoutes] = useState<SignsData["routes"] | null>(null);
  useEffect(() => { api<SignsData>("/api/signs").then((d) => { setRoutes(d.routes); setPlacer(d.me.role === "signs"); }).catch(() => {}); }, []);
  useEffect(() => {
    if (routeId || !routes?.length || !pos) return;
    const best = [...routes].sort((a, b) => distanceM(pos, a) - distanceM(pos, b))[0];
    setRouteId(best.id);
  }, [routeId, routes, pos]);

  const loadRoute = useCallback(() => { if (routeId) api<RouteData>(`/api/signs/route/${routeId}`).then(setRoute).catch(() => {}); }, [routeId]);
  useEffect(loadRoute, [loadRoute]);
  const loadPay = useCallback(() => api("/api/signs/pay").then((d) => { setToday(d.people[0]?.today ?? { signs: 0, amount: 0 }); setMine(0); }).catch(() => {}), []);
  useEffect(() => { loadPay(); }, [loadPay]);

  // Best order through the route from where he is, worked out once per route.
  useEffect(() => {
    if (!route || !pos || order.length) return;
    const key = `ldmv-snap-order-${route.route.id}`;
    try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved?.day === new Date().toDateString()) { setOrder(saved.order); return; } } catch {}
    const o = planOrder(pos, route.route.stops).map((s) => s.id);
    setOrder(o);
    try { localStorage.setItem(key, JSON.stringify({ day: new Date().toDateString(), order: o })); } catch {}
  }, [route, pos, order.length]);
  const remaining = useMemo(() => {
    if (!route) return [] as Stop[];
    const by = new Map(route.route.stops.map((s) => [s.id, s]));
    const isDone = (s: Stop) => done.has(s.id) || Date.now() - (route.lastVisit[s.id]?.at || 0) < DONE_MS && route.lastVisit[s.id]?.status !== "skipped";
    const list = (order.length ? order.map((id) => by.get(id)).filter(Boolean) as Stop[] : route.route.stops);
    return list.filter((s) => !isDone(s));
  }, [route, order, done]);
  const next = remaining[0];

  // Camera: the live back camera, no trip out to the phone's camera app.
  useEffect(() => {
    let stream: MediaStream | null = null, stopped = false;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => {}); }
        setCamErr("");
      } catch (e: any) {
        setCamErr(e?.name === "NotAllowedError" ? "Camera is blocked. Allow the camera for this site, or use the button below." : "Live camera isn't available on this phone. Use the button below.");
      }
    };
    start();
    const onVis = () => { if (document.visibilityState === "visible" && video.current && !(video.current.srcObject as MediaStream | null)?.active) start(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; document.removeEventListener("visibilitychange", onVis); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Upload loop: one at a time, oldest first, again every few seconds until the queue is empty.
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const list = await allSnaps();
      setPending(list.length);
      for (const s of list) {
        if (s.lat == null) {
          // No GPS when it was taken: use the phone's spot only if it's still within a minute of the photo.
          const p = posRef.current;
          if (p && Math.abs(p.at - s.at) < 60_000) { Object.assign(s, { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM }); await putSnap(s); }
          else if (Date.now() - s.at > 60_000) { setFailed("A photo has no GPS. Turn on location for this site."); continue; }
          else continue;
        }
        try {
          const r = await sendSnap(s);
          setDone((d) => new Set(d).add(r.stopId));
          setFailed("");
          setPending((n) => Math.max(0, n - 1));
        } catch (e: any) {
          setFailed(navigator.onLine ? e.message : "No signal. Photos are saved on the phone and will upload on their own.");
          break;
        }
      }
      const left = await allSnaps();
      setPending(left.length);
      if (!left.length) { loadPay(); loadRoute(); }
    } finally { syncing.current = false; }
  }, [loadPay, loadRoute]);
  useEffect(() => {
    sync();
    const t = setInterval(sync, 5000);
    window.addEventListener("online", sync);
    return () => { clearInterval(t); window.removeEventListener("online", sync); };
  }, [sync]);

  async function save(blob: Blob) {
    const p = posRef.current;
    const fresh = p && Date.now() - p.at < FRESH_MS;
    const s: Snap = { id: newSnapId(), blob, at: Date.now(), routeId, ...(fresh ? { lat: p!.lat, lng: p!.lng, accuracyM: p!.accuracyM } : {}) };
    await putSnap(s);
    setMine((n) => n + 1);
    setPending((n) => n + 1);
    const near = remaining.length && fresh ? [...remaining].sort((a, b) => distanceM(p!, a) - distanceM(p!, b))[0] : undefined;
    if (near && distanceM(p!, near) <= near.radiusM + 40) setDone((d) => new Set(d).add(near.id));
    setLast({ url: URL.createObjectURL(blob), text: fresh ? `Pinned ±${Math.round(p!.accuracyM)} m` : "Saved. Waiting for GPS..." });
    sync();
  }

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) { fileIn.current?.click(); return; }
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    setFlash(true); setTimeout(() => setFlash(false), 120);
    navigator.vibrate?.(60);
    c.toBlob((b) => b && save(b), "image/jpeg", 0.8);
  }

  async function fromFile(f: File) {
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      c.toBlob((b) => save(b || f), "image/jpeg", 0.8);
    } catch { save(f); }
  }

  // Drawn straight on the page body so the app's header and tab bar can't sit on top of the camera.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const signs = (today?.signs ?? 0) + mine;
  const d = pos && next ? distanceM(pos, next) : null;

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[5000] bg-black text-white flex flex-col">
      {/* Top: the count and the GPS pin */}
      <div className="absolute top-0 inset-x-0 z-10 p-3 flex items-start justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div>
          <div className="text-3xl font-extrabold leading-none">{signs} <span className="text-base font-semibold">signs today</span></div>
          {placer && <div className="text-lg font-bold text-green-400">${signs * 2}</div>}
          <div className="text-xs opacity-80 mt-1">
            {pos ? `GPS ±${Math.round(pos.accuracyM)} m` : gpsErr || "Finding GPS..."}
            {pending > 0 && <span className="ml-2 inline-flex items-center gap-1"><CloudUpload size={12} /> {pending} uploading</span>}
            {pending === 0 && today && <span className="ml-2 inline-flex items-center gap-1 text-green-400"><Check size={12} /> all saved</span>}
          </div>
          {failed && <div className="text-xs text-amber-300 mt-1 max-w-[16rem]">{failed}</div>}
        </div>
        <Link href={routeId ? `/signs/${routeId}` : "/signs"} className="p-2 rounded-full bg-black/50" aria-label="Close camera"><X size={22} /></Link>
      </div>

      <video ref={video} playsInline muted autoPlay className="flex-1 w-full h-full object-cover" />
      {flash && <div className="absolute inset-0 bg-white/80 z-20" />}
      {camErr && <div className="absolute inset-x-6 top-1/3 z-10 text-center text-sm bg-black/70 rounded-lg p-3">{camErr}</div>}

      {/* Bottom: next spot, Google Maps, the shutter */}
      <div className="absolute bottom-0 inset-x-0 z-10 p-3 space-y-3 bg-gradient-to-t from-black/90 to-transparent" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {next && (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs opacity-70">Next spot{route ? ` · ${remaining.length} left on ${route.route.name}` : ""}</div>
              <div className="font-bold truncate">{next.name}{d != null ? ` · ${fmtDist(d)}` : ""}</div>
            </div>
            <a href={mapsLink(next.lat, next.lng)} target="_blank" rel="noreferrer" className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold flex items-center gap-1"><Navigation size={16} /> Go</a>
            <a href={mapsMultiLink(pos, remaining)} target="_blank" rel="noreferrer" className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold flex items-center gap-1"><RouteIcon size={16} /> Route</a>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="w-16 h-16">
            {last && <div className="relative"><img src={last.url} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-white" /><div className="text-[10px] mt-0.5 w-24 opacity-80">{last.text}</div></div>}
          </div>
          <button onClick={snap} aria-label="Snap sign" className="w-20 h-20 rounded-full border-4 border-white bg-green-600 active:scale-95 flex items-center justify-center shadow-xl">
            <Camera size={32} />
          </button>
          <div className="w-16" />
        </div>
        <div className="text-center text-xs opacity-70">Tap once per sign. Four corners = four snaps.</div>
      </div>
      <input ref={fileIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromFile(f); }} />
    </div>,
    document.body,
  );
}
