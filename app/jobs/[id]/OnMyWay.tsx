"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { ago, api, fmtTime, NAVY } from "@/components/ui";

type Send = { at: number; by: string; lead: string; minutes: number; ok: boolean; error?: string };
const ETAS = [{ m: 15, label: "15 min" }, { m: 30, label: "30 min" }, { m: 60, label: "1 hour" }];
const words = (m: number) => (m === 60 ? "an hour" : `${m} minutes`);

/** "On my way": one tap texts the customer that the crew lead is 15 min, 30 min or an hour away. */
/** Once the crew has arrived only the record of what was sent stays (for the office). */
export default function OnMyWay({ jobId, open }: { jobId: string; open: boolean }) {
  const [log, setLog] = useState<Send[]>([]);
  const [lead, setLead] = useState("");
  const [pick, setPick] = useState<number | null>(null); // waiting for "Send"
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ log: Send[]; lead: string }>(`/api/jobs/${jobId}/omw`).then((r) => { setLog(r.log); setLead(r.lead); }).catch(() => {});
  }, [jobId]);

  async function send(m: number) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ log: Send[] }>(`/api/jobs/${jobId}/omw`, { method: "POST", json: { minutes: m } });
      setLog(r.log);
      setMsg({ ok: true, text: `Texted: ${lead} is about ${words(m)} away.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
      api<{ log: Send[] }>(`/api/jobs/${jobId}/omw`).then((r) => setLog(r.log)).catch(() => {});
    } finally { setBusy(false); setPick(null); }
  }

  const last = [...log].reverse().find((e) => e.ok);
  if (!open && !log.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="font-bold flex items-center gap-1.5" style={{ color: NAVY }}><MessageSquare size={16} /> {open ? <>Text the customer you&apos;re on the way</> : "On my way texts"}</div>
      {!open ? null : pick === null ? (
        <div className="grid grid-cols-3 gap-2">
          {ETAS.map(({ m, label }) => (
            <button key={m} disabled={busy} onClick={() => { setMsg(null); setPick(m); }}
              className="rounded-lg py-2.5 font-bold text-white disabled:opacity-40" style={{ background: NAVY }}>{label}</button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm">Text the customer: &quot;{lead || "We"} from Light DMV is about {words(pick)} away&quot;?</div>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => send(pick)} className="rounded-lg py-2.5 font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: "#1F9D55" }}>
              {busy && <Loader2 size={16} className="animate-spin" />} Send
            </button>
            <button disabled={busy} onClick={() => setPick(null)} className="rounded-lg py-2.5 font-semibold border border-slate-300">Cancel</button>
          </div>
        </div>
      )}
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</div>}
      {last && !msg && <div className="text-xs text-slate-500">Last text: {words(last.minutes)} away, sent by {last.by} at {fmtTime(last.at)} ({ago(last.at)})</div>}
      {log.length > 1 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">All texts on this job ({log.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {[...log].reverse().map((e) => (
              <li key={e.at}>{fmtTime(e.at)}: {words(e.minutes)} away, by {e.by} {e.ok ? "" : <span className="text-red-600">not sent ({e.error})</span>}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
