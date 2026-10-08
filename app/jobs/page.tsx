"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api, fmtDay, fmtTime, Me, NAVY } from "@/components/ui";
import { CREW_LABEL } from "../signs/types";
import type { CrewPay, Job, Progress } from "./types";

type Row = Job & { progress: Progress; completedAt?: number; info?: { repeat: boolean; bins: string[]; known: boolean }; pay?: CrewPay };

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function JobsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sample, setSample] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [crew, setCrew] = useState("all");
  const [err, setErr] = useState("");

  const load = useCallback(() => api<{ jobs: Row[]; sample: boolean }>("/api/jobs").then((d) => { setRows(d.jobs); setSample(d.sample); }).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const office = me?.role === "owner" || me?.role === "manager";
  const days = useMemo(() => {
    const out = new Map<string, Row[]>();
    for (const j of rows || []) {
      if (crew !== "all" && (j.crew || "none") !== crew) continue;
      const k = new Date(j.start).toDateString();
      out.set(k, [...(out.get(k) || []), j]);
    }
    return [...out.entries()];
  }, [rows, crew]);

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
      {!days.length && <p className="text-slate-500">No jobs scheduled for your crew this week.</p>}
      {days.map(([day, jobs]) => (
        <section key={day} className="space-y-2">
          <h2 className="font-bold text-slate-500 text-sm uppercase flex justify-between gap-2">
            <span>{fmtDay(jobs[0].start)}</span>
            <DayPay jobs={jobs} office={office} />
          </h2>
          {jobs.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="block bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-400">
                    {fmtTime(j.start)} · {j.kind === "install" ? "Install" : "Takedown"} · {j.crew ? CREW_LABEL[j.crew] : j.assignedNames.join(", ") || "Unassigned"}
                  </div>
                  <div className="font-bold truncate flex items-center gap-2">
                    <span className="truncate">{j.client || j.title}</span>
                    {j.info && (j.info.repeat || j.info.known) && (
                      <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${j.info.repeat ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                        {j.info.repeat ? `REPEAT${j.info.bins.length ? ` · BIN ${j.info.bins.join(", ")}` : ""}` : "NEW"}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 truncate">{j.address}</div>
                  {j.pay?.amount != null && (
                    <div className="text-sm font-bold text-green-700">{office ? "Crew pay" : "Your crew's pay"} {money(j.pay.amount)}</div>
                  )}
                </div>
                {j.completedAt ? <CheckCircle2 className="text-green-600 shrink-0" /> : <span className="text-sm font-semibold text-slate-500 shrink-0">{j.progress.done}/{j.progress.total}</span>}
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-green-600" style={{ width: `${(j.progress.done / Math.max(1, j.progress.total)) * 100}%` }} />
              </div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

/** What the crew makes that day, from the jobs that have a pay figure. */
function DayPay({ jobs, office }: { jobs: Row[]; office: boolean }) {
  const known = jobs.filter((j) => j.pay?.amount != null);
  if (!known.length) return null;
  const total = known.reduce((t, j) => t + (j.pay!.amount as number), 0);
  const missing = jobs.length - known.length;
  return (
    <span className="normal-case text-green-700">
      {office ? "Crew pay" : "Day pay"} {money(total)}{missing ? ` (+${missing} not set)` : ""}
    </span>
  );
}
