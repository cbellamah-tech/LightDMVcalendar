"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Plus, RefreshCw, Sparkles, UserCheck, X } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card } from "./parts";

/* Instagram comments and follows: today's reels and local businesses, each with a comment ready to paste.
   A tap copies the comment and opens Instagram; a person posts it (Meta bans accounts that do this by bot). */

type Row = {
  id: string; kind: "reel" | "business"; title: string; line: string; url: string; comments: string[]; handle?: string;
  done?: { at: number; by: string };
};
type Business = { handle: string; kind: string; town: string; followed?: boolean; lastAt?: number };
type Data = { day: string; reels: Row[]; businesses: Row[]; saved: Business[]; kinds: string[]; towns: string[] };

export function InstagramEngage() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const load = useCallback(() => api<Data>("/api/marketing/engage").then(setD).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function post(json: object) {
    setMsg("");
    try { await api("/api/marketing/engage", { method: "POST", json }); await load(); }
    catch (e: any) { setMsg(e.message); }
  }

  if (!d) return <Card title="Instagram comments and follows"><p className="text-sm text-slate-500 flex gap-2">{msg || <><Loader2 className="animate-spin" size={16} /> Loading...</>}</p></Card>;

  const all = [...d.reels, ...d.businesses];
  const done = all.filter((r) => r.done).length;
  return (
    <Card title="Instagram comments and follows" right={<span className="text-sm font-semibold" style={{ color: done >= all.length ? "#1F9D55" : NAVY }}>{done} of {all.length} today</span>}>
      <p className="text-sm text-slate-500">Tap the green button: the comment is copied and Instagram opens. Paste it, then tap Done. Instagram bans accounts that comment by bot, so a person does the last tap.</p>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <h3 className="font-semibold text-sm pt-1" style={{ color: NAVY }}>Reels</h3>
      {d.reels.map((r) => <EngageRow key={r.id} r={r} d={d} post={post} />)}

      <h3 className="font-semibold text-sm pt-2" style={{ color: NAVY }}>Local businesses</h3>
      {d.businesses.map((r) => <EngageRow key={r.id} r={r} d={d} post={post} />)}

      <details open={showSaved} onToggle={(e) => setShowSaved((e.target as HTMLDetailsElement).open)} className="text-sm border-t border-slate-100 pt-2">
        <summary className="cursor-pointer font-semibold text-slate-600">Saved businesses ({d.saved.length})</summary>
        <p className="text-slate-500 my-2">Each one comes back every two weeks.</p>
        <AddBusiness d={d} post={post} />
        {d.saved.map((b) => (
          <div key={b.handle} className="flex items-center gap-2 py-1.5 border-t border-slate-100">
            <a href={`https://www.instagram.com/${b.handle}/`} target="_blank" rel="noreferrer" className="flex-1 font-medium" style={{ color: NAVY }}>@{b.handle}</a>
            <span className="text-slate-400 text-xs">{b.kind}, {b.town}</span>
            {b.followed && <UserCheck size={15} className="text-green-600" aria-label="Followed" />}
            <button aria-label={`Remove @${b.handle}`} className="p-1 text-slate-400 hover:text-red-600" onClick={() => post({ action: "remove", handle: b.handle })}><X size={15} /></button>
          </div>
        ))}
      </details>
    </Card>
  );
}

