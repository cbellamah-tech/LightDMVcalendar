"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, CheckCircle2, Loader2, Navigation, X } from "lucide-react";
import PhotoButton from "@/components/PhotoButton";
import { ago, api, fmtDay, fmtTime, NAVY } from "@/components/ui";
import { CREW_LABEL } from "../../signs/types";
import type { Checklist, CrewPay, Job, JobDetail, Progress, SopItem } from "../types";
import { dur } from "../types";
import JobInfo from "./JobInfo";
import PayLine from "./PayLine";
import Expenses from "./Expenses";

type Data = { job: Job; checklist: Checklist; sop: { title: string; items: SopItem[] }; progress: Progress; pay?: CrewPay; parts?: { name: string; images: { url: string; name: string }[] }[] };

export default function JobPage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState("");
  const busy = useRef(0);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  // Jobber notes, line items and Drive bin/photos: once per visit (the checklist re-polls below).
  useEffect(() => {
    api<{ detail: JobDetail | null }>(`/api/jobs/${params.id}?detail=1`).then((r) => setDetail(r.detail)).catch(() => {});
  }, [params.id]);

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
      // Copy the new photos to the customer's folder in Drive in the background; the crew never waits on it.
      if (body.addPhotos) fetch(`/api/jobs/${params.id}/drive`, { method: "POST" }).catch(() => {});
    } catch (e: any) { setToast(e.message); } finally { busy.current--; }
  }

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading job...</>}</div>;
  const { job, checklist: c, sop, progress } = d;
  const parts = d.parts ?? [];

  const thumb = (itemId: string, u: string) => (
    <div key={u} className="relative">
      <img src={u} alt="" onClick={() => setViewer(u)} className="w-16 h-16 object-cover rounded-md cursor-pointer" />
      <button onClick={() => update({ itemId, removePhoto: u })} aria-label="Remove photo"
        className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5"><X size={12} /></button>
    </div>
  );

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
        <PayLine jobId={job.id} kind={job.kind} pay={d.pay} onChange={(pay) => setD((cur) => (cur ? { ...cur, pay } : cur))} />
      </div>

      {(c.arrivedAt || c.completedAt) && (
        <div className="text-sm text-slate-600 bg-white rounded-xl border border-slate-200 px-4 py-2">
          {c.arrivedAt ? <>Arrived {fmtTime(new Date(c.arrivedAt).toISOString())}</> : null}
          {c.completedAt ? <>{c.arrivedAt ? " · " : ""}Done {fmtTime(new Date(c.completedAt).toISOString())}</> : null}
          {c.arrivedAt && c.completedAt ? <> · {dur(c.completedAt - c.arrivedAt)} on site</> : null}
        </div>
      )}

      {detail && <JobInfo d={detail} onView={setViewer} />}

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
                  onClick={() => (item.perPart && parts.length ? setToast("Add a photo of each item below; the box checks itself.") : item.photo && !e.photos.length ? setToast("Add a photo first.") : update({ itemId: item.id, done: !e.done }))}
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
              {item.counts && (
                <div className="grid grid-cols-2 gap-2">
                  {item.counts.map((k) => (
                    <label key={k.key} className="block text-sm">
                      <span className="font-semibold">{k.label}</span>
                      <input inputMode="numeric" defaultValue={e.counts?.[k.key] ?? ""} placeholder="0"
                        onBlur={(ev) => { const v = ev.target.value.replace(/[^\d]/g, ""); if (v !== String(e.counts?.[k.key] ?? "")) update({ itemId: item.id, counts: { [k.key]: v } }); }}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                    </label>
                  ))}
                </div>
              )}
              {item.noteLabel && (
                <input defaultValue={e.note || ""} placeholder={item.noteLabel}
                  onBlur={(ev) => ev.target.value !== (e.note || "") && update({ itemId: item.id, note: ev.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              )}
              {item.perPart && parts.length > 0 && (
                <div className="space-y-2">
                  {!!detail?.quoteMockups?.length && (
                    <div className="flex gap-2 overflow-x-auto items-center">
                      <span className="text-[11px] font-bold uppercase text-slate-400 shrink-0">Quote mockups</span>
                      {detail.quoteMockups.map((u) => (
                        <img key={u} src={u} alt="" onClick={() => setViewer(u)} className="w-24 h-16 object-cover rounded-md cursor-pointer border border-slate-200 shrink-0" />
                      ))}
                    </div>
                  )}
                  {parts.map(({ name: p, images }) => {
                    const mine = e.photos.filter((u) => e.parts?.[u]?.toLowerCase() === p.toLowerCase());
                    return (
                      <div key={p} className={`rounded-lg border p-2 space-y-1.5 ${mine.length ? "border-green-200 bg-green-50/50" : "border-slate-200"}`}>
                        <div className="text-sm font-semibold flex items-center gap-1.5">
                          {mine.length ? <Check size={14} className="text-green-600" /> : <Camera size={14} className="text-slate-400" />} {p}
                        </div>
                        {images.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto items-center">
                            <span className="text-[11px] font-bold uppercase text-slate-400 shrink-0">Design</span>
                            {images.map((f) => (
                              <img key={f.url} src={f.url} alt={f.name} onClick={() => setViewer(f.url)}
                                className="w-24 h-16 object-cover rounded-md cursor-pointer border border-slate-200 shrink-0" />
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap items-center">
                          {images.length > 0 && <span className="text-[11px] font-bold uppercase text-slate-400">Yours</span>}
                          {mine.map((u) => thumb(item.id, u))}
                          <PhotoButton folder={`jobs/${job.id}/${item.id}`} label={mine.length ? "More" : "Add photo"} className="text-sm !py-1.5"
                            onUploaded={(urls) => update({ itemId: item.id, addPhotos: urls, part: p })} />
                        </div>
                      </div>
                    );
                  })}
                  {e.photos.some((u) => !e.parts?.[u]) && (
                    <div className="flex gap-2 flex-wrap">{e.photos.filter((u) => !e.parts?.[u]).map((u) => thumb(item.id, u))}</div>
                  )}
                </div>
              )}
              {(item.photo || e.photos.length > 0) && !(item.perPart && parts.length > 0) && (
                <div className="flex gap-2 flex-wrap items-center">
                  {e.photos.map((u) => thumb(item.id, u))}
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

      <Expenses jobId={job.id} done={!!c.completedAt} onView={setViewer} />

      {viewer && (
        <div className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewer("")}>
          <img src={viewer} alt="" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}
