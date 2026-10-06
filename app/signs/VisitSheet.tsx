"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import PhotoButton from "@/components/PhotoButton";
import { api } from "@/components/ui";
import { distanceM, fmtDist } from "@/lib/geo";
import { Stop, STATUS_COLOR, STATUS_LABEL, Visit } from "./types";

type Pos = { lat: number; lng: number; accuracyM: number };

export default function VisitSheet({ stop, auto, pos, last, routeName, onClose, onSaved }: {
  stop: Stop; auto: boolean; routeName?: string; pos: Pos | null; last?: Visit; onClose: () => void; onSaved: () => void;
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
            {routeName && <div className="text-xs font-bold text-slate-400">{routeName}</div>}
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
