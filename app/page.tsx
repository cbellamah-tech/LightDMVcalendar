"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, X, Check, Trash2, Pencil, ChevronLeft, ChevronRight,
  Repeat, Loader2, Cloud, CloudOff,
} from "lucide-react";
import autoPostData from "./data/autoposts.json";

/* ---------------- Brand ---------------- */
const NAVY = "#112E5B";
const NAVY_DK = "#0B1F3D";
const RED = "#F10800";
const INK = "#1A2233";
const PAPER = "#F5F7FA";
const LINE = "#E2E8F0";

const CATEGORIES: Record<string, string> = {
  Social: "#0E7C7B", GBP: "#1F9D55", Ads: "#F10800", Content: "#7C3AED",
  Inventory: "#C8742B", Taxes: "#475569", Reviews: "#CA8A04", Ops: "#2563EB",
};
const CATEGORY_NAMES = Object.keys(CATEGORIES);
const PEOPLE = ["Chris", "Liam", "Both"];
const PERSON_COLOR: Record<string, string> = { Chris: NAVY, Liam: "#0E7C7B", Both: "#64748B" };
const FREQS = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const QUARTER_MONTHS = [0, 3, 6, 9];

type Task = {
  id: string; title: string; category: string; assignee: string;
  freq: string; daysOfWeek?: number[]; dayOfMonth?: number; month?: number; notes?: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);

const SEED: Task[] = [
  { id: uid(), title: "Film / post a reel or video", category: "Social", assignee: "Chris", freq: "weekly", daysOfWeek: [2,4], notes: "Install clips, roofline reveals, before/after." },
  { id: uid(), title: "Add new photos to GBP", category: "GBP", assignee: "Liam", freq: "weekly", daysOfWeek: [5], notes: "Fresh install photos signal activity." },
  { id: uid(), title: "Review & optimize Google Ads", category: "Ads", assignee: "Chris", freq: "weekly", daysOfWeek: [1], notes: "Spend, search terms, negatives. Daily in season." },
  { id: uid(), title: "Check Meta / Facebook ads", category: "Ads", assignee: "Chris", freq: "weekly", daysOfWeek: [3], notes: "Pacing, creative fatigue, CPL." },
  { id: uid(), title: "Launch new ad creative", category: "Ads", assignee: "Chris", freq: "monthly", dayOfMonth: 1, notes: "Refresh the hook before it fatigues." },
  { id: uid(), title: "Publish blog post", category: "Content", assignee: "Both", freq: "monthly", dayOfMonth: 10, notes: "Local angle, target a city/neighborhood." },
  { id: uid(), title: "Send review-request texts", category: "Reviews", assignee: "Liam", freq: "weekly", daysOfWeek: [5], notes: "Recent jobs. Keep velocity +2–3/mo." },
  { id: uid(), title: "Order product from China", category: "Inventory", assignee: "Chris", freq: "quarterly", dayOfMonth: 5, notes: "Long lead time — plan a season ahead." },
  { id: uid(), title: "File sales tax (VA / MD / DC)", category: "Taxes", assignee: "Liam", freq: "monthly", dayOfMonth: 20, notes: "VA seasonal filer Oct–Dec. CRN FR0003375239." },
  { id: uid(), title: "QuickBooks reconciliation", category: "Taxes", assignee: "Liam", freq: "monthly", dayOfMonth: 5, notes: "Reconcile bank/cards w/ Bienestar." },
  { id: uid(), title: "Quarterly estimated taxes", category: "Taxes", assignee: "Chris", freq: "quarterly", dayOfMonth: 15, notes: "IRS dates: ~Apr 15, Jun 15, Sep 15, Jan 15 — verify." },
  { id: uid(), title: "Annual return — books to CPA", category: "Taxes", assignee: "Chris", freq: "yearly", month: 2, dayOfMonth: 1, notes: "Send everything to Bienestar (S-Corp)." },
  { id: uid(), title: "Update KPI dashboard", category: "Ops", assignee: "Chris", freq: "monthly", dayOfMonth: 1, notes: "Jobber + GHL exports → revenue, close rate, ROAS." },
];

