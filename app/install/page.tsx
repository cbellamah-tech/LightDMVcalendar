"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Users } from "lucide-react";
import { api, Me, NAVY } from "@/components/ui";
import { CourseModule, fmtTime, InstallProgress, toCourse, totalSecs } from "@/lib/installCourse";
import { Block, Blocks, Btn, Card, H1, Spinner } from "../training/parts";
import { PackUpload } from "../training/PackUpload";

type Mod = { title: string; blocks: Block[] };
type Guide = { loaded: boolean; intro?: Block[]; modules?: Mod[]; ownerTodo?: Mod | null };

/** Install tab: the installer course, taken module by module and lesson by lesson. Progress and time are saved on the server. */
export default function InstallCourse() {
  const [g, setG] = useState<Guide | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [prog, setProg] = useState<InstallProgress>({ modules: {} });
  const [open, setOpen] = useState<number | null>(null);
  const load = () => api<Guide>("/api/install").then(setG).catch(() => setG({ loaded: false }));
  const loadProg = () => api<InstallProgress>("/api/install/progress").then(setProg).catch(() => {});
  useEffect(() => { load(); loadProg(); api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  const course = useMemo(() => toCourse(g?.modules ?? []), [g]);
  if (!g) return <Spinner />;
  const office = me?.role === "owner" || me?.role === "manager";

  if (!g.loaded || !g.modules) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <H1 sub="Every step of an install and a takedown.">Installer course</H1>
        <Card>{office ? <PackUpload onDone={load} /> : <p className="text-slate-600">The course isn't loaded yet. Ask Chris or Liam.</p>}</Card>
      </div>
    );
  }
  if (open !== null && course[open]) {
    return <ModuleView m={course[open]} n={open + 1} of={course.length} prog={prog} setProg={setProg}
      onExit={() => { setOpen(null); loadProg(); window.scrollTo(0, 0); }}
      onNext={open + 1 < course.length ? () => { setOpen(open + 1); window.scrollTo(0, 0); } : undefined} />;
  }

  const done = course.filter((m) => prog.modules[m.key]?.done).length;
  const next = course.findIndex((m) => !prog.modules[m.key]?.done);
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <H1>Installer course</H1>
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="font-bold" style={{ color: NAVY }}>{done} of {course.length} modules done</div>
          {office && <Link href="/install/team" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><Users size={16} /> Team progress</Link>}
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(done / Math.max(1, course.length)) * 100}%` }} /></div>
        {next >= 0 && <Btn onClick={() => setOpen(next)}>{done || prog.modules[course[next].key] ? "Continue" : "Start"}: {course[next].title}</Btn>}
      </Card>
      {g.intro && g.intro.length > 0 && <Card><Blocks blocks={g.intro} /></Card>}
      <div className="space-y-2">
        {course.map((m, i) => {
          const p = prog.modules[m.key];
          return (
            <button key={m.key} onClick={() => setOpen(i)} className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              {p?.done ? <CheckCircle2 className="text-emerald-500 shrink-0" /> : <Circle className={`shrink-0 ${p ? "text-amber-400" : "text-slate-300"}`} />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{m.title}</div>
                <div className="text-xs text-slate-500">
                  {m.lessons.length} lessons{p ? ` · ${p.done ? "done" : `${p.seen.length} seen`} · ${fmtTime(totalSecs(p))}` : ""}
                </div>
              </div>
              <ChevronRight className="text-slate-300 shrink-0" />
            </button>
          );
        })}
      </div>
      {office && g.ownerTodo && <Card className="border-amber-300 bg-amber-50"><div className="font-bold mb-2">{g.ownerTodo.title} (only owners see this)</div><Blocks blocks={g.ownerTodo.blocks} /></Card>}
    </div>
  );
}

function ModuleView({ m, n, of, prog, setProg, onExit, onNext }: {
  m: CourseModule; n: number; of: number; prog: InstallProgress; setProg: (p: InstallProgress) => void; onExit: () => void; onNext?: () => void;
}) {
  const mp = prog.modules[m.key];
  const [page, setPage] = useState(() => (mp && !mp.done ? Math.min(Math.max(...mp.seen, 0), m.lessons.length - 1) : 0));
  const [finished, setFinished] = useState(false);
  const tick = useRef(Date.now());
  const last = page === m.lessons.length - 1;

  // Time on page: a beat every 15 s while the page is on screen, and one when leaving the page.
  async function beat(p: number, done = false) {
    const now = Date.now();
    const secs = document.visibilityState === "visible" ? (now - tick.current) / 1000 : 0;
    tick.current = now;
    const r = await api<InstallProgress>("/api/install/progress", { method: "POST", json: { module: m.key, page: p, secs, done } }).catch(() => null);
    if (r) setProg(r);
  }
  useEffect(() => {
    tick.current = Date.now();
    beat(page);
    const t = setInterval(() => beat(page), 15_000);
    const vis = () => { if (document.visibilityState === "visible") tick.current = Date.now(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); beat(page); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, m.key]);

  const go = (p: number) => { setPage(p); window.scrollTo(0, 0); };
  if (finished) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Card className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
          <div className="font-bold text-lg" style={{ color: NAVY }}>{m.title} done</div>
          <p className="text-sm text-slate-600">Time on this module: {fmtTime(totalSecs(prog.modules[m.key]))}. Your crew lead still signs you off on a real job.</p>
          <div className="flex gap-2 justify-center">
            <Btn ghost onClick={onExit}>All modules</Btn>
            {onNext && <Btn onClick={onNext}>Next module</Btn>}
          </div>
        </Card>
      </div>
    );
  }
  const lesson = m.lessons[page];
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <button onClick={onExit} className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> All modules</button>
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Module {n} of {of} · Lesson {page + 1} of {m.lessons.length}</div>
        <h1 className="text-xl font-extrabold" style={{ color: NAVY }}>{m.title.replace(/^Module\s*\d+\.?\s*/i, "")}</h1>
      </div>
      <div className="flex gap-1">{m.lessons.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= page ? "bg-emerald-500" : "bg-slate-200"}`} />)}</div>
      <Card className="space-y-3">
        <h2 className="font-bold text-lg">{lesson.title}</h2>
        <Blocks blocks={lesson.blocks} />
      </Card>
      <div className="flex items-center justify-between gap-2">
        {page > 0 ? <Btn ghost onClick={() => go(page - 1)}>Back</Btn> : <span />}
        <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={12} /> {fmtTime(totalSecs(prog.modules[m.key]))}</span>
        {last
          ? <Btn onClick={async () => { await beat(page, true); setFinished(true); window.scrollTo(0, 0); }}>Finish module</Btn>
          : <Btn onClick={() => go(page + 1)}>Next lesson</Btn>}
      </div>
    </div>
  );
}
