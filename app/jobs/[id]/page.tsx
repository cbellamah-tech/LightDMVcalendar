"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, CheckCircle2, Loader2, Navigation, X } from "lucide-react";
import PhotoButton from "@/components/PhotoButton";
import { ago, api, fmtDay, fmtTime, NAVY } from "@/components/ui";
import { CREW_LABEL } from "../../signs/types";
import type { Checklist, Job, Progress, SopItem } from "../types";

type Data = { job: Job; checklist: Checklist; sop: { title: string; items: SopItem[] }; progress: Progress };

export default function JobPage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState("");
  const busy = useRef(0);

  const load = useCallback(() => {
    if (busy.current) return; // don't overwrite while a save is in flight
    api<Data>(`/api/jobs/${params.id}`).then(setD).catch((e) => setErr(e.message));
  }, [params.id]);
  // Re-pull every 5 seconds so both crew members see each other's checks.
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  async function update(body: Record<string, unknown>) {
    busy.current++;
    setToast("");
    try {
      const r = await api<{ checklist: Checklist; progress: Progress }>(`/api/jobs/${params.id}`, { method: "POST", json: body });
      setD((cur) => (cur ? { ...cur, checklist: r.checklist, progress: r.progress } : cur));
    } catch (e: any) { setToast(e.message); } finally { busy.current--; }
  }

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading job...</>}</div>;
  const { job, checklist: c, sop, progress } = d;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      <Link href="/jobs" className="text-sm text-slate-500 flex items-center gap-1"><ArrowLeft size={16} /> All jobs</Link>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1">
        <div className="text-xs font-bold text-slate-400">
          {fmtDay(job.start)} {fmtTime(job.start)} · {job.crew ? CREW_LABEL[job.crew] : job.assignedNames.join(", ") || "Unassigned"}
          {job.jobNumber ? ` · Jobber #${job.jobNumber}` : ""}{job.source === "sample" ? " · sample" : ""}
        </div>
        <h1 className="text-xl font-extrabold" style={{ color: NAVY }}>{job.client || job.title}</h1>
        <div className="text-sm text-slate-600">{job.title}</div>
        {job.address && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer"
            className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}>
            <Navigation size={14} /> {job.address}
          </a>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-bold">{sop.title}</h2>
        <span className="text-sm text-slate-500">{progress.done}/{progress.total} done</span>
      </div>

      <ul className="space-y-2">
        {sop.items.map((item) => {
          const e = c.items[item.id] || { done: false, photos: [] };
          return (
            <li key={item.id} className={`bg-white rounded-xl border p-3 space-y-2 ${e.done ? "border-green-300" : item.required ? "border-red-200" : "border-slate-200"}`}>
              <div className="flex gap-3 items-start">
                <button aria-label={e.done ? "Uncheck" : "Check"}
                  onClick={() => (item.photo && !e.photos.length ? setToast("Add a photo first.") : update({ itemId: item.id, done: !e.done }))}
                  className={`w-8 h-8 shrink-0 rounded-lg border-2 flex items-center justify-center ${e.done ? "bg-green-600 border-green-600 text-white" : "border-slate-300"}`}>
                  {e.done && <Check size={20} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${e.done ? "text-slate-500" : ""}`}>{item.text}</div>
                  <div className="flex gap-2 text-xs mt-0.5">
                    {item.required && <span className="font-bold text-red-600">REQUIRED</span>}
                    {item.photo && <span className="font-bold flex items-center gap-1" style={{ color: NAVY }}><Camera size={12} /> PHOTO</span>}
                    {e.done && e.byName && <span className="text-slate-400">{e.byName}, {ago(e.at!)}</span>}
                  </div>
                </div>
              </div>
              {item.noteLabel && (
                <input defaultValue={e.note || ""} placeholder={item.noteLabel}
                  onBlur={(ev) => ev.target.value !== (e.note || "") && update({ itemId: item.id, note: ev.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              )}
              {(item.photo || e.photos.length > 0) && (
                <div className="flex gap-2 flex-wrap items-center">
                  {e.photos.map((u) => (
                    <div key={u} className="relative">
                      <img src={u} alt="" onClick={() => setViewer(u)} className="w-16 h-16 object-cover rounded-md cursor-pointer" />
                      <button onClick={() => update({ itemId: item.id, removePhoto: u })} aria-label="Remove photo"
                        className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5"><X size={12} /></button>
                    </div>
                  ))}
                  <PhotoButton folder={`jobs/${job.id}/${item.id}`} label={e.photos.length ? "More" : "Add photo"} className="text-sm py-2"
                    onUploaded={(urls) => update({ itemId: item.id, addPhotos: urls, ...(item.photo ? { done: true } : {}) })} />
                </div>
              )}
              {!item.photo && !e.photos.length && (
                <PhotoButton folder={`jobs/${job.id}/${item.id}`} label="Photo" className="text-xs !py-1 !px-2" color="#64748B"
                  onUploaded={(urls) => update({ itemId: item.id, addPhotos: urls })} />
              )}
            </li>
          );
        })}
      </ul>

      {toast && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{toast}</div>}

      {c.completedAt ? (
        <div className="bg-green-50 text-green-800 rounded-xl p-4 flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2 font-semibold"><CheckCircle2 /> Done by {c.completedBy}, {ago(c.completedAt)}</span>
          <button className="text-sm underline" onClick={() => update({ reopen: true })}>Reopen</button>
        </div>
      ) : (
        <button onClick={() => update({ complete: true })} disabled={progress.requiredLeft.length > 0}
          className="w-full rounded-xl py-3.5 font-bold text-white disabled:opacity-40" style={{ background: "#1F9D55" }}>
          {progress.requiredLeft.length ? `${progress.requiredLeft.length} required box${progress.requiredLeft.length > 1 ? "es" : ""} left` : "Mark job done"}
        </button>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewer("")}>
          <img src={viewer} alt="" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}