/* ---------------- Date helpers ---------------- */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const daysInMonth = (y: number, m: number) => new Date(y, m+1, 0).getDate();
const clampDom = (y: number, m: number, dom: number) => Math.min(dom, daysInMonth(y, m));

function taskDueOn(task: Task, date: Date) {
  const dow = date.getDay(), dom = date.getDate(), mon = date.getMonth(), y = date.getFullYear();
  switch (task.freq) {
    case "daily": return true;
    case "weekly": return (task.daysOfWeek || []).includes(dow);
    case "monthly": return dom === clampDom(y, mon, task.dayOfMonth || 1);
    case "quarterly": return QUARTER_MONTHS.includes(mon) && dom === clampDom(y, mon, task.dayOfMonth || 1);
    case "yearly": return mon === (task.month ?? 0) && dom === clampDom(y, mon, task.dayOfMonth || 1);
    default: return false;
  }
}
function recurrenceLabel(t: Task) {
  switch (t.freq) {
    case "daily": return "Every day";
    case "weekly": return "Weekly · " + (t.daysOfWeek || []).map(d => DOW[d]).join(", ");
    case "monthly": return `Monthly · day ${t.dayOfMonth}`;
    case "quarterly": return `Quarterly · Jan/Apr/Jul/Oct day ${t.dayOfMonth}`;
    case "yearly": return `Yearly · ${MONTHS[t.month ?? 0]} ${t.dayOfMonth}`;
    default: return t.freq;
  }
}

/* ---------------- Auto-posts data ---------------- */
type AutoPost = {
  id: string; platform: string; date: string; time: string;
  category: string; short: string; caption: string; image: string;
};
const AUTO_POSTS: AutoPost[] = (((autoPostData as any).posts || []) as AutoPost[]);
const autoPostsForDate = (date: Date) => AUTO_POSTS.filter(p => p.date === ymd(date));

/* Seed tasks that are now handled by external automation — removed on load. */
const RETIRED_TASK_TITLES = ["Google Business Profile post", "Social media post (IG / FB)"];

/* ---------------- Data layer (shared DB) ---------------- */
async function fetchBoard() {
  const r = await fetch("/api/board", { cache: "no-store" });
  return r.json();
}
async function saveBoard(tasks: Task[], done: Record<string, boolean>) {
  await fetch("/api/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks, done }),
  });
}

