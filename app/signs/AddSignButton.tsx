"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import PhotoButton from "@/components/PhotoButton";
import { api } from "@/components/ui";
import type { Pos } from "./useGps";

/** One button: opens the camera, then saves a new sign spot where the phone is, logged as placed. */
export default function AddSignButton({ pos, routeId, onAdded, className = "" }: {
  pos: Pos | null; routeId?: string; onAdded: (msg: string) => void; className?: string;
}) {
  const [err, setErr] = useState("");
  if (!pos) return (
    <button disabled className={`rounded-lg py-3 font-semibold bg-slate-200 text-slate-500 flex justify-center items-center gap-2 ${className}`}>
      <Plus size={18} /> Add sign here (finding location...)
    </button>
  );
  return (
    <div className={className}>
      <PhotoButton folder="signs/new" multiple={false} label="Add a new sign here" color="#1F9D55" className="w-full py-3"
        onUploaded={async ([url]) => {
          setErr("");
          try {
            const r = await api("/api/signs/add", { method: "POST", json: { ...pos, photoUrl: url, routeId } });
            onAdded(r.created ? `Added "${r.stop.name}" to ${r.stop.routeId} with your photo.` : `There's already a spot here ("${r.stop.name}"), so your photo was logged there.`);
          } catch (e: any) { setErr(e.message); }
        }} />
      {pos.accuracyM > 50 && <p className="text-xs text-amber-700 mt-1">GPS is rough right now (±{Math.round(pos.accuracyM)} m). Step outside the truck for a better fix.</p>}
      {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
    </div>
  );
}
