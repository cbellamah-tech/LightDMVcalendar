"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronLeft, ExternalLink, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { ago, api, fmtDay, NAVY } from "@/components/ui";
import type { Cleanup, CleanupGroup } from "@/lib/pipelineCleanup";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const KIND_LINE: Record<CleanupGroup["kind"], string> = {
  master: "Sitting in the same stage a week or more: move it on, mark it won or lost, or take it out.",
  "Waiting on info": "Get the missing info or move them on.",
  "Follow up": "Follow up, then move them to the next stage.",
};

/** The weekly GoHighLevel cleanup: master pipeline deals that stopped moving, and everyone in Waiting on info or Follow up. */
export default function PipelineCleanupPage() {
  const [data, setData] = useState<Cleanup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback((fresh = false) => {
    setBusy(true); setErr("");
    api<Cleanup>(`/api/marketing/pipeline-cleanup${fresh ? "?fresh=1" : ""}`).then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(), [load]);
  const mark = (undo: boolean) => {
    setBusy(true);
    api<Cleanup>("/api/marketing/pipeline-cleanup", { method: "POST", json: { undo } }).then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-8 space-y-4">
      <Link href="/marketing" className="text-sm text-slate-500 flex items-center gap-1"><ChevronLeft size={16} /> Marketing</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Pipeline cleanup</h1>
          <p className="text-sm text-slate-500">Every week: the Master pipeline, and Waiting on info and Follow up in every GoHighLevel pipeline. Tap a name to open them in GoHighLevel.</p>
        </div>
        <button onClick={() => load(true)} disabled={busy} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold flex items-center gap-1.5">
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}
      {!data ? (
        <div className="text-slate-500 flex gap-2"><Loader2 className="animate-spin" /> Reading GoHighLevel...</div>
      ) : !data.configured ? (
        <div className="rounded-xl border bg-white p-4 text-sm">GoHighLevel isn't connected yet.</div>
      ) : (
        <>
          <div className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${data.done ? "bg-green-50 border-green-200" : "bg-white border-slate-200"}`}>
            <div>
              <div className="font-extrabold" style={{ color: data.done ? "#15803d" : NAVY }}>
                {data.done ? `Done for this week, by ${data.done.by}` : `${data.total} deal${data.total === 1 ? "" : "s"} to clean up`}
              </div>
              <div className="text-xs text-slate-500">Week of {fmtDay(`${data.week}T12:00:00`)}{data.at ? ` · read from GoHighLevel ${ago(data.at)}` : ""}</div>
            </div>
            {data.done ? (
              <button onClick={() => mark(true)} disabled={busy} className="text-sm font-bold text-slate-500 flex items-center gap-1"><Undo2 size={15} /> Undo</button>
            ) : (
              <button onClick={() => mark(false)} disabled={busy} className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm font-bold flex items-center gap-1.5"><CheckCircle2 size={16} /> Done for this week</button>
            )}
          </div>
          {!data.masterFound && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No pipeline with "Master" in its name came back from GoHighLevel, so only Waiting on info and Follow up are listed.</div>}
          {data.groups.length === 0 && <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Nothing stuck. The pipelines are clean.</div>}
          {data.groups.map((g) => <Group key={`${g.kind}|${g.pipeline}|${g.stage}`} g={g} url={data.contactUrl} />)}
          {data.errors.length > 0 && <div className="text-xs text-slate-400">{data.errors.join(" · ")}</div>}
        </>
      )}
    </div>
  );
}

function Group({ g, url }: { g: CleanupGroup; url: string }) {
  const [open, setOpen] = useState(g.deals.length <= 8);
  const shown = open ? g.deals : g.deals.slice(0, 8);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-extrabold" style={{ color: NAVY }}>{g.pipeline} · {g.stage}</h2>
        <span className="text-sm font-bold text-amber-800 tabular-nums">{g.deals.length}</span>
      </div>
      <p className="text-xs text-slate-500 pb-1">{KIND_LINE[g.kind]}</p>
      {shown.map((d) => (
        <a key={d.id} href={url + encodeURIComponent(d.contactId)} target="_blank" rel="noreferrer"
          className="flex items-center justify-between gap-2 py-2 border-t border-slate-100 hover:bg-slate-50">
          <span className="min-w-0 truncate font-semibold">{d.name}</span>
          <span className="shrink-0 text-sm text-slate-500 flex items-center gap-2 tabular-nums">
            {d.value > 0 && <span>{money(d.value)}</span>}
            <span className={d.days >= 14 ? "font-bold text-red-700" : d.days >= 7 ? "font-bold text-amber-800" : ""}>{d.days} day{d.days === 1 ? "" : "s"}</span>
            <ExternalLink size={14} />
          </span>
        </a>
      ))}
      {!open && (
        <button onClick={() => setOpen(true)} className="w-full pt-2 text-sm font-bold text-slate-500 flex items-center justify-center gap-1">
          <ChevronDown size={15} /> {g.deals.length - 8} more
        </button>
      )}
    </section>
  );
}
