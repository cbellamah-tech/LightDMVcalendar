"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Loader2, Mail, MapPin, MessageSquare, Package, Phone, StickyNote, X } from "lucide-react";
import { api, NAVY } from "@/components/ui";

type Line = { name: string; description?: string; qty?: number; unit?: number; total?: number };
type Work = { id: string; num?: string; title?: string; date?: string; status?: string; total?: number; lines: Line[]; url?: string };
type Season = { year: number; total: number; tags: string[]; jobs: Work[]; quotes: Work[] };
type Event = { id: string; at?: string; kind: string; dir?: "in" | "out"; text: string; from: string; group: "text" | "note" | "call" | "email" | "other" };
type Photo = { url: string; label: string; year?: number; group: "design" | "install" | "takedown" | "crew" };
type Bin = { bin: string; year?: number; status?: string; source: string };
type Profile = {
  bins: Bin[];
  id: string; name: string; aka: string[]; status: string; total: number; seasons: number[];
  phones: string[]; emails: string[]; addresses: string[]; tags: string[]; links: { label: string; url: string }[];
  seasons_: Season[]; photos: Photo[]; timeline: Event[]; jobberTexts: boolean; ghl: boolean; refreshing: boolean;
};

const money = (n?: number) => (n == null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const card = "bg-white rounded-xl border border-slate-200 p-4";
const status = (s?: string) => (s ? s.replace(/_/g, " ").toLowerCase() : "");
const PHOTO_GROUPS = [["design", "Designs"], ["install", "Finished installs"], ["takedown", "Takedowns"], ["crew", "Crew photos"]] as const;
const FEED = [["all", "All"], ["text", "Texts"], ["call", "Calls"], ["email", "Emails"], ["note", "Notes"]] as const;

export default function CustomerPage({ params }: { params: { id: string } }) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<Profile>(`/api/customers/${params.id}`).then(setP).catch((e) => setErr(e.message)), [params.id]);
  useEffect(() => { load(); }, [load]);
  // Their GoHighLevel texts and notes were being refreshed: ask again once they're in.
  useEffect(() => {
    if (!p?.refreshing) return;
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [p?.refreshing, load]);

  if (!p) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const last = p.seasons_.find((s) => s.total > 0 || s.jobs.length);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/customers" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ArrowLeft size={16} /> Customers</Link>
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>{p.name}</h1>
        {p.aka.length > 0 && <p className="text-sm text-slate-500">Also in our records as {p.aka.join(", ")}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="All time" value={money(p.total) || "$0"} onClick={() => jump("seasons")} />
        <Stat label={p.seasons.length === 1 ? "Season" : "Seasons"} value={String(p.seasons.length)} onClick={() => jump("seasons")} />
        <Stat label="Last season" value={last ? `${last.year} · ${money(last.total)}` : "None"} onClick={() => jump(last ? `s${last.year}` : "seasons")} />
      </div>

      <section className={`${card} space-y-1.5 text-sm`}>
        {p.phones.map((x) => <a key={x} href={`tel:${x.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2"><Phone size={15} className="text-slate-400" />{x}</a>)}
        {p.emails.map((x) => <a key={x} href={`mailto:${x}`} className="flex items-center gap-2 break-all"><Mail size={15} className="text-slate-400 shrink-0" />{x}</a>)}
        {p.addresses.map((x) => (
          <a key={x} href={`https://maps.google.com/?q=${encodeURIComponent(x)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2">
            <MapPin size={15} className="text-slate-400 shrink-0" />{x}
          </a>
        ))}
        {p.bins.length > 0 && (
          <div className="flex items-start gap-2 pt-1">
            <Package size={15} className="text-slate-400 mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-1">
              {p.bins.map((b, i) => (
                <span key={i} className="text-xs rounded px-2 py-0.5 bg-slate-100" title={b.source}>
                  <b>Bin {b.bin}</b>{b.year ? ` · ${b.year}` : ""}{b.status ? ` · ${b.status}` : ""} <span className="text-slate-400">({b.source})</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {p.tags.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{p.tags.map((t) => <span key={t} className="text-xs bg-slate-100 rounded px-2 py-0.5">{t}</span>)}</div>}
        {p.links.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {p.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="font-semibold flex items-center gap-1" style={{ color: NAVY }}>{l.label} <ExternalLink size={13} /></a>)}
          </div>
        )}
      </section>

      <section id="seasons" className="space-y-2">
        <h2 className="text-lg font-extrabold">Every year</h2>
        {p.seasons_.length === 0 ? <div className={`${card} text-sm text-slate-500`}>No quotes or jobs in Jobber.</div>
          : p.seasons_.map((s, i) => <SeasonCard key={s.year} s={s} open={i === 0} />)}
      </section>

      <Photos photos={p.photos} />

      <Timeline events={p.timeline} jobberTexts={p.jobberTexts} ghl={p.ghl} refreshing={p.refreshing} />
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-slate-200 p-3 text-left">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-extrabold text-lg leading-tight" style={{ color: NAVY }}>{value}</div>
    </button>
  );
}

function SeasonCard({ s, open: start }: { s: Season; open: boolean }) {
  const [open, setOpen] = useState(start);
  const sold = s.jobs.length > 0 || s.total > 0;
  return (
    <div id={`s${s.year}`} className={card}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left">
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="font-extrabold text-lg">{s.year}</span>
        <span className="text-sm text-slate-500 flex-1">{sold ? "" : "quoted, not sold"}</span>
        {s.total > 0 && <span className="font-bold" style={{ color: NAVY }}>{money(s.total)}</span>}
      </button>
      {s.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{s.tags.map((t) => <span key={t} className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200">{t}</span>)}</div>}
      {open && (
        <div className="mt-3 space-y-3">
          {s.jobs.map((w) => <WorkBlock key={w.id} w={w} kind="Job" />)}
          {s.quotes.map((w) => <WorkBlock key={w.id} w={w} kind="Quote" />)}
        </div>
      )}
    </div>
  );
}

function WorkBlock({ w, kind }: { w: Work; kind: "Job" | "Quote" }) {
  return (
    <div className="border-t pt-2">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{kind} {w.num ? `#${w.num}` : ""}</span>
        <span className="text-slate-500 flex-1 truncate">{[day(w.date), status(w.status)].filter(Boolean).join(" · ")}</span>
        {w.total != null && <span className="font-semibold">{money(w.total)}</span>}
        {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="text-slate-400" aria-label="Open in Jobber"><ExternalLink size={14} /></a>}
      </div>
      {w.title && <div className="text-xs text-slate-500">{w.title}</div>}
      {w.lines.length > 0 && (
        <ul className="mt-1 text-sm space-y-1">
          {w.lines.map((l, i) => (
            <li key={i} className="flex gap-2">
              <div className="flex-1 min-w-0">
                <span>{l.name}</span>{l.qty != null && l.qty !== 1 && <span className="text-slate-500"> × {l.qty}</span>}
                {l.description && <div className="text-xs text-slate-400 line-clamp-2">{l.description}</div>}
              </div>
              {l.total != null && <span className="text-slate-600 shrink-0">{money(l.total)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Photos({ photos }: { photos: Photo[] }) {
  const groups = PHOTO_GROUPS.map(([k, label]) => ({ k, label, list: photos.filter((x) => x.group === k) })).filter((g) => g.list.length);
  const [tab, setTab] = useState<string>("");
  const [big, setBig] = useState<Photo | null>(null);
  const cur = groups.find((g) => g.k === tab) ?? groups[0];
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-extrabold">Photos</h2>
      {!cur ? <div className={`${card} text-sm text-slate-500`}>No designs or job photos for this customer yet.</div> : (
        <div className={card}>
          <div className="flex gap-2 overflow-x-auto mb-3">
            {groups.map((g) => (
              <button key={g.k} onClick={() => setTab(g.k)} className={`px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap border ${g.k === cur.k ? "text-white border-transparent" : "border-slate-300"}`}
                style={g.k === cur.k ? { background: NAVY } : undefined}>{g.label} {g.list.length}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {cur.list.map((x) => (
              <button key={x.url} onClick={() => setBig(x)} className="text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.url} alt={x.label} loading="lazy" className="w-full aspect-square object-cover rounded-lg bg-slate-100" />
                <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{x.label}{x.year ? ` · ${x.year}` : ""}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {big && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setBig(null)}>
          <div className="flex justify-between items-center p-3 text-white text-sm">
            <span>{big.label}{big.year ? ` · ${big.year}` : ""}</span><X />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big.url} alt={big.label} className="flex-1 min-h-0 object-contain" />
        </div>
      )}
    </section>
  );
}

function Timeline({ events, jobberTexts, ghl, refreshing }: { events: Event[]; jobberTexts: boolean; ghl: boolean; refreshing: boolean }) {
  const [f, setF] = useState("all");
  const [shown, setShown] = useState(60);
  const list = events.filter((e) => f === "all" || e.group === f || (f === "text" && e.group === "other"));
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-extrabold">Texts, calls and notes</h2>
      <div className="flex gap-2 overflow-x-auto">
        {FEED.map(([k, label]) => {
          const n = k === "all" ? events.length : events.filter((e) => e.group === k || (k === "text" && e.group === "other")).length;
          return (
            <button key={k} onClick={() => { setF(k); setShown(60); }} className={`px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap border ${f === k ? "text-white border-transparent" : "bg-white border-slate-300"}`}
              style={f === k ? { background: NAVY } : undefined}>{label} {n}</button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">
        {refreshing ? "Getting the newest from GoHighLevel... " : ""}
        {jobberTexts ? "Jobber texts, " : ""}GoHighLevel texts, calls, emails and notes{ghl ? "" : " (no GoHighLevel contact matched)"}, plus every Jobber note.
        {!jobberTexts && " Jobber's API doesn't hand out its text messages, so texts sent from Jobber show only if they also went through GoHighLevel."}
      </p>
      {list.length === 0 ? <div className={`${card} text-sm text-slate-500`}>Nothing here yet.</div> : (
        <ul className="space-y-2">
          {list.slice(0, shown).map((e) => <EventRow key={e.id} e={e} />)}
        </ul>
      )}
      {list.length > shown && <button onClick={() => setShown(shown + 100)} className="w-full py-3 text-sm font-semibold" style={{ color: NAVY }}>Show older ({list.length - shown} more)</button>}
    </section>
  );
}

function EventRow({ e }: { e: Event }) {
  const [full, setFull] = useState(false);
  const long = e.text.length > 400;
  const theirs = e.dir === "in";
  const Icon = e.group === "note" ? StickyNote : e.group === "call" ? Phone : e.group === "email" ? Mail : MessageSquare;
  return (
    <li className={`rounded-xl border p-3 text-sm ${e.group === "note" ? "bg-amber-50 border-amber-200" : theirs ? "bg-white border-slate-200" : "bg-blue-50 border-blue-100"}`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <Icon size={13} />
        <span className="font-semibold text-slate-700">{e.group === "note" ? e.from : `${e.kind} ${theirs ? "from customer" : "from us"}`}</span>
        <span className="flex-1" />
        <span>{when(e.at)}</span>
      </div>
      <div className="whitespace-pre-wrap break-words">{long && !full ? `${e.text.slice(0, 400)}...` : e.text}</div>
      {long && <button onClick={() => setFull(!full)} className="text-xs font-semibold mt-1" style={{ color: NAVY }}>{full ? "Less" : "Read all"}</button>}
      {e.group !== "note" && <div className="text-[11px] text-slate-400 mt-1">{e.from}</div>}
    </li>
  );
}
