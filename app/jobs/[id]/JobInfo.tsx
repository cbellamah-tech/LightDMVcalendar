"use client";

import { useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Package, StickyNote } from "lucide-react";
import { NAVY } from "@/components/ui";
import type { DetailFile, JobDetail } from "../types";

/** Everything the crew needs from Jobber and Drive: repeat or new, bin, last takedown photos, notes, line items. No prices. */
export default function JobInfo({ d, onView }: { d: JobDetail; onView: (url: string) => void }) {
  const [allLines, setAllLines] = useState(false);
  const bins = d.drive.bins;
  const lines = d.lines.filter((l) => l.name.trim().toUpperCase() !== "NOTE" || l.description);
  const shown = allLines ? lines : lines.slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-extrabold px-2 py-1 rounded ${d.repeat ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
            {d.repeat ? "REPEAT CUSTOMER" : "NEW CUSTOMER"}
          </span>
          {bins.map((b) => (
            <span key={b.bin} className="text-xs font-extrabold px-2 py-1 rounded text-white flex items-center gap-1" style={{ background: NAVY }}>
              <Package size={12} /> BIN {b.bin}{b.status ? ` · ${b.status}` : ""}
            </span>
          ))}
          {d.quoteNumber && <span className="text-xs text-slate-400">Quote #{d.quoteNumber}</span>}
        </div>
        {d.repeatWhy && <p className="text-xs text-slate-500">{d.repeatWhy}.</p>}
        {d.repeat && !bins.length && <p className="text-xs text-amber-700">No bin number found in Jobber notes or the bin list. Check the storage unit.</p>}

        {d.drive.photos.length > 0 && (
          <div>
            <div className="text-xs font-bold uppercase text-slate-400 mb-1.5">Last takedown photos</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {d.drive.photos.slice(0, 8).map((p) => (
                <a key={p.fileId} href={p.link} target="_blank" rel="noreferrer" className="shrink-0 w-28">
                  <img src={p.thumb} alt={p.title} className="w-28 h-28 object-cover rounded-lg bg-slate-100"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="text-[11px] text-slate-500 truncate">{p.year} · {p.title}{p.sure ? "" : " (possible)"}</div>
                </a>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">Opens in Google Drive. Sign in with the Light DMV Google account if it asks.</p>
          </div>
        )}
      </div>

      {(d.instructions || d.notes.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="font-bold flex items-center gap-2"><StickyNote size={16} /> Notes</div>
          {d.instructions && <Note label="Job instructions" text={d.instructions} />}
          {d.notes.map((n, i) => (
            <div key={i}>
              <Note label={n.from === "quote" ? "Quote note" : "Job note"} text={n.message} />
              <Files files={n.files} onView={onView} />
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="font-bold flex items-center gap-2"><FileText size={16} /> What we're installing</div>
          {shown.map((l, i) => (
            <div key={i} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div className="font-semibold text-sm">{l.quantity && l.quantity > 1 ? `${l.quantity} × ` : ""}{l.name}</div>
              {l.description && <p className="text-sm text-slate-600 whitespace-pre-line">{l.description}</p>}
              <Files files={l.images} onView={onView} />
            </div>
          ))}
          {lines.length > shown.length && (
            <button className="text-sm underline text-slate-600" onClick={() => setAllLines(true)}>Show all {lines.length}</button>
          )}
        </div>
      )}
      {d.error && <p className="text-xs text-slate-400">Couldn't refresh from Jobber just now ({d.error}).</p>}
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="text-sm">
      <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

function Files({ files, onView }: { files: DetailFile[]; onView: (url: string) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex gap-2 flex-wrap mt-1.5">
      {files.map((f, i) => f.image ? (
        <button key={i} onClick={() => onView(f.url)} className="w-20 h-20 rounded-md overflow-hidden bg-slate-100">
          <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
        </button>
      ) : (
        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="text-xs underline flex items-center gap-1">
          {/\.pdf$/i.test(f.name) ? <FileText size={12} /> : <ImageIcon size={12} />} {f.name} <ExternalLink size={10} />
        </a>
      ))}
    </div>
  );
}
