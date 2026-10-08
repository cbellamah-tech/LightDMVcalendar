"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { fmtTime } from "@/lib/installCourse";
import { Card, H1, Spinner } from "../../training/parts";

type Row = { key: string; title: string; pages: number; seen: number; secs: number; done: number | null; quiz: { tries: number; best: number; passed?: number } | null; lessons: { title: string; secs: number; seen: boolean }[] };
type Person = { uid: string; name: string; role?: string; last: number | null; secs: number; modules: Row[] };

/** Owners: who has gone through the installer course, lesson by lesson, and how long they spent on each page. */
export default function InstallTeam() {
  const [d, setD] = useState<{ people: Person[] } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api<{ people: Person[] }>("/api/install/team").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="p-4 text-red-600">{err}</div>;
  if (!d) return <Spinner />;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/install" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Installer course</Link>
      <H1 sub="Time counts only while the lesson is on screen.">Installer course: team progress</H1>
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
              <div className="text-xs text-slate-500">{p.last ? `Last on ${new Date(p.last).toLocaleString()}` : ""}</div>
            </button>
            <div className="space-y-1.5">
              {p.modules.map((m) => (
                <div key={m.key}>
                  <div className="flex items-center gap-2 text-sm">
                    {m.done ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${m.seen ? "border-amber-400" : "border-slate-300"}`} />}
                    <span className="flex-1 min-w-0 truncate">{m.title}</span>
                    <span className="text-slate-500 shrink-0">{m.done ? `done ${new Date(m.done).toLocaleDateString()}` : `${m.seen} of ${m.pages}`}{m.quiz && m.quiz.tries ? ` · quiz ${m.quiz.best}%${m.quiz.tries > 1 ? ` (${m.quiz.tries} tries)` : ""}` : ""} · {fmtTime(m.secs)}</span>
                  </div>
                  {open === p.uid && m.seen > 0 && (
                    <div className="pl-6 text-xs text-slate-500 space-y-0.5 mt-1">
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
