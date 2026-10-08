"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Hammer, Loader2, MapPin, Navigation, UserCheck, Wrench } from "lucide-react";
import { api, fmtDay, fmtTime, getMe, Me, NAVY } from "@/components/ui";
import { groupsFor, ROLE_LABEL } from "@/lib/nav";
import { CREW_LABEL } from "./signs/types";
import type { CrewPay, Job, Progress } from "./jobs/types";

type Row = Job & { progress: Progress; arrivedAt?: number; completedAt?: number; pay?: CrewPay };
type JobsData = { jobs: Row[]; fixes: Row[] };
type Course = { loaded: boolean; total?: number; done?: number; next?: { n: number; title: string; started: boolean } | null };
type Team = { me: string; people: { uid: string; name: string; modules: { title: string; done: number | null; signedOff: unknown }[] }[] };

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();
const isDone = (j: Row) => !!j.completedAt || (j.kind === "fix" && !!j.doneInJobber);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const directions = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

/** Home: what this person needs today. Crews get their own jobs and pay; the office gets the whole day at a glance. */
export default function Today() {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<JobsData | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    getMe().then(setMe).catch(() => {});
    const load = () => api<JobsData>("/api/jobs").then(setData).catch((e) => setErr(e.message));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  if (!me) return <div className="p-6 text-slate-500 flex gap-2"><Loader2 className="animate-spin" /> Loading...</div>;
  const crewSide = me.role === "lead" || me.role === "crew";
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="pt-1">
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>{greeting()}, {me.name}</h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {ROLE_LABEL[me.role]}{crewSide && me.crew ? ` · ${CREW_LABEL[me.crew] ?? me.crew}` : ""}
        </p>
      </div>
      {crewSide ? <CrewHome me={me} data={data} err={err} /> : <OfficeHome me={me} data={data} err={err} />}
    </div>
  );
}

// ---------------- crew and crew leads ----------------

function CrewHome({ me, data, err }: { me: Me; data: JobsData | null; err: string }) {
  const now = new Date();
  const { today, nextDay } = useMemo(() => {
    const all = [...(data?.fixes ?? []).filter((f) => !isDone(f) || sameDay(f.start, now)), ...(data?.jobs ?? [])]
      .sort((a, b) => a.start.localeCompare(b.start));
    const today = all.filter((j) => sameDay(j.start, now) || (j.kind === "fix" && new Date(j.start) < now && !isDone(j)));
    const later = all.filter((j) => new Date(j.start) > now && !sameDay(j.start, now));
    const nextDay = later.length ? later.filter((j) => sameDay(j.start, new Date(later[0].start))) : [];
    return { today, nextDay };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = today.filter((j) => j.pay?.amount != null).reduce((t, j) => t + (j.pay!.amount as number), 0);
  const left = today.filter((j) => !isDone(j)).length;

  return (
    <>
      {!data ? (
        <Card><span className="text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" size={18} /> Loading your jobs...</>}</span></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat href="#today-jobs" label="Jobs today" value={today.length ? `${today.length - left} of ${today.length} done` : "None"} />
            <Stat href="#today-jobs" label="Your crew's pay today" value={pay ? money(pay) : "Not set"} green={!!pay} />
          </div>
          <section id="today-jobs" className="space-y-2 scroll-mt-16">
            {today.length ? (
              <>
                <h2 className="font-extrabold" style={{ color: NAVY }}>Today, in order</h2>
                {today.map((j, i) => <CrewJob key={j.id} j={j} next={!isDone(j) && today.slice(0, i).every(isDone)} />)}
              </>
            ) : nextDay.length ? (
              <>
                <h2 className="font-extrabold" style={{ color: NAVY }}>No jobs today. Next up: {fmtDay(nextDay[0].start)}</h2>
                {nextDay.map((j) => <CrewJob key={j.id} j={j} />)}
              </>
            ) : (
              <Card><p className="text-slate-500">No jobs on your schedule this week.</p></Card>
            )}
            <Link href="/jobs" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}>All your jobs this week <ChevronRight size={16} /></Link>
          </section>
        </>
      )}
      <CourseCard />
      {me.role === "lead" && <SignOffCard />}
    </>
  );
}

