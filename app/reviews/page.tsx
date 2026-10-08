"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Star } from "lucide-react";
import { ago, api, fmtDay, NAVY } from "@/components/ui";

type Person = { id: string; name: string; role: string; crew?: string; link: string; taps: number; lastTap?: number; credited: number };
type JobRef = { id: string; client: string; start: string; kind: string };
type Review = {
  id: string; name: string; stars?: number; text?: string; at: number; link?: string; status: "credited" | "open" | "skipped";
  jobId?: string; personId?: string; amount?: number; how?: string; by?: string;
  suggest?: { jobId?: string; personId?: string; why: string }; job?: JobRef; suggestJob?: JobRef;
};
type Data = { people: Person[]; reviews: Review[]; jobs: JobRef[]; bonus: number; reviewUrl: string; goesTo: string; scannedAt?: number; error?: string; gmail: boolean };

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const card = "bg-white rounded-xl border border-slate-200 p-4";
const jobLabel = (j?: JobRef) => (j ? `${j.client || "Job"} · ${fmtDay(j.start)}${j.kind === "takedown" ? " takedown" : ""}` : "");

export default function ReviewsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api<Data>("/api/reviews").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function post(json: Record<string, unknown>, tag: string) {
    setBusy(tag); setErr("");
    try { await api("/api/reviews", { method: "POST", json }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;
  const open = d.reviews.filter((r) => r.status === "open");
  const credited = d.reviews.filter((r) => r.status === "credited");
  const skipped = d.reviews.filter((r) => r.status === "skipped");
  const who = (id?: string) => d.people.find((p) => p.id === id)?.name;
  const neverTapped = d.people.filter((p) => !p.lastTap && p.role !== "owner" && p.role !== "manager");

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Review cards</h1>
        <p className="text-sm text-slate-500">
          When a customer taps someone&apos;s review card and leaves a Google review, that person gets {money(d.bonus)} on the customer&apos;s job.
          It shows on the job, in their crew&apos;s pay and in the Costs ledger.
        </p>
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {!d.gmail && (
        <div className={`${card} border-amber-300 bg-amber-50 text-sm`}>
          New reviews are read from Google&apos;s review emails to info@lightdmv.com. Connect Google on the <Link href="/marketing" className="underline font-semibold">Marketing</Link> page to turn this on.
        </div>
      )}

      {open.length > 0 && (
        <section className={card}>
          <h2 className="font-bold mb-1">To assign ({open.length})</h2>
          <p className="text-sm text-slate-500 mb-2">Reviews the app couldn&apos;t place by itself. One tap gives the {money(d.bonus)}.</p>
          <ul className="divide-y">{open.map((r) => <OpenRow key={r.id} r={r} d={d} busy={busy === r.id} post={(j) => post({ id: r.id, ...j }, r.id)} />)}</ul>
        </section>
      )}

      <section className={card}>
        <div className="flex justify-between items-center gap-2 mb-1">
          <h2 className="font-bold">Credited ({credited.length})</h2>
          <button onClick={() => post({ scan: true }, "scan")} disabled={!!busy || !d.gmail} className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}>
            {busy === "scan" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check for new reviews
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-2">
          {d.scannedAt ? `Checked ${ago(d.scannedAt)}.` : "Not checked yet."} The app checks by itself whenever Jobs or this page is opened.
          {d.error && <span className="text-red-600"> Last check failed: {d.error}</span>}
        </p>
        {credited.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="divide-y">
            {credited.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span><Stars n={r.stars} /> <b>{r.name}</b> · {fmtDay(new Date(r.at).toISOString())}</span>
                  <span className="font-bold text-green-700 shrink-0">{who(r.personId) ?? "?"} {money(r.amount ?? d.bonus)}</span>
                </div>
                {r.job ? <Link href={`/jobs/${r.job.id}`} className="underline text-slate-600">{jobLabel(r.job)}</Link> : <span className="text-slate-400">Job no longer synced</span>}
                {r.how && <div className="text-xs text-slate-400">{r.how}</div>}
                <button className="text-xs underline text-slate-500" onClick={() => post({ id: r.id, reopen: true }, r.id)}>Take off and reassign</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-bold mb-1">Each person&apos;s card link</h2>
        <p className="text-sm text-slate-500 mb-2">
          One time per card: in the ZappyCards app, open the card and paste the person&apos;s link below as its link. A tap then notes whose card it was and opens Google&apos;s review page as before.
        </p>
        <ul className="divide-y">
          {d.people.map((p) => (
            <li key={p.id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <b>{p.name}</b>
                <span className="block text-xs text-slate-500 truncate">{p.link}</span>
                <span className="block text-xs text-slate-400">
                  {p.lastTap ? `Last tapped ${ago(p.lastTap)} · ${p.taps} taps this month` : "Not tapped yet"}
                  {p.credited ? ` · ${money(p.credited)} earned` : ""}
                </span>
              </span>
              <CopyButton text={p.link} />
            </li>
          ))}
        </ul>
        {neverTapped.length > 0 && <p className="text-xs text-slate-400 mt-1">Tap each card once with your own phone after pasting its link; &quot;Not tapped yet&quot; changes to the time you tapped it.</p>}
      </section>

      <section className={card}>
        <h2 className="font-bold mb-1">Where a tap goes</h2>
        <p className="text-sm text-slate-500 mb-2 break-all">Now: <a href={d.goesTo} target="_blank" rel="noreferrer" className="underline">{d.goesTo}</a></p>
        <UrlBox value={d.reviewUrl} busy={busy === "url"} onSave={(v) => post({ reviewUrl: v }, "url")} />
      </section>

      {skipped.length > 0 && (
        <details className={card}>
          <summary className="font-bold cursor-pointer">Not crew reviews ({skipped.length})</summary>
          <ul className="divide-y mt-2">
            {skipped.map((r) => (
              <li key={r.id} className="py-2 text-sm flex justify-between gap-2">
                <span><Stars n={r.stars} /> {r.name} · {fmtDay(new Date(r.at).toISOString())}</span>
                <button className="underline text-slate-500" onClick={() => post({ id: r.id, reopen: true }, r.id)}>Assign after all</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function OpenRow({ r, d, busy, post }: { r: Review; d: Data; busy: boolean; post: (j: Record<string, unknown>) => void }) {
  const [jobId, setJobId] = useState(r.suggest?.jobId ?? "");
  const [personId, setPersonId] = useState(r.suggest?.personId ?? "");
  const sj = r.suggestJob, sp = d.people.find((p) => p.id === r.suggest?.personId);
  const sel = "border border-slate-300 rounded-lg px-2 py-1 text-sm max-w-full";
  return (
    <li className="py-3 text-sm space-y-1">
      <div><Stars n={r.stars} /> <b>{r.name}</b> · {fmtDay(new Date(r.at).toISOString())}{r.link && <> · <a href={r.link} target="_blank" rel="noreferrer" className="underline">see review</a></>}</div>
      {r.text && <div className="text-slate-600 italic">&ldquo;{r.text}&rdquo;</div>}
      {r.suggest?.why && <div className="text-xs text-slate-400">{r.suggest.why}</div>}
      {sj && sp && (
        <button disabled={busy} onClick={() => post({ jobId: sj.id, personId: sp.id })} className="rounded-lg px-3 py-1.5 text-white font-semibold flex items-center gap-1" style={{ background: NAVY }}>
          <Check size={14} /> Give {sp.name} {money(d.bonus)} on {jobLabel(sj)}
        </button>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={sel}>
          <option value="">Pick the job...</option>
          {d.jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
        </select>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={sel}>
          <option value="">Whose card...</option>
          {d.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button disabled={busy || !jobId || !personId} onClick={() => post({ jobId, personId })} className="font-semibold text-green-700 disabled:text-slate-300">Give {money(d.bonus)}</button>
        <button disabled={busy} onClick={() => post({ skip: true })} className="text-slate-500 underline">Not a crew review</button>
        {busy && <Loader2 size={14} className="animate-spin" />}
      </div>
    </li>
  );
}

function Stars({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="inline-flex align-[-2px] text-amber-500">{Array.from({ length: n }, (_, i) => <Star key={i} size={12} fill="currentColor" />)}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="rounded-lg px-3 py-1.5 border border-slate-300 font-semibold flex items-center gap-1 shrink-0">
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function UrlBox({ value, busy, onSave }: { value: string; busy: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex gap-2 items-center flex-wrap text-sm">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste a different Google review link (optional)" className="border border-slate-300 rounded-lg px-2 py-1 flex-1 min-w-0" />
      <button disabled={busy || v === value} onClick={() => onSave(v)} className="font-semibold text-green-700 disabled:text-slate-300">Save</button>
    </div>
  );
}