function EngageRow({ r, d, post }: { r: Row; d: Data; post: (j: object) => Promise<void> }) {
  const [i, setI] = useState(0);
  const [text, setText] = useState(r.comments[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState<"" | "write" | "save">("");
  const [about, setAbout] = useState("");
  const [written, setWritten] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const saved = d.saved.find((b) => b.handle === r.handle);

  function swap() { const k = (i + 1) % r.comments.length; setI(k); setText(r.comments[k]); }
  function copyOpen() {
    navigator.clipboard.writeText(text).catch(() => {});
    window.open(r.url, "_blank", "noopener");
  }
  async function tapDone() {
    setBusy(true);
    await post({ action: "done", id: r.id, title: r.title, undo: !!r.done });
    setBusy(false);
  }
  async function write() {
    setBusy(true); setErr("");
    try { setWritten((await api<{ comments: string[] }>("/api/marketing/engage", { method: "POST", json: { action: "write", about, where: r.title } })).comments); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${r.done ? "border-green-200 bg-green-50/50" : "border-slate-200"}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: NAVY }}>{r.title}</a>
          <p className="text-xs text-slate-500">{r.line}</p>
        </div>
        <button disabled={busy} onClick={tapDone} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1 border ${r.done ? "bg-green-600 border-green-600 text-white" : "border-slate-300 text-slate-600"}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {r.done ? "Done" : "Done?"}
        </button>
      </div>
      <div className="flex gap-2 items-start">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm bg-white" />
        {r.comments.length > 1 && <button title="Another comment" aria-label="Another comment" onClick={swap} className="p-2 rounded-lg border border-slate-300 text-slate-500"><RefreshCw size={15} /></button>}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={copyOpen} className="rounded-xl px-4 py-2 font-bold text-white inline-flex items-center gap-2" style={{ background: "#1F9D55" }}>
          <ExternalLink size={16} /> Copy and open
        </button>
        <button onClick={() => setMore(more === "write" ? "" : "write")} className="text-sm text-slate-600 inline-flex items-center gap-1 px-2 py-1"><Sparkles size={14} /> Write one for this post</button>
        {r.id.startsWith("find:") && <button onClick={() => setMore(more === "save" ? "" : "save")} className="text-sm text-slate-600 inline-flex items-center gap-1 px-2 py-1"><Plus size={14} /> Save them</button>}
        {saved && (
          <label className="text-sm text-slate-600 inline-flex items-center gap-1 px-2 py-1">
            <input type="checkbox" checked={!!saved.followed} onChange={(e) => post({ action: "follow", handle: saved.handle, followed: e.target.checked })} /> Followed
          </label>
        )}
      </div>
      {more === "write" && (
        <div className="space-y-2 text-sm">
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} placeholder="What's in the post? e.g. new fall menu, a white house with blue lights, a ribbon cutting"
            className="w-full rounded-lg border border-slate-300 p-2 bg-white" />
          <button disabled={busy || !about.trim()} onClick={write} className="rounded-lg px-3 py-1.5 font-semibold text-white disabled:opacity-50" style={{ background: NAVY }}>Write 3</button>
          {err && <p className="text-red-600">{err}</p>}
          {written.map((c) => (
            <button key={c} onClick={() => { setText(c); setMore(""); setWritten([]); setAbout(""); }} className="block w-full text-left rounded-lg border border-slate-200 p-2 hover:bg-slate-50">{c}</button>
          ))}
        </div>
      )}
      {more === "save" && <AddBusiness d={d} post={post} kind={r.id.split(":")[2]} town={r.id.split(":")[1]} onDone={() => setMore("")} />}
    </div>
  );
}

function AddBusiness({ d, post, kind, town, onDone }: { d: Data; post: (j: object) => Promise<void>; kind?: string; town?: string; onDone?: () => void }) {
  const [handle, setHandle] = useState("");
  const [k, setK] = useState(kind ?? "other");
  const [t, setT] = useState(town ?? d.towns[0]);
  return (
    <form className="flex gap-2 flex-wrap items-center text-sm py-1" onSubmit={async (e) => { e.preventDefault(); if (!handle.trim()) return; await post({ action: "add", handle, kind: k, town: t }); setHandle(""); onDone?.(); }}>
      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@their_instagram or link" className="flex-1 min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1.5 bg-white" />
      <select value={k} onChange={(e) => setK(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white">{d.kinds.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={t} onChange={(e) => setT(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white">{d.towns.map((x) => <option key={x}>{x}</option>)}</select>
      <button className="rounded-lg px-3 py-1.5 font-semibold text-white" style={{ background: NAVY }}>Save</button>
    </form>
  );
}
