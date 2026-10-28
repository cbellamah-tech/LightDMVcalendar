"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, MessageSquare, Truck } from "lucide-react";
import { ago, api, fmtDay, NAVY } from "@/components/ui";
import type { MapLine, MapPoint } from "@/components/SignMap";
import type { CrewDay, LinkSend, Stop, TrackSettings } from "@/lib/tracker";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });

type Row = Stop & { link: string; sends: LinkSend[] };
type Crew = Omit<CrewDay, "stops"> & { label: string; stops: Row[] };
type Data = { day: string; settings: TrackSettings; sample: string; crews: Crew[]; locating: number };

const CREW_COLOR: Record<string, string> = { crew1: "#112E5B", crew2: "#7C3AED" };
const STATUS_COLOR = { done: "#1F9D55", here: "#F5A524" } as const;
const TZ = "America/New_York";
const clock = (t: number | string) => new Date(t).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export default function TrackerPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [me, setMe] = useState<{ role: string } | null>(null);
  const load = useCallback(() => api<Data>("/api/track").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    api("/api/me").then(setMe).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const map = useMemo(() => {
    const points: MapPoint[] = [];
    const lines: MapLine[] = [];
    for (const c of d?.crews ?? []) {
      const color = CREW_COLOR[c.crew] ?? NAVY;
      const lead = c.lead;
      for (const s of c.stops) {
        if (!s.at) continue;
        points.push({ id: s.jobId, lat: s.at.lat, lng: s.at.lng, num: String(s.n), color: s.status === "done" ? STATUS_COLOR.done : s.status === "here" ? STATUS_COLOR.here : color,
          label: `${lead} #${s.n}: ${s.client || s.address}${s.status === "done" ? " (done)" : s.etaFrom ? ` · ETA ${clock(s.etaFrom)}-${clock(s.etaTo!)}` : ""}` });
      }
      const route = c.stops.filter((s) => s.at && s.status !== "done").map((s) => [s.at!.lat, s.at!.lng] as [number, number]);
      if (c.van && c.vanFresh) route.unshift([c.van.lat, c.van.lng]);
      lines.push({ pts: route, color, dashed: true });
      lines.push({ pts: c.trail, color });
      if (c.van) points.push({ id: `van-${c.crew}`, lat: c.van.lat, lng: c.van.lng, color, big: true, radiusM: c.van.acc && c.van.acc < 500 ? c.van.acc : undefined,
        label: `${lead}'s van · ${ago(c.van.at)}` });
    }
    return { points, lines };
  }, [d]);

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading the tracker...</>}</div>;
  const any = d.crews.some((c) => c.stops.length);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Santa tracker</h1>
          <p className="text-sm text-slate-500">{fmtDay(`${d.day}T12:00:00`)} · each crew's route, where the van is, and every customer's ETA. Updates every 30 seconds.</p>
        </div>
      </div>

      {any ? <SignMap points={map.points} lines={map.lines} height={420} fitKey={`${d.day}|${map.points.filter((p) => p.num).length}`} />
        : <p className="text-slate-500 bg-white rounded-xl border border-slate-200 p-4">No crew has stops today.</p>}
      {d.locating > 0 && <p className="text-xs text-slate-500">Finding {d.locating} home{d.locating > 1 ? "s" : ""} on the map. They show up in a minute or two.</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        {d.crews.map((c) => <CrewCard key={c.crew} c={c} sample={d.sample} onSent={load} />)}
      </div>

      <AutoText settings={d.settings} sample={d.sample} owner={me?.role === "owner"} onChange={load} />
    </div>
  );
}

function CrewCard({ c, sample, onSent }: { c: Crew; sample: string; onSent: () => void }) {
  const done = c.stops.filter((s) => s.status === "done").length;
  const color = CREW_COLOR[c.crew] ?? NAVY;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-extrabold flex items-center gap-2" style={{ color }}><Truck size={18} /> {c.label}</h2>
          <p className="text-xs text-slate-500">
            {c.van ? <>Van seen {ago(c.van.at)}{c.vanFresh ? "" : " (phone not sending now: app closed or screen locked)"}</> : c.stops.length ? `${c.lead}'s phone hasn't shared a location today. It starts when ${c.lead} opens the app.` : "No stops today."}
          </p>
        </div>
        {c.stops.length > 0 && <span className="text-sm font-bold text-slate-600 shrink-0">{done} of {c.stops.length} done</span>}
      </div>
      {c.stops.length > 0 && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-600" style={{ width: `${(done / c.stops.length) * 100}%` }} />
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {c.stops.map((s) => <StopRow key={s.jobId} s={s} sample={sample} onSent={onSent} />)}
      </ul>
    </section>
  );
}

