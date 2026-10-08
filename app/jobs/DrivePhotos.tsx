"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen, Loader2 } from "lucide-react";
import { api, NAVY } from "@/components/ui";

type Status = {
  connected: boolean; email?: string; inDrive: number; pending: number; folder: string | null; sheet: string | null;
  lastError: { at: number; message: string } | null; error?: string; skipped?: string;
};

/** Office view: every checklist photo goes to Drive by customer; this shows where, and copies anything left behind. */
export default function DrivePhotos() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { api<Status>("/api/jobs/drive-photos").then(setS).catch(() => {}); }, []);

  async function copyAll() {
    setBusy(true); setMsg("");
    try {
      let r: Status & { copied: number };
      let total = 0;
      do {
        r = await api<Status & { copied: number }>("/api/jobs/drive-photos", { method: "POST" });
        total += r.copied; setS(r);
      } while (r.pending > 0 && r.copied > 0 && !r.error && !r.skipped);
      setMsg(r.skipped || r.error || `Copied ${total} photo${total === 1 ? "" : "s"}.`);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (!s) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-bold flex items-center gap-2" style={{ color: NAVY }}><FolderOpen size={16} /> Job photos in Google Drive</div>
        <div className="flex gap-3 items-center">
          {s.folder && <a href={s.folder} target="_blank" rel="noreferrer" className="underline flex items-center gap-1">Folder <ExternalLink size={12} /></a>}
          {s.sheet && <a href={s.sheet} target="_blank" rel="noreferrer" className="underline flex items-center gap-1">Photo list <ExternalLink size={12} /></a>}
        </div>
      </div>
      {!s.connected ? (
        <div className="text-amber-800">Google isn&apos;t connected, so photos stay in the app for now. Connect it on the Marketing tab and they copy over.</div>
      ) : (
        <div className="text-slate-600">
          Every checklist photo is copied to {s.email || "Drive"}, one folder per customer and season. {s.inDrive} copied{s.pending ? `, ${s.pending} waiting` : ""}.
        </div>
      )}
      {s.connected && s.pending > 0 && (
        <button onClick={copyAll} disabled={busy} className="rounded-lg px-3 py-1.5 font-semibold text-white disabled:opacity-60 flex items-center gap-2" style={{ background: NAVY }}>
          {busy && <Loader2 size={14} className="animate-spin" />} Copy the {s.pending} waiting
        </button>
      )}
      {(msg || s.lastError) && <div className={s.lastError && !msg ? "text-red-600" : "text-slate-600"}>{msg || `Last copy failed: ${s.lastError!.message}`}</div>}
    </section>
  );
}
