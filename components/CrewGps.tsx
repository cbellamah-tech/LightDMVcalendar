"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Pause, Play } from "lucide-react";

/* A crew lead's phone shares where the van is while the app is open on a day with stops. That's what moves the
   office map and every customer's ETA. Phones stop sending when the app is closed or the screen locks, so the pill
   says so. Pausing lasts until the end of the day. */
export default function CrewGps() {
  const [share, setShare] = useState(false);
  const [state, setState] = useState<"on" | "denied" | "paused" | "off">("off");
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const today = new Date().toDateString();

  useEffect(() => {
    let paused = false;
    try { paused = localStorage.getItem("ldmv-gps-paused") === today; } catch { /* private mode */ }
    fetch("/api/jobs/gps", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!d.share) return;
      setShare(true);
      setState(paused ? "paused" : "on");
    }).catch(() => {});
  }, [today]);

  useEffect(() => {
    if (!share || state !== "on" || !("geolocation" in navigator)) return;
    const send = (p: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = p.coords;
      const prev = last.current;
      const now = Date.now();
      // Every minute, or sooner once the van has moved a block.
      const moved = prev ? Math.hypot((lat - prev.lat) * 111_000, (lng - prev.lng) * 86_000) : Infinity;
      if (prev && now - prev.at < 60_000 && (moved < 80 || now - prev.at < 20_000)) return;
      last.current = { at: now, lat, lng };
      fetch("/api/jobs/gps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat, lng, acc: accuracy }) }).catch(() => {});
    };
    const id = navigator.geolocation.watchPosition(send, (e) => { if (e.code === e.PERMISSION_DENIED) setState("denied"); },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 });
    // watchPosition goes quiet while parked; ask again each minute so the office still sees the van.
    const t = setInterval(() => navigator.geolocation.getCurrentPosition(send, () => {}, { maximumAge: 30_000, timeout: 30_000 }), 60_000);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(t); };
  }, [share, state]);

  if (!share) return null;
  const pause = (on: boolean) => {
    try { on ? localStorage.setItem("ldmv-gps-paused", today) : localStorage.removeItem("ldmv-gps-paused"); } catch { /* private mode */ }
    last.current = null;
    setState(on ? "paused" : "on");
  };
  return (
    <div className="fixed z-30 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4 lg:right-4 max-w-[calc(100vw-1.5rem)]">
      {state === "on" && (
        <button onClick={() => pause(true)} className="rounded-full bg-white/95 border border-green-300 shadow px-3 py-1.5 text-xs font-semibold text-green-800 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Sharing van location · keep the app open <Pause size={12} />
        </button>
      )}
      {state === "paused" && (
        <button onClick={() => pause(false)} className="rounded-full bg-white/95 border border-slate-300 shadow px-3 py-1.5 text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <MapPin size={12} /> Location paused: customers' ETAs won't move <Play size={12} />
        </button>
      )}
      {state === "denied" && (
        <div className="rounded-xl bg-amber-50 border border-amber-300 shadow px-3 py-2 text-xs text-amber-900 max-w-xs">
          <b>Location is off for this app.</b> Customers' ETAs only move when the van's phone shares it. Turn on Location for this site in the phone's settings, then reopen the app.
        </div>
      )}
    </div>
  );
}