/* ================================================================== */
export default function OpsCalendar() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState(new Date());
  const [filter, setFilter] = useState("All");
  const [dayPanel, setDayPanel] = useState<Date | null>(null);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<"idle"|"saving"|"error">("idle");
  const editingRef = useRef(false);
  editingRef.current = !!editing || !!dayPanel;

  /* initial load */
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchBoard();
        if (!data.tasks) { setTasks(SEED); await saveBoard(SEED, {}); }
        else {
          const loaded: Task[] = data.tasks;
          // One-time cleanup: drop tasks now handled by external automation.
          const needsCleanup = loaded.some((t: Task) => RETIRED_TASK_TITLES.includes(t.title));
          if (needsCleanup) {
            const cleaned = loaded.filter((t: Task) => !RETIRED_TASK_TITLES.includes(t.title));
            setTasks(cleaned);
            await saveBoard(cleaned, data.done || {});
          } else {
            setTasks(loaded);
          }
        }
        setDone(data.done || {});
      } catch {
        setTasks(SEED);
      }
      setReady(true);
    })();
  }, []);

  /* poll for the other person's changes every 20s (skip while editing) */
  useEffect(() => {
    const iv = setInterval(async () => {
      if (editingRef.current) return;
      try {
        const data = await fetchBoard();
        if (data.tasks) setTasks(data.tasks);
        setDone(data.done || {});
      } catch {}
    }, 20000);
    return () => clearInterval(iv);
  }, []);

  const persist = useCallback(async (nextTasks: Task[], nextDone: Record<string, boolean>) => {
    setSync("saving");
    try { await saveBoard(nextTasks, nextDone); setSync("idle"); }
    catch { setSync("error"); }
  }, []);

  const updateTasks = (next: Task[]) => { setTasks(next); persist(next, done); };
  const updateDone = (next: Record<string, boolean>) => { setDone(next); persist(tasks || [], next); };

  const matchesFilter = useCallback((t: Task) =>
    filter === "All" || t.assignee === filter || t.assignee === "Both", [filter]);
  const tasksForDate = useCallback((date: Date) =>
    (tasks || []).filter(t => matchesFilter(t) && taskDueOn(t, date)), [tasks, matchesFilter]);

  const doneKey = (taskId: string, date: Date) => `${taskId}|${ymd(date)}`;
  const isDone = (taskId: string, date: Date) => !!done[doneKey(taskId, date)];
  const toggleDone = (taskId: string, date: Date) => {
    const k = doneKey(taskId, date);
    const next = { ...done };
    if (next[k]) delete next[k]; else next[k] = true;
    updateDone(next);
  };

  const grid = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [cursor]);

  if (!ready || tasks === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-32 text-slate-500" style={{ minHeight: "100vh" }}>
        <Loader2 className="animate-spin" size={18} /> Loading the board…
      </div>
    );
  }

  const today = new Date();
  const m = cursor.getMonth();
  const shiftMonth = (n: number) => { const d = new Date(cursor); d.setMonth(d.getMonth()+n); setCursor(d); };

  return (
    <div className="min-h-screen" style={{ background: PAPER, color: INK }}>
      {/* Header */}
      <div style={{ background: NAVY }} className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <div style={{ background: RED }} className="w-2 h-8 rounded-sm" />
          <div>
            <div className="font-extrabold text-lg leading-none text-white" style={{ letterSpacing: ".02em" }}>
              LightDMV Ops Calendar
            </div>
            <div className="text-xs mt-1" style={{ color: "#9FB3D1" }}>Chris &amp; Liam · recurring tasks</div>
          </div>
        </div>

        <div style={{ background: NAVY_DK }} className="flex rounded-lg p-1">
          {["All","Chris","Liam"].map(p => (
            <button key={p} onClick={() => setFilter(p)}
              style={{ background: filter===p ? "white":"transparent", color: filter===p ? NAVY : "#9FB3D1" }}
              className="px-3 py-1.5 rounded-md text-sm font-semibold transition">{p}</button>
          ))}
        </div>

        <button onClick={() => setDayPanel(new Date())}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white border border-white/25 hover:bg-white/10">
          Today
        </button>
        <button onClick={() => setEditing("new")} style={{ background: "white", color: NAVY }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold">
          <Plus size={16} /> Add task
        </button>
      </div>

      {/* Month controls */}
      <div className="px-4 sm:px-6 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => shiftMonth(-1)} style={{ borderColor: LINE }}
          className="w-9 h-9 rounded-lg border flex items-center justify-center bg-white hover:bg-slate-50">
          <ChevronLeft size={18} />
        </button>
        <div className="font-extrabold text-2xl mr-auto" style={{ color: NAVY }}>
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <SyncBadge state={sync} />
        <button onClick={() => setCursor(new Date())} style={{ color: NAVY, borderColor: LINE }}
          className="text-sm font-semibold border rounded-lg px-3 py-2 bg-white hover:bg-slate-50">This month</button>
        <button onClick={() => shiftMonth(1)} style={{ borderColor: LINE }}
          className="w-9 h-9 rounded-lg border flex items-center justify-center bg-white hover:bg-slate-50">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar */}
      <div className="px-4 sm:px-6 pb-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map(d => <div key={d} className="text-center text-xs font-bold text-slate-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d, i) => {
            const inMonth = d.getMonth() === m;
            const isT = sameDay(d, today);
            const dayTasks = tasksForDate(d);
            const allDone = dayTasks.length > 0 && dayTasks.every(t => isDone(t.id, d));
            const dayAuto = autoPostsForDate(d);
            return (
              <button key={i} onClick={() => setDayPanel(d)}
                style={{
                  background: inMonth ? "white" : "#EEF1F5",
                  borderColor: isT ? RED : LINE,
                  borderWidth: isT ? 2 : 1, opacity: inMonth ? 1 : .5,
                }}
                className="rounded-lg border p-1.5 text-left flex flex-col gap-1 hover:shadow-md transition min-h-[84px] sm:min-h-[104px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: isT ? RED : INK }} className="text-xs font-bold">{d.getDate()}</span>
                  {allDone && <Check size={13} color={CATEGORIES.GBP} strokeWidth={3} />}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} className="flex items-center gap-1">
                      <span style={{ background: CATEGORIES[t.category] }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                      <span style={{ textDecoration: isDone(t.id, d) ? "line-through" : "none", color: isDone(t.id,d) ? "#94A3B8" : "#475569" }}
                        className="text-[10px] truncate leading-tight">{t.title}</span>
                    </div>
                  ))}
                  {dayTasks.length > 3 && <span className="text-[10px] text-slate-400 font-semibold">+{dayTasks.length - 3} more</span>}

                  {dayAuto.length > 0 && (
                    <div style={{ background: "#F1F5F9", borderColor: LINE }}
                      className="mt-0.5 rounded-md border px-1 py-0.5 flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide leading-tight" style={{ color: "#94A3B8" }}>Auto Post FB &amp; GBP:</span>
                      {dayAuto.slice(0, 2).map(p => (
                        <div key={p.id} className="flex items-center gap-1">
                          <span style={{ background: "#94A3B8" }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                          <span style={{ color: "#64748B" }} className="text-[10px] truncate leading-tight">{p.short}</span>
                        </div>
                      ))}
                      {dayAuto.length > 2 && <span className="text-[10px] font-semibold" style={{ color: "#94A3B8" }}>+{dayAuto.length - 2} more auto-posts</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 sm:px-6 pb-6 flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Repeat size={13} /> Categories:</span>
        {CATEGORY_NAMES.map(c => (
          <span key={c} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span style={{ background: CATEGORIES[c] }} className="w-2.5 h-2.5 rounded-full inline-block" />{c}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-600 ml-1">
          <span style={{ background: "#94A3B8" }} className="w-2.5 h-2.5 rounded-full inline-block" />Auto-posts
        </span>
      </div>

      {/* Day panel */}
      {dayPanel && (
        <DayPanel
          date={dayPanel} today={today} tasks={tasksForDate(dayPanel)}
          isDone={isDone} toggleDone={toggleDone}
          onClose={() => setDayPanel(null)} onEdit={(t) => { setEditing(t); }}
        />
      )}

      {/* Add / edit modal */}
      {editing && (
        <TaskModal
          initial={editing === "new" ? null : (editing as Task)}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            if (t.id && (tasks || []).some(x => x.id === t.id)) updateTasks((tasks || []).map(x => x.id === t.id ? t : x));
            else updateTasks([...(tasks || []), { ...t, id: uid() }]);
            setEditing(null);
          }}
          onDelete={(id) => { updateTasks((tasks || []).filter(x => x.id !== id)); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ---------------- Sync badge ---------------- */
function SyncBadge({ state }: { state: "idle"|"saving"|"error" }) {
  if (state === "saving")
    return <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 size={13} className="animate-spin"/> Saving</span>;
  if (state === "error")
    return <span className="flex items-center gap-1 text-xs text-red-500"><CloudOff size={13}/> Not saved</span>;
  return <span className="flex items-center gap-1 text-xs text-slate-400"><Cloud size={13}/> Synced</span>;
}

/* ---------------- Day panel (slide-over) ---------------- */
function DayPanel({ date, today, tasks, isDone, toggleDone, onClose, onEdit }: any) {
  const isToday = sameDay(date, today);
  const doneCount = tasks.filter((t: Task) => isDone(t.id, date)).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const dayAuto = autoPostsForDate(date);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(11,31,61,.45)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col">
        <div style={{ background: NAVY }} className="px-5 py-4 flex items-center justify-between sticky top-0">
          <div>
            <div className="text-white font-extrabold text-lg leading-none">
              {date.toLocaleDateString(undefined, { weekday: "long" })}
              {isToday && <span style={{ background: RED }} className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full align-middle text-white">TODAY</span>}
            </div>
            <div className="text-xs mt-1" style={{ color: "#9FB3D1" }}>
              {date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-5 flex-1">
          {tasks.length > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                <span>{doneCount} of {tasks.length} done</span><span>{pct}%</span>
              </div>
              <div style={{ background: LINE }} className="h-2 rounded-full overflow-hidden">
                <div style={{ background: pct === 100 ? CATEGORIES.GBP : RED, width: `${pct}%` }} className="h-full transition-all" />
              </div>
            </div>
          )}

          {tasks.length === 0 && dayAuto.length === 0 ? (
            <div style={{ borderColor: LINE }} className="border-2 border-dashed rounded-xl py-12 text-center">
              <div className="text-slate-600 font-semibold">Nothing scheduled.</div>
              <div className="text-slate-400 text-sm mt-1">Add a recurring task with the button up top.</div>
            </div>
          ) : tasks.length === 0 ? null : (
            <div className="space-y-2">
              {tasks.map((t: Task) => {
                const checked = isDone(t.id, date);
                return (
                  <div key={t.id} style={{ borderColor: LINE, opacity: checked ? .6 : 1 }}
                    className="group flex items-start gap-3 border rounded-xl p-3">
                    <button onClick={() => toggleDone(t.id, date)}
                      style={{ background: checked ? CATEGORIES.GBP : "white", borderColor: checked ? CATEGORIES.GBP : "#CBD5E1" }}
                      className="mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition">
                      {checked && <Check size={15} color="white" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ textDecoration: checked ? "line-through" : "none" }} className="font-semibold text-[15px]">{t.title}</span>
                        <span style={{ background: CATEGORIES[t.category] + "22", color: CATEGORIES[t.category] }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full">{t.category}</span>
                      </div>
                      {t.notes && <div className="text-slate-500 text-xs mt-1">{t.notes}</div>}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: PERSON_COLOR[t.assignee] }}>
                          <span style={{ background: PERSON_COLOR[t.assignee] }} className="w-2 h-2 rounded-full inline-block" />{t.assignee}
                        </span>
                        <span className="text-slate-400 text-xs flex items-center gap-1"><Repeat size={11} /> {recurrenceLabel(t)}</span>
                      </div>
                    </div>
                    <button onClick={() => onEdit(t)} className="text-slate-300 hover:text-slate-700 p-1"><Pencil size={15} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {dayAuto.length > 0 && (
            <div style={{ background: "#F1F5F9", borderColor: LINE }} className="mt-4 border rounded-xl p-3">
              <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#94A3B8" }}>
                Auto GBP &amp; FB Post:
              </div>
              <div className="space-y-2">
                {dayAuto.map((p: AutoPost) => (
                  <div key={p.id} style={{ borderColor: LINE }} className="bg-white border rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ background: "#94A3B8" }} className="text-[10px] font-bold text-white px-2 py-0.5 rounded-md">{p.platform}</span>
                      <span className="text-xs font-semibold" style={{ color: "#64748B" }}>{p.time}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#E2E8F0", color: "#64748B" }}>{p.category}</span>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "#475569" }}>{p.short}</div>
                    <div className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "#94A3B8" }}>{p.caption}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Add / edit modal ---------------- */
function TaskModal({ initial, onClose, onSave, onDelete }: any) {
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "Social");
  const [assignee, setAssignee] = useState(initial?.assignee || "Both");
  const [freq, setFreq] = useState(initial?.freq || "weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek || [1]);
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth || 1);
  const [month, setMonth] = useState(initial?.month ?? 0);
  const [notes, setNotes] = useState(initial?.notes || "");

  const toggleDow = (i: number) => setDaysOfWeek(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i].sort());

  const save = () => {
    if (!title.trim()) return;
    const t: Task = { id: initial?.id, title: title.trim(), category, assignee, freq, notes: notes.trim() };
    if (freq === "weekly") t.daysOfWeek = daysOfWeek.length ? daysOfWeek : [1];
    if (freq === "monthly" || freq === "quarterly") t.dayOfMonth = Number(dayOfMonth) || 1;
    if (freq === "yearly") { t.month = Number(month); t.dayOfMonth = Number(dayOfMonth) || 1; }
    onSave(t);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,31,61,.55)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div style={{ background: NAVY }} className="px-5 py-3.5 flex items-center justify-between sticky top-0">
          <span className="text-white font-bold">{initial ? "Edit task" : "New recurring task"}</span>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Task">
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="e.g. Post to Instagram"
              style={{ borderColor: LINE }} className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none focus:border-slate-400" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ borderColor: LINE }}
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none bg-white">
                {CATEGORY_NAMES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Who">
              <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ borderColor: LINE }}
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none bg-white">
                {PEOPLE.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Repeats">
            <div className="flex flex-wrap gap-1.5">
              {FREQS.map(f => (
                <button key={f} onClick={() => setFreq(f)}
                  style={{ background: freq === f ? NAVY : "white", color: freq === f ? "white" : INK, borderColor: LINE }}
                  className="border rounded-lg px-3 py-1.5 text-sm font-semibold capitalize">{f}</button>
              ))}
            </div>
          </Field>
          {freq === "weekly" && (
            <Field label="On these days">
              <div className="flex gap-1.5 flex-wrap">
                {DOW.map((d, i) => (
                  <button key={i} onClick={() => toggleDow(i)}
                    style={{ background: daysOfWeek.includes(i) ? RED : "white", color: daysOfWeek.includes(i) ? "white" : INK, borderColor: LINE }}
                    className="border rounded-lg w-11 h-9 text-xs font-bold">{d}</button>
                ))}
              </div>
            </Field>
          )}
          {(freq === "monthly" || freq === "quarterly") && (
            <Field label={freq === "quarterly" ? "Day (Jan/Apr/Jul/Oct)" : "Day of month"}>
              <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value as any)}
                style={{ borderColor: LINE }} className="w-24 border rounded-lg px-3 py-2 text-[15px] outline-none" />
            </Field>
          )}
          {freq === "yearly" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Month">
                <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ borderColor: LINE }}
                  className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none bg-white">
                  {MONTHS.map((mm, i) => <option key={mm} value={i}>{mm}</option>)}
                </select>
              </Field>
              <Field label="Day">
                <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value as any)}
                  style={{ borderColor: LINE }} className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none" />
              </Field>
            </div>
          )}
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Anything useful to remember"
              style={{ borderColor: LINE }} className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </Field>
        </div>
        <div className="px-5 py-4 flex items-center gap-2 border-t" style={{ borderColor: LINE }}>
          {initial && (
            <button onClick={() => onDelete(initial.id)}
              className="flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg mr-auto">
              <Trash2 size={16} /> Delete
            </button>
          )}
          <button onClick={onClose} className="ml-auto text-sm font-semibold text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={save} style={{ background: RED }} className="text-sm font-bold text-white px-5 py-2 rounded-lg hover:opacity-90">
            {initial ? "Save changes" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
