"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot as BotIcon, ChevronDown, ChevronUp, Loader2, Play, Plus, Sparkles } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card, Feed, FeedItem } from "../marketing/parts";

type Bot = {
  name: string; job: string; every: string; sees: string[]; area: "owners" | "marketing";
  lastRun?: number; error?: string; posts: FeedItem[];
};
type Data = { bots: Bot[]; others: FeedItem[]; every: Record<string, string>; sees: Record<string, string>; ai: boolean };

const input = "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm";

/** Owners only: each bot's job, when it runs, what it found and what it needs from you. */
export default function Bots() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<Data>("/api/bots").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;
  const asks = [...d.bots.flatMap((b) => b.posts), ...d.others].filter((f) => f.ask && !f.answer).sort((a, b) => b.at - a.at);
  const ready = d.bots.filter((b) => b.job.trim()).length;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="pt-2">
        <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Bots</h1>
        <p className="text-sm text-slate-600">{ready ? `${ready} of ${d.bots.length} bots have a job. They run here at 6 AM Eastern and post below.` : "Give each bot its job (paste its Grok instructions) and it runs here every morning instead of in Grok."}</p>
      </div>
      {!d.ai && <KeyBox onSaved={load} />}
      {asks.length > 0 && <Card title={`Needs you (${asks.length})`}><Feed items={asks} canAnswer onChange={load} empty="" /></Card>}
      {d.bots.map((b) => <BotCard key={b.name} b={b} d={d} onChange={load} />)}
      <AddBot onAdded={load} />
      {d.others.length > 0 && (
        <Card title="From bots still outside the app">
          <Feed items={d.others.filter((f) => !f.ask || f.answer)} canAnswer onChange={load} empty="" />
        </Card>
      )}
    </div>
  );
}

function BotCard({ b, d, onChange }: { b: Bot; d: Data; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState(b.job);
  const [every, setEvery] = useState(b.every);
  const [sees, setSees] = useState(b.sees);
  const [area, setArea] = useState(b.area);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  async function call(what: string, json: object) {
    setBusy(what); setMsg("");
    try { await api("/api/bots", { method: "POST", json }); onChange(); if (what === "save") setOpen(false); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }
  const latest = b.posts.filter((f) => !f.ask || f.answer).slice(0, 3);
  const status = !b.job.trim() ? "No job yet" : b.error ? `Last run failed: ${b.error}` : b.lastRun ? `Ran ${ago(b.lastRun)}` : "Hasn't run yet";
  return (
    <Card
      title={b.name}
      right={
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-100 text-slate-600">{b.area === "owners" ? "Briefing" : "Marketing"}</span>
          {b.job.trim() && (
            <button disabled={!!busy || !d.ai} onClick={() => call("run", { run: b.name })} title={d.ai ? "Run it now" : "Needs the Claude key"}
              className="rounded-lg px-2.5 py-1 text-sm font-semibold border border-slate-300 inline-flex items-center gap-1 disabled:opacity-50">
              {busy === "run" ? <><Loader2 size={14} className="animate-spin" /> Running...</> : <><Play size={14} /> Run</>}
            </button>
          )}
        </div>
      }
    >
      <div className={`text-xs ${b.error ? "text-red-600" : "text-slate-500"}`}>{status}{b.job.trim() && ` · ${d.every[b.every] ?? b.every}`}</div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {latest.length > 0 && <Feed items={latest} canAnswer onChange={onChange} empty="" />}
      <button onClick={() => setOpen(!open)} className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: NAVY }}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {b.job.trim() ? "Its job" : "Give it a job"}
      </button>
      {open && (
        <div className="space-y-3">
          <textarea value={job} onChange={(e) => setJob(e.target.value)} rows={8} className={input}
            placeholder={`What the ${b.name} bot does, in plain words. Paste its instructions from Grok here.`} />
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="font-semibold">Runs</span>
              <select value={every} onChange={(e) => setEvery(e.target.value)} className={input}>
                {Object.entries(d.every).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-semibold">Posts to</span>
              <select value={area} onChange={(e) => setArea(e.target.value as Bot["area"])} className={input}>
                <option value="owners">Briefing (owners)</option>
                <option value="marketing">Marketing (owners and Maria)</option>
              </select>
            </label>
          </div>
          <div className="text-sm space-y-1">
            <div className="font-semibold">It can look at</div>
            {Object.entries(d.sees).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={sees.includes(k)} onChange={(e) => setSees(e.target.checked ? [...sees, k] : sees.filter((x) => x !== k))} /> {v}
              </label>
            ))}
            <div className="text-xs text-slate-500">It can always search the web and see its own last reports and your answers.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button disabled={!!busy} onClick={() => call("save", { name: b.name, job, every, sees, area })}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: NAVY }}>
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
            <button disabled={!!busy} onClick={() => window.confirm(`Remove the ${b.name} bot? Its reports stay.`) && call("remove", { remove: b.name })}
              className="rounded-lg px-3 py-2 text-sm font-semibold border border-slate-300 text-slate-600">Remove bot</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddBot({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function add() {
    setBusy(true); setMsg("");
    try { await api("/api/bots", { method: "POST", json: { add: name } }); setName(""); onAdded(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="flex gap-2 items-center">
      <BotIcon size={18} className="text-slate-400 shrink-0" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New bot's name" className={`${input} flex-1`} />
      <button disabled={busy || !name.trim()} onClick={add} className="rounded-lg px-3 py-2 text-sm font-semibold border border-slate-300 inline-flex items-center gap-1 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add</>}
      </button>
      {msg && <span className="text-sm text-red-600">{msg}</span>}
    </div>
  );
}

function KeyBox({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true); setMsg("");
    try { await api("/api/customers/ai", { method: "POST", json: { key } }); setKey(""); onSaved(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <section className="bg-white rounded-xl border border-amber-300 p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}><Sparkles size={16} /> One step: a Claude key</div>
      <p className="text-sm text-slate-600">The bots run on Claude. Paste a key once and every bot (plus customer summaries and crew notes) uses it.</p>
      <div className="flex gap-2">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" className={`${input} flex-1 min-w-0`} />
        <button disabled={busy || !key.trim()} onClick={save} className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: NAVY }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
        </button>
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
      <p className="text-xs text-slate-400">Get one at console.anthropic.com under API keys. It's kept on the server and never shown again.</p>
    </section>
  );
}
