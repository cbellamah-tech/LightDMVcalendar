"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string; lat: number; lng: number; color: string; label: string; popup?: string; radiusM?: number; big?: boolean;
};

/** Leaflet map with circle markers (no image assets needed). Loaded client-side only. */
export default function SignMap({
  points, me, line, height = 420, onPick, fitKey,
}: {
  points: MapPoint[]; me?: { lat: number; lng: number; accuracyM?: number } | null;
  line?: [number, number][]; height?: number | string; onPick?: (id: string) => void; fitKey?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const L = useRef<any>(null);
  const layer = useRef<any>(null);
  const meLayer = useRef<any>(null);
  const fitted = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod.default || mod;
      map.current = L.current.map(el.current, { zoomControl: true }).setView([38.95, -77.15], 10);
      L.current.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map.current);
      layer.current = L.current.layerGroup().addTo(map.current);
      meLayer.current = L.current.layerGroup().addTo(map.current);
      draw();
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const Lf = L.current;
    if (!Lf || !layer.current) return;
    layer.current.clearLayers();
    if (line && line.length > 1) Lf.polyline(line, { color: "#112E5B", weight: 3, opacity: 0.5, dashArray: "6 6" }).addTo(layer.current);
    for (const p of points) {
      if (p.radiusM) Lf.circle([p.lat, p.lng], { radius: p.radiusM, color: p.color, weight: 1, fillOpacity: 0.08 }).addTo(layer.current);
      const m = Lf.circleMarker([p.lat, p.lng], {
        radius: p.big ? 11 : 8, color: "#fff", weight: 2, fillColor: p.color, fillOpacity: 1,
      }).addTo(layer.current);
      m.bindTooltip(p.label, { direction: "top", offset: [0, -6] });
      if (p.popup) m.bindPopup(p.popup);
      if (onPick) m.on("click", () => onPick(p.id));
    }
    const key = fitKey ?? points.map((p) => p.id).join(",");
    if (points.length && fitted.current !== key) {
      fitted.current = key;
      map.current.fitBounds(Lf.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 15 });
    }
  }

  useEffect(draw); // redraw on every prop change; cheap for a few hundred markers

  useEffect(() => {
    const Lf = L.current;
    if (!Lf || !meLayer.current) return;
    meLayer.current.clearLayers();
    if (!me) return;
    if (me.accuracyM) Lf.circle([me.lat, me.lng], { radius: me.accuracyM, color: "#2563EB", weight: 1, fillOpacity: 0.1 }).addTo(meLayer.current);
    Lf.circleMarker([me.lat, me.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#2563EB", fillOpacity: 1 })
      .bindTooltip("You").addTo(meLayer.current);
  }, [me?.lat, me?.lng, me?.accuracyM]);

  return <div ref={el} style={{ height, width: "100%" }} className="rounded-xl overflow-hidden border border-slate-200 z-0" />;
}
