"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { fmtTime } from "@/lib/installCourse";
import { Card, H1, Spinner } from "../../training/parts";

type Row = { key: string; title: string; pages: number; seen: number; secs: number; done: number | null; quiz: { tries: number; best: number; passed?: number; attempts?: { at: number; pct: number }[] } | null; started: number | null; lastAt: number | null; videos: number; signedOff: { by: string; at: number } | null; lessons: { title: string; secs: number; seen: boolean }[] };
type Person = { uid: string; name: string; role?: string; last: number | null; current: string; secs: number; modules: Row[] };

/** Owners: who has gone through the installer course, lesson by lesson, and how long they spent on each page. */
export default function InstallTeam() {
  const [d, setD] = useState<{ me: string; people: Person[] } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api<{ me: string; people: Person[] }>("/api/install/team").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const sign = async (uid: string, module: string, undo: boolean) => { await api("/api/install/signoff", { method: "POST", json: { uid, module, undo } }).catch((e) => setErr(e.message)); load(); };
  if (err) return <div className="p-4 text-red-600">{err}</div>;
  if (!d) return <Spinner />;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/install" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Installer course</Link>
      <H1 sub="Time counts only while a lesson is on screen and in use. Sign people off after you watch them do it on a real job.">Installer course: team progress</H1>
      {!d.people.length && <Card><p className="text-slate-600">Nobody has opened the course yet.</p></Card>}
      {d.people.map((p) => {
        const done = p.modules.filter((m) => m.done).length;
        return (
          <Card key={p.uid} className="space-y-2">
            <button className="w-full text-left" onClick={() => setOpen(open === p.uid ? null : p.uid)}>
              <div className="flex items-center justify-between gap-3">
                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-slate-600">{done} of {p.modules.length} done · {fmtTime(p.secs)}</div>
              </div>
              <div className="text-xs text-slate-500">On: {p.current}{p.last ? ` · last active ${new Date(p.last).toLocaleString()}` : ""} · tap for lesson detail</div>
            </button>
            <div className="space-y-1.5">
              {p.modules.map((m) => (
                <div key={m.key}>
                  <div className="flex items-center gap-2 text-sm">
                    {m.signedOff ? <CheckCircle2 size={16} className="text-emerald-700 fill-emerald-100 shrink-0" /> : m.done ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${m.seen ? "border-amber-400" : "border-slate-300"}`} />}
                    <span className="flex-1 min-w-0 truncate">{m.title.replace(/^Module\s*/i, "")}</span>
                    <span className="text-slate-500 shrink-0 text-xs">{m.done ? "done" : `${m.seen}/${m.pages}`}{m.quiz && m.quiz.tries ? ` · ${m.quiz.best}%` : ""} · {fmtTime(m.secs)}</span>
                  </div>
                  {open === p.uid && (m.seen > 0 || m.done) && (
                    <div className="pl-6 text-xs text-slate-500 space-y-0.5 mt-1">
                      <div>{m.done ? `Done ${new Date(m.done).toLocaleDateString()} · ` : ""}{m.quiz?.tries ? `Quiz best ${m.quiz.best}% in ${m.quiz.tries} tr${m.quiz.tries === 1 ? "y" : "ies"} · ` : ""}First opened {m.started ? new Date(m.started).toLocaleString() : "-"} · last {m.lastAt ? new Date(m.lastAt).toLocaleString() : "-"} · {m.videos} video{m.videos === 1 ? "" : "s"} played</div>
                      {m.quiz?.attempts?.length ? <div>Quiz tries: {m.quiz.attempts.map((a) => `${a.pct}%`).join(", ")}</div> : null}
                      <div className="flex items-center gap-2">
                        {m.signedOff ? <span className="text-emerald-700">Signed off by {m.signedOff.by} on {new Date(m.signedOff.at).toLocaleDateString()}</span> : <span>Not signed off on a real job yet</span>}
                        {p.uid !== d.me && <button className="underline" onClick={() => sign(p.uid, m.key, !!m.signedOff)}>{m.signedOff ? "Undo" : "Sign off"}</button>}
                      </div>
                      {m.lessons.map((l, i) => <div key={i} className="flex justify-between gap-2"><span className={l.seen ? "" : "text-slate-300"}>{l.title}</span><span>{l.seen ? fmtTime(l.secs) : "not opened"}</span></div>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