function StopRow({ s, sample, onSent }: { s: Row; sample: string; onSent: () => void }) {
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const sent = s.sends.filter((x) => x.ok).pop();
  const failed = !sent ? s.sends.filter((x) => !x.ok).pop() : undefined;
  const copy = async () => { try { await navigator.clipboard.writeText(s.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setMsg(s.link); } };
  const send = async () => {
    setBusy(true); setMsg("");
    try { await api("/api/track", { method: "POST", json: { text: s.jobId } }); setAsk(false); onSent(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const when =
    s.status === "done" ? `Done ${s.completedAt ? clock(s.completedAt) : "in Jobber"}`
    : s.status === "here" ? `On site${s.arrivedAt ? ` since ${clock(s.arrivedAt)}` : " (van is there)"}`
    : s.etaFrom ? `ETA ${clock(s.etaFrom)} to ${clock(s.etaTo!)}${s.status === "next" ? " · next" : ""}` : "";
  return (
    <li className={`py-2.5 space-y-1.5 ${s.status === "done" ? "opacity-60" : ""}`}>
      <div className="flex gap-2.5 items-start">
        <span className="w-6 h-6 rounded-full text-white text-[11px] font-bold grid place-items-center shrink-0 mt-0.5"
          style={{ background: s.status === "done" ? STATUS_COLOR.done : s.status === "here" ? STATUS_COLOR.here : "#94A3B8" }}>{s.n}</span>
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${s.jobId}`} className="font-semibold truncate block hover:underline">{s.client || s.address}</Link>
          <div className="text-xs text-slate-500 truncate">{s.address}{s.at ? "" : " · not on the map yet"}</div>
          <div className={`text-sm font-semibold ${s.status === "here" ? "text-amber-700" : s.status === "done" ? "text-green-700" : "text-slate-700"}`}>{when}</div>
          <div className="text-xs text-slate-500">
            {sent ? <>Link texted {ago(sent.at)}{sent.auto ? " (automatic)" : ` by ${sent.by}`}</> : failed ? <span className="text-red-600">Last text failed: {failed.error}</span> : "Link not texted yet"}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={copy} title="Copy the customer's link" className="p-2 rounded-lg border border-slate-200 text-slate-600">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
          <a href={s.link} target="_blank" rel="noreferrer" title="See what the customer sees" className="p-2 rounded-lg border border-slate-200 text-slate-600"><ExternalLink size={15} /></a>
          {s.status !== "done" && (
            <button onClick={() => setAsk(!ask)} title="Text the customer their link" className="p-2 rounded-lg border border-slate-200 text-slate-600"><MessageSquare size={15} /></button>
          )}
        </div>
      </div>
      {ask && (
        <div className="ml-8 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-sm space-y-2">
          <p className="text-slate-600">Text this customer, with their first name and their own link, to the phone in Jobber:</p>
          <p className="italic text-slate-700">"{sample}"</p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={send} className="rounded-lg px-3 py-1.5 font-semibold text-white disabled:opacity-50" style={{ background: NAVY }}>{busy ? "Sending..." : "Send it"}</button>
            <button onClick={() => setAsk(false)} className="rounded-lg px-3 py-1.5 border border-slate-300">Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="ml-8 text-xs text-red-600 break-all">{msg}</p>}
    </li>
  );
}

function AutoText({ settings, sample, owner, onChange }: { settings: TrackSettings; sample: string; owner: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const flip = async () => {
    setBusy(true); setErr("");
    try { await api("/api/track", { method: "POST", json: { autoText: !settings.autoText } }); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-extrabold" style={{ color: NAVY }}>Text customers their link automatically</h2>
        <button disabled={!owner || busy} onClick={flip} aria-pressed={settings.autoText}
          className={`shrink-0 w-14 h-8 rounded-full p-1 transition ${settings.autoText ? "bg-green-600" : "bg-slate-300"} disabled:opacity-50`}>
          <span className={`block w-6 h-6 rounded-full bg-white shadow transition ${settings.autoText ? "translate-x-6" : ""}`} />
        </button>
      </div>
      <p className="text-sm text-slate-600">
        {settings.autoText
          ? <>On{settings.turnedOnBy ? ` (turned on by ${settings.turnedOnBy}${settings.turnedOnAt ? `, ${ago(settings.turnedOnAt)}` : ""})` : ""}. </>
          : "Off. "}
        When it's on, the first time a crew lead's phone checks in each day (between 7 AM and 6 PM), every customer still to come that day gets this text once, through GoHighLevel, with their first name and their own link:
      </p>
      <p className="text-sm italic text-slate-700 bg-slate-50 rounded-lg p-2.5">"{sample}"</p>
      {!owner && <p className="text-xs text-slate-500">Only an owner can turn this on or off.</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </section>
  );
}