function CrewJob({ j, next }: { j: Row; next?: boolean }) {
  const done = isDone(j);
  const fix = j.kind === "fix";
  return (
    <div className={`bg-white rounded-xl border p-4 space-y-2 ${next ? "border-2 border-[#112E5B]" : fix ? "border-amber-300" : "border-slate-200"} ${done ? "opacity-70" : ""}`}>
      <Link href={`/jobs/${j.id}`} className="block">
        <div className="flex justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-400">
              {next ? <span className="text-[#112E5B]">NEXT · </span> : null}{fmtTime(j.start)} · {fix ? "Fix" : j.kind === "install" ? "Install" : "Takedown"}
            </div>
            <div className="font-bold truncate">{j.client || j.title}</div>
            {fix && j.request && <div className="text-sm font-semibold text-amber-900">{j.request}</div>}
            <div className="text-sm text-slate-500 truncate">{j.address}</div>
            {j.pay?.amount != null && <div className="text-sm font-bold text-green-700">Your crew's pay {money(j.pay.amount)}</div>}
          </div>
          {done ? <CheckCircle2 className="text-green-600 shrink-0" /> : <span className="text-sm font-semibold text-slate-500 shrink-0">{j.progress.done}/{j.progress.total}</span>}
        </div>
      </Link>
      {!done && (
        <div className="flex gap-2">
          <Link href={`/jobs/${j.id}`} className="flex-1 text-center rounded-lg py-2.5 text-sm font-bold text-white" style={{ background: NAVY }}>
            {j.arrivedAt || j.progress.done ? "Keep going" : "Start checklist"}
          </Link>
          {j.address && (
            <a href={directions(j.address)} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg py-2.5 text-sm font-bold border border-slate-300 flex items-center justify-center gap-1" style={{ color: NAVY }}>
              <Navigation size={16} /> Directions
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CourseCard() {
  const [c, setC] = useState<Course | null>(null);
  useEffect(() => { api<Course>("/api/install/summary").then(setC).catch(() => {}); }, []);
  if (!c?.loaded) return null;
  const all = c.done === c.total;
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold flex items-center gap-2" style={{ color: NAVY }}><Hammer size={18} /> Installer course</div>
        <Link href="/install" className="text-sm font-semibold text-slate-500">{c.done} of {c.total} done</Link>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${((c.done ?? 0) / Math.max(1, c.total ?? 1)) * 100}%` }} /></div>
      {all ? <p className="text-sm text-green-700 font-semibold">All modules done.</p> : c.next && (
        <Link href="/install?go=next" className="block text-center rounded-lg py-2.5 text-sm font-bold text-white" style={{ background: NAVY }}>
          {c.next.started ? "Continue" : "Start"}: {c.next.title}
        </Link>
      )}
    </Card>
  );
}

/** Crew leads: who finished a module and is waiting on a sign-off from a real job. */
function SignOffCard() {
  const [t, setT] = useState<Team | null>(null);
  useEffect(() => { api<Team>("/api/install/team").then(setT).catch(() => {}); }, []);
  if (!t) return null;
  const waiting = t.people.filter((p) => p.uid !== t.me)
    .map((p) => ({ name: p.name, mods: p.modules.filter((m) => m.done && !m.signedOff) }))
    .filter((p) => p.mods.length);
  return (
    <Link href="/install/team" className="block">
      <Card className="space-y-1 hover:shadow-md">
        <div className="font-bold flex items-center justify-between gap-2" style={{ color: NAVY }}>
          <span className="flex items-center gap-2"><UserCheck size={18} /> Crew training</span>
          <ChevronRight size={18} />
        </div>
        {waiting.length ? waiting.map((p) => (
          <p key={p.name} className="text-sm"><b>{p.name}</b> needs your sign-off on {p.mods.length} module{p.mods.length > 1 ? "s" : ""}</p>
        )) : <p className="text-sm text-slate-500">Nobody is waiting on a sign-off.</p>}
      </Card>
    </Link>
  );
}

// ---------------- owners and the office ----------------

function OfficeHome({ me, data, err }: { me: Me; data: JobsData | null; err: string }) {
  const now = new Date();
  const today = (data?.jobs ?? []).filter((j) => sameDay(j.start, now));
  const openFixes = (data?.fixes ?? []).filter((f) => !isDone(f));
  const onSite = today.filter((j) => j.arrivedAt && !j.completedAt);
  const done = today.filter(isDone);
  const pay = today.filter((j) => j.pay?.amount != null).reduce((t, j) => t + (j.pay!.amount as number), 0);
  const upcoming = (data?.jobs ?? []).filter((j) => new Date(j.start) > now && !sameDay(j.start, now));
  const nextDay = upcoming.length ? upcoming.filter((j) => sameDay(j.start, new Date(upcoming[0].start))) : [];

  const crews = new Map<string, Row[]>();
  for (const j of today) crews.set(j.crew || "none", [...(crews.get(j.crew || "none") ?? []), j]);

  return (
    <>
      {!data ? (
        <Card><span className="text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" size={18} /> Loading today...</>}</span></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat href="/jobs" label="Jobs today" value={String(today.length)} />
            <Stat href="/jobs" label="On site now" value={String(onSite.length)} />
            <Stat href="/jobs" label="Done" value={`${done.length} of ${today.length}`} />
            <Stat href="/jobs#fixes" label="Open fixes" value={String(openFixes.length)} amber={openFixes.length > 0} />
          </div>
          {today.length > 0 && (
            <Card className="space-y-1">
              <div className="flex justify-between items-center">
                <h2 className="font-extrabold" style={{ color: NAVY }}>Crews today</h2>
                {pay > 0 && <Link href="/jobs" className="text-sm font-bold text-green-700">Crew pay {money(pay)}</Link>}
              </div>
              {[...crews.entries()].map(([crew, list]) => <CrewLine key={crew} crew={crew} list={list} />)}
            </Card>
          )}
          {!today.length && nextDay.length > 0 && (
            <Link href="/jobs" className="block"><Card className="hover:shadow-md flex justify-between items-center">
              <span><b>No jobs today.</b> Next: {fmtDay(nextDay[0].start)}, {nextDay.length} job{nextDay.length > 1 ? "s" : ""}</span>
              <ChevronRight size={18} />
            </Card></Link>
          )}
          {openFixes.length > 0 && (
            <Link href="/jobs#fixes" className="block"><Card className="border-amber-300 bg-amber-50/60 hover:shadow-md space-y-1">
              <div className="font-extrabold text-amber-900 flex items-center gap-2"><Wrench size={16} /> Open fixes</div>
              {openFixes.slice(0, 4).map((f) => (
                <div key={f.id} className="text-sm truncate"><b>{fmtDay(f.start)}</b> · {f.client || f.title}{f.request ? `: ${f.request}` : ""}</div>
              ))}
              {openFixes.length > 4 && <div className="text-xs text-amber-900">and {openFixes.length - 4} more</div>}
            </Card></Link>
          )}
        </>
      )}
      {groupsFor(me.role).map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="text-xs font-bold uppercase text-slate-400 pt-2">{g.title}</h2>
          {/* Phone: small icon tiles, three across. Computer: two across with a line on what each is for. */}
          <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
            {g.tabs.map((t) => (
              <Link key={t.href} href={t.href}
                className="bg-white rounded-xl p-3 border border-slate-200 hover:shadow-md transition flex flex-col items-center text-center gap-1 sm:flex-row sm:items-start sm:text-left sm:gap-3">
                <t.icon size={22} style={{ color: NAVY }} className="shrink-0 sm:mt-0.5" />
                <span>
                  <span className="font-bold block text-xs sm:text-base">{t.label}</span>
                  <span className="text-sm text-slate-500 hidden sm:block">{t.text}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function CrewLine({ crew, list }: { crew: string; list: Row[] }) {
  const here = list.find((j) => j.arrivedAt && !j.completedAt);
  const next = list.find((j) => !j.arrivedAt && !isDone(j));
  const done = list.filter(isDone).length;
  return (
    <Link href={`/jobs?crew=${crew}`} className="flex items-center justify-between gap-2 py-2 border-t border-slate-100 first:border-t-0">
      <div className="min-w-0">
        <div className="font-bold">{crew === "none" ? "No crew matched" : CREW_LABEL[crew] ?? crew}</div>
        <div className="text-sm text-slate-500 truncate flex items-center gap-1">
          {here ? <><MapPin size={13} className="text-green-600" /> On site: {here.client || here.title}</>
            : next ? <>Next: {fmtTime(next.start)} {next.client || next.title}</>
            : "Day finished"}
        </div>
      </div>
      <span className="text-sm font-semibold text-slate-500 shrink-0 flex items-center">{done}/{list.length} done <ChevronRight size={16} /></span>
    </Link>
  );
}

// ---------------- bits ----------------

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border p-4 ${/\bborder-\w+-\d/.test(className) ? "" : "bg-white border-slate-200"} ${className}`}>{children}</div>;
}

function Stat({ href, label, value, green, amber }: { href: string; label: string; value: string; green?: boolean; amber?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border p-3 hover:shadow-md transition ${amber ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200"}`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`text-xl font-extrabold ${green ? "text-green-700" : amber ? "text-amber-900" : ""}`} style={green || amber ? undefined : { color: NAVY }}>{value}</div>
    </Link>
  );
}
