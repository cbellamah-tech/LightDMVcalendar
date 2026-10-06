"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/components/ui";

export type Pos = { lat: number; lng: number; accuracyM: number; at: number };
const PING_MS = 30_000;

/** Watch the phone's location while `on`, share it with the office every 30 s, and keep the screen awake. */
export function useGps(on: boolean, routeId?: string) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [err, setErr] = useState("");
  const lastPing = useRef(0);

  useEffect(() => {
    if (!on) { setPos(null); return; }
    if (!("geolocation" in navigator)) { setErr("This phone's browser doesn't share location."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: Date.now() };
        setPos(here);
        setErr("");
        if (Date.now() - lastPing.current > PING_MS) {
          lastPing.current = Date.now();
          api("/api/signs/ping", { method: "POST", json: { ...here, routeId } }).catch(() => {});
        }
      },
      (e) => setErr(e.code === 1 ? "Location is blocked. Allow location for this site in your phone settings." : "Waiting for GPS..."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
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
