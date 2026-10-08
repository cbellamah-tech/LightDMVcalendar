"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Wrench } from "lucide-react";
import { api, fmtDay, fmtTime, Me, NAVY } from "@/components/ui";
import { CREW_LABEL } from "../signs/types";
import type { CrewPay, Job, Progress } from "./types";
import { dur } from "./types";
import DrivePhotos from "./DrivePhotos";

type Row = Job & { progress: Progress; arrivedAt?: number; completedAt?: number; info?: { repeat: boolean; bins: string[]; known: boolean }; pay?: CrewPay; expenses?: number; reviews?: number };

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export default function JobsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fixes, setFixes] = useState<Row[]>([]);
  const [fixSheet, setFixSheet] = useState<FixSheet | null>(null);
  const [sample, setSample] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [crew, setCrew] = useState("all");
  const [err, setErr] = useState("");

  const load = useCallback(() => api<{ jobs: Row[]; fixes: Row[]; fixSheet: FixSheet | null; sample: boolean }>("/api/jobs")
    .then((d) => { setRows(d.jobs); setFixes(d.fixes || []); setFixSheet(d.fixSheet); setSample(d.sample); })
    .catch((e) => setErr(e.message)), []);
  useEffect(() => {
    // The home page links straight to one crew's day with ?crew=crew1.
    const c = new URLSearchParams(window.location.search).get("crew");
    if (c) setCrew(c);
    api<Me>("/api/me").then(setMe).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // #fixes from the home page: jump to the fixes box once the list has drawn.
  const loaded = !!rows;
  useEffect(() => { if (loaded && window.location.hash === "#fixes") document.getElementById("fixes")?.scrollIntoView(); }, [loaded]);

  const office = me?.role === "owner" || me?.role === "manager";
  const days = useMemo(() => byDay(rows || [], crew), [rows, crew]);
  const fixDays = useMemo(() => byDay(fixes, crew), [fixes, crew]);
  const openFixes = fixes.filter((f) => !f.completedAt && !f.doneInJobber && (crew === "all" || (f.crew || "none") === crew)).length;

  if (!rows) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading jobs...</>}</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Jobs</h1>
        {office && (
          <select value={crew} onChange={(e) => setCrew(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-sm">
            <option value="all">All crews</option>
            {Object.entries(CREW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="none">No crew matched</option>
          </select>
        )}
      </div>
      {sample && (
        <div className="text-sm bg-amber-50 text-amber-900 rounded-lg p-3">
          These are sample jobs so you can try the checklist. Real jobs show up once Jobber is connected{office ? <> on the <Link className="underline" href="/settings/jobber">Jobber page</Link></> : ""}.
        </div>
      )}
      {office && <DrivePhotos />}
      <section id="fixes" className="scroll-mt-16 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-amber-900 flex items-center gap-2"><Wrench size={18} /> Fixes (service calls){openFixes ? ` · ${openFixes} open` : ""}</h2>
          {fixSheet?.url && (
            <a href={fixSheet.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-amber-900 underline flex items-center gap-1">
              Service Requested Sheet <ExternalLink size={12} />
            </a>
          )}
        </div>
        {fixSheet?.lastError && <p className="text-xs text-red-700">Couldn't add fixes to the Service Requested Sheet: {fixSheet.lastError}</p>}
        {!fixDays.length && <p className="text-sm text-amber-900/70">No fixes scheduled.</p>}
        {fixDays.map(([day, list]) => (
          <div key={day} className="space-y-2">
            <h3 className="font-bold text-amber-900/70 text-xs uppercase">{isPast(list[0].start) && list.some((f) => !f.completedAt && !f.doneInJobber) ? `Overdue · ${fmtDay(list[0].start)}` : fmtDay(list[0].start)}</h3>
            {list.map((j) => <JobCard key={j.id} j={j} fix office={office} />)}
          </div>
        ))}
      </section>

      <h2 className="font-extrabold text-lg pt-1" style={{ color: NAVY }}>Install and takedown jobs</h2>
      {!days.length && <p className="text-slate-500">No jobs scheduled for your crew this week.</p>}
      {days.map(([day, jobs]) => (
        <section key={day} className="space-y-2">
          <h3 className="font-bold text-slate-500 text-sm uppercase flex justify-between gap-2">
            <span>{fmtDay(jobs[0].start)}</span>
            <DayPay jobs={jobs} office={office} />
          </h3>
          {jobs.map((j) => <JobCard key={j.id} j={j} office={office} gap={office ? gapBefore(j, jobs) : undefined} />)}
        </section>
      ))}
    </div>
  );
}

type FixSheet = { url?: string; lastAt?: number; lastError?: string };

const isPast = (iso: string) => { const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(iso) < t; };

function byDay(list: Row[], crew: string) {
  const out = new Map<string, Row[]>();
  for (const j of list) {
    if (crew !== "all" && (j.crew || "none") !== crew) continue;
    const k = new Date(j.start).toDateString();
    out.set(k, [...(out.get(k) || []), j]);
  }
  return [...out.entries()];
}

function JobCard({ j, fix, office, gap }: { j: Row; fix?: boolean; office?: boolean; gap?: number }) {
  return (
    <Link href={`/jobs/${j.id}`} className={`block bg-white rounded-xl border p-4 hover:shadow-md ${fix ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-400">
            {fmtTime(j.start)} · {fix ? "Fix" : j.kind === "install" ? "Install" : "Takedown"} · {j.crew ? CREW_LABEL[j.crew] : j.assignedNames.join(", ") || "Unassigned"}
          </div>
          <div className="font-bold truncate flex items-center gap-2">
            <span className="truncate">{j.client || j.title}</span>
            {j.info && (j.info.repeat || j.info.known) && (
              <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${j.info.repeat ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                {j.info.repeat ? `REPEAT${j.info.bins.length ? ` · BIN ${j.info.bins.join(", ")}` : ""}` : "NEW"}
              </span>
            )}
          </div>
          {fix && j.request && <div className="text-sm font-semibold text-amber-900">{j.request}</div>}
          <div className="text-sm text-slate-500 truncate">{j.address}</div>
          {office && (j.arrivedAt || j.completedAt) && (
            <div className="text-xs text-slate-600">
              {gap != null && <span className="font-semibold">{dur(gap)} since the last job · </span>}
              {j.arrivedAt ? `Arrived ${clock(j.arrivedAt)}` : ""}{j.completedAt ? `${j.arrivedAt ? " · " : ""}Done ${clock(j.completedAt)}` : ""}
              {j.arrivedAt && j.completedAt ? ` · ${dur(j.completedAt - j.arrivedAt)} on site` : ""}
            </div>
          )}
          {(j.pay?.amount != null || !!j.expenses || !!j.reviews) && (
            <div className="text-sm font-bold text-green-700">
              {j.pay?.amount != null && <>{office ? "Crew pay" : "Your crew's pay"} {money(j.pay.amount)}</>}
              {!!j.expenses && <>{j.pay?.amount != null ? " + " : ""}{money(j.expenses)} expenses</>}
              {!!j.reviews && <>{j.pay?.amount != null || j.expenses ? " + " : ""}{money(j.reviews)} review bonus</>}
            </div>
          )}
        </div>
        {j.completedAt || (fix && j.doneInJobber) ? <CheckCircle2 className="text-green-600 shrink-0" /> : <span className="text-sm font-semibold text-slate-500 shrink-0">{j.progress.done}/{j.progress.total}</span>}
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
        <div className="h-full bg-green-600" style={{ width: `${(j.progress.done / Math.max(1, j.progress.total)) * 100}%` }} />
      </div>
    </Link>
  );
}

const clock = (t: number) => fmtTime(new Date(t).toISOString());

/** Time between this crew's previous job finishing and this one starting, the same day. */
function gapBefore(j: Row, dayJobs: Row[]) {
  if (!j.arrivedAt) return undefined;
  const prev = dayJobs
    .filter((x) => x.id !== j.id && (x.crew || x.assignedNames.join()) === (j.crew || j.assignedNames.join()) && x.completedAt && x.completedAt <= j.arrivedAt!)
    .sort((a, b) => b.completedAt! - a.completedAt!)[0];
  return prev ? j.arrivedAt - prev.completedAt! : undefined;
}

/** What the crew makes that day: pay for the jobs that have a figure, plus the expenses they paid out of pocket
 *  and any Google review bonuses. */
function DayPay({ jobs, office }: { jobs: Row[]; office: boolean }) {
  const known = jobs.filter((j) => j.pay?.amount != null);
  const spent = jobs.reduce((t, j) => t + (j.expenses || 0), 0);
  const bonus = jobs.reduce((t, j) => t + (j.reviews || 0), 0);
  if (!known.length && !spent && !bonus) return null;
  const pay = known.reduce((t, j) => t + (j.pay!.amount as number), 0) + bonus;
  const missing = jobs.length - known.length;
  return (
    <span className="normal-case text-green-700 text-right">
      {office ? "Crew day total" : "Day total"} {money(pay + spent)}{spent > 0 && !pay ? " expenses" : ""}
      {spent > 0 && pay > 0 && <span className="font-normal text-slate-500"> (pay {money(pay)} + expenses {money(spent)})</span>}
      {missing ? <span className="font-normal text-slate-500">{` +${missing} not set`}</span> : ""}
    </span>
  );
}
