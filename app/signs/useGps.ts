"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/components/ui";

export type Pos = { lat: number; lng: number; accuracyM: number; at: number };
const PING_MS = 30_000;

const toPos = (p: GeolocationPosition): Pos => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: Date.now() });

/** One fresh GPS reading (not a cached one), or null if the phone can't get one in time. */
export function freshFix(timeoutMs = 15000): Promise<Pos | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(toPos(p)), () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs });
  });
}

/** Watch the phone's location while `on`, share it with the office every 30 s, and keep the screen awake.
 *  A web page can't read GPS while the phone is locked or another app is in front, so the moment the page
 *  is back on screen it takes a fresh reading and shares it straight away. */
export function useGps(on: boolean, routeId?: string) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [err, setErr] = useState("");
  const lastPing = useRef(0);

  useEffect(() => {
    if (!on) { setPos(null); return; }
    if (!("geolocation" in navigator)) { setErr("This phone's browser doesn't share location."); return; }
    const got = (here: Pos, force = false) => {
      setPos(here);
      setErr("");
      if (force || Date.now() - lastPing.current > PING_MS) {
        lastPing.current = Date.now();
        api("/api/signs/ping", { method: "POST", json: { ...here, routeId } }).catch(() => {});
      }
    };
    const id = navigator.geolocation.watchPosition(
      (p) => got(toPos(p)),
      (e) => setErr(e.code === 1 ? "Location is blocked. Allow location for this site in your phone settings." : "Waiting for GPS..."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    const onVis = () => { if (document.visibilityState === "visible") freshFix(10000).then((p) => p && got(p, true)); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => { navigator.geolocation.clearWatch(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", onVis); };
  }, [on, routeId]);

  useEffect(() => {
    if (!on) return;
    let lock: any = null;
    const get = () => (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release?.(); };
  }, [on]);

  return { pos, err };
}

/** Arrival test shared by route mode and GPS mode: inside the stop's radius, allowing some GPS wobble. */
export const arrived = (d: number, radiusM: number, accuracyM: number) => accuracyM <= 100 && d <= radiusM + Math.min(accuracyM, 40);
