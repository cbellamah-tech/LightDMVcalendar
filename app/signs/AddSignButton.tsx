"use client";

import { useRef, useState } from "react";
import PhotoButton from "@/components/PhotoButton";
import { api } from "@/components/ui";
import SignCount from "./SignCount";
import { freshFix, type Pos } from "./useGps";

/** One button: opens the camera and, at the same moment, takes a fresh GPS reading. The new spot is saved
 *  exactly where the phone was, joins the route (and the sign placer's pay), and is logged as placed. */
export default function AddSignButton({ pos, routeId, onAdded, className = "" }: {
  pos: Pos | null; routeId?: string; onAdded: (msg: string) => void; className?: string;
}) {
  const [err, setErr] = useState("");
  const [signs, setSigns] = useState(1);
  const fix = useRef<Promise<Pos | null> | null>(null);
  const latest = useRef(pos);
  latest.current = pos;

  return (
    <div className={`rounded-xl border border-green-200 bg-green-50 p-3 space-y-2 ${className}`}>
      <SignCount value={signs} onChange={setSigns} label="New spot: signs" />
      <PhotoButton folder="signs/new" multiple={false} label="Add sign location (photo + GPS)" color="#1F9D55" className="w-full py-3"
        onOpen={() => { setErr(""); fix.current = freshFix(20000); }}
        onUploaded={async ([url]) => {
          setErr("");
          // The reading taken when the camera opened, else a new one, else the last known one.
          const here = (await fix.current) || (await freshFix(10000)) || latest.current;
          fix.current = null;
          if (!here) { setErr("Couldn't get your GPS location. Allow location for this site and try again; the photo is saved, just tap the button again."); return; }
          try {
            const r = await api("/api/signs/add", { method: "POST", json: { ...here, photoUrl: url, routeId, signs } });
            onAdded(r.created
              ? `Added a new spot with ${signs} sign${signs > 1 ? "s" : ""} to route ${r.stop.routeId} (GPS ±${Math.round(here.accuracyM)} m).`
              : `There's already a spot here ("${r.stop.name}"), so your photo was logged there.`);
            setSigns(1);
          } catch (e: any) { setErr(e.message); }
        }} />
      {pos && pos.accuracyM > 50 && <p className="text-xs text-amber-700">GPS is rough right now (±{Math.round(pos.accuracyM)} m). Step out of the truck for a better fix.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
