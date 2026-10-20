"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, NotebookPen, RefreshCw } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { crewNoteText, dayLabel, type CrewNote as Crew, type DayNotes } from "@/lib/crewNoteFormat";
import Bring from "./Bring";

const KIND = { install: "Install", takedown: "Takedown", fix: "Fix" } as const;

/** The crew note: written every evening for tomorrow's stops, shown for today until 2 PM. */
export default function CrewNote({ office, crew }: { office: boolean; crew: string }) {
  const [want, setWant] = useState<"" | "today" | "tomorrow">("");
  const [d, setD] = useState<{ day: string; notes: DayNotes | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => api<{ day: string; notes: DayNotes | null }>(`/api/jobs/crew-notes${want ? `?day=${want}` : ""}`).then(setD).catch((e) => setMsg(e.message)), [want]);
  useEffect(() => { load(); }, [load]);

  const rebuild = async () => {
    setBusy(true); setMsg("");
    try { setD(await api(`/api/jobs/crew-notes?day=${d!.day}`, { method: "POST" })); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  if (!d) return null;
  const crews = (d.notes?.crews ?? []).filter((c) => crew === "all" || c.crew === crew);
  const isToday = d.day === new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-extrabold flex items-center gap-2" style={{ color: NAVY }}>
          <NotebookPen size={18} /> Crew note · {isToday ? "today" : dayLabel(d.day)}
        </h2>
        <div className="flex items-center gap-1 text-xs">
          <button onClick={() => setWant(isToday ? "tomorrow" : "today")} className="font-semibold underline text-slate-600 px-1">
            {isToday ? "Tomorrow's" : "Today's"}
          </button>
          {office && (
            <button onClick={rebuild} disabled={busy} className="flex items-center gap-1 font-semibold text-slate-600 border border-slate-300 rounded-lg px-2 py-1">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Write it again
            </button>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-red-700">{msg}</p>}
      {!d.notes && <p className="text-sm text-slate-500">Writing it now. Check back in a minute.</p>}
      {d.notes && !crews.length && <p className="text-sm text-slate-500">No stops {isToday ? "today" : `on ${dayLabel(d.day)}`}.</p>}
      {crews.map((c) => <CrewBlock key={c.crew} c={c} day={d.day} />)}
      {d.notes && (
        <p className="text-xs text-slate-400">
          Written {ago(d.notes.at)} from Jobber and Drive. Rewrites itself each evening and when Jobber changes.
          {office && !d.notes.ai && " Add a Claude key on any customer page to boil the notes down to a short heads-up."}
        </p>
      )}
    </section>
  );
}

function CrewBlock({ c, day }: { c: Crew; day: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(crewNoteText(c, day)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-sm text-slate-500 uppercase">{c.label} · {c.jobs.length} stop{c.jobs.length === 1 ? "" : "s"}</h3>
        <button onClick={copy} className="text-xs font-semibold flex items-center gap-1 text-slate-600 border border-slate-300 rounded-lg px-2 py-1">
          <Copy size={12} /> {copied ? "Copied" : "Copy for a text"}
        </button>
      </div>
      <ol className="space-y-2">
        {c.jobs.map((j, i) => (
          <li key={j.jobId}>
            <Link href={`/jobs/${j.jobId}`} className="block rounded-xl border border-slate-200 p-3 hover:shadow-md">
              <div className="text-xs font-bold text-slate-400">{i + 1}. {j.time || "Any time"} · {KIND[j.kind]}</div>
              <div className="font-bold">{j.client}</div>
              <div className="text-sm text-slate-500">{j.address}</div>
              <ul className="mt-1 text-sm list-disc pl-5 space-y-0.5">
                {j.lines.map((l, k) => <li key={k}>{l}</li>)}
                {(j.headsUp.length ? j.headsUp : j.notes).map((n, k) => <li key={`n${k}`} className="text-amber-900">{n}</li>)}
              </ul>
            </Link>
          </li>
        ))}
      </ol>
      {c.bring.length > 0 && <Bring fold lists={[c.bring]} title={`Load the van · ${c.label}`} />}
      {c.notRead > 0 && <p className="text-xs text-slate-500">{c.notRead} install{c.notRead > 1 ? "s" : ""} not read from Jobber yet, so not in the load list.</p>}
    </div>
  );
}
