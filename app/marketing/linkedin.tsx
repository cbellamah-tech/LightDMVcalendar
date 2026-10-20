"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ImageOff, Loader2, RefreshCw, Send, Sparkles, Undo2, X } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card } from "./parts";

/* LinkedIn: posts written ahead for each posting day, each with a Drive photo. Approve, and it goes out on its day. */

type Post = {
  id: string; day: string; theme: string; text: string; photo?: { id: string; name: string };
  status: "draft" | "approved" | "posted" | "skipped" | "failed"; writer: "claude" | "starter";
  approved?: { at: number; by: string }; posted?: { at: number; by: string; accounts: string[] }; error?: string;
};
type Data = {
  ghl: boolean; ai: boolean; settings: { perWeek: 1 | 2 };
  accounts: { name: string; expired?: boolean }[];
  upcoming: Post[]; done: Post[]; writing: boolean; today: string;
};

const dayName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const thumb = (id: string, w = 400) => `/api/marketing/social/thumb?id=${encodeURIComponent(id)}&w=${w}`;

export function LinkedInPosts() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => api<Data>("/api/marketing/linkedin").then(setD).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // While the next posts are being written, look again shortly.
  useEffect(() => { if (d?.writing) { const t = setTimeout(load, 20_000); return () => clearTimeout(t); } }, [d, load]);

  async function act(key: string, json: any) {
    setBusy(key); setMsg("");
    try { setD(await api<Data>("/api/marketing/linkedin", { method: "POST", json })); }
    catch (e: any) { setMsg(e.message); load(); }
    finally { setBusy(""); }
  }

  if (!d) return <Card title="LinkedIn posts"><p className="text-sm text-slate-500 flex gap-2">{msg || <><Loader2 className="animate-spin" size={16} /> Loading...</>}</p></Card>;

  const live = d.accounts.filter((a) => !a.expired);
  const drafts = d.upcoming.filter((p) => p.status === "draft");
  return (
    <Card title="LinkedIn posts"
      right={
        <span className="flex items-center gap-1 text-xs">
          {([1, 2] as const).map((k) => (
            <button key={k} onClick={() => act("week", { action: "perWeek", perWeek: k })}
              className={`px-2 py-1 rounded ${d.settings.perWeek === k ? "bg-slate-200 font-semibold" : "text-slate-500"}`}>
              {k === 1 ? "Tuesdays" : "Tue and Thu"}
            </button>
          ))}
        </span>
      }>
      <p className="text-sm text-slate-600">
        A post for each {d.settings.perWeek === 1 ? "Tuesday" : "Tuesday and Thursday"}, with a job photo from Drive. Nothing goes up until you tap Approve; approved posts go out that morning.
      </p>
      {!d.ghl ? (
        <p className="text-sm text-amber-700">GoHighLevel isn't connected yet (Setup below).</p>
      ) : live.length ? (
        <p className="text-xs text-slate-500">Posts to {live.map((a) => a.name).join(" and ")} on LinkedIn, through GoHighLevel.</p>
      ) : (
        <p className="text-sm text-amber-700">
          {d.accounts.length ? "LinkedIn needs reconnecting in GoHighLevel" : "LinkedIn isn't connected in GoHighLevel yet"}: in GoHighLevel, Marketing, Social Planner, tap Settings and connect the Light DMV LinkedIn page. The posts below wait until then.
        </p>
      )}
      {!d.ai && <p className="text-xs text-slate-500">Words are from Light DMV's starter posts. With a Claude key pasted once on any customer page, each post gets fresh words.</p>}

      {drafts.length > 1 && (
        <button disabled={!!busy} onClick={() => act("all", { action: "approveAll" })}
          className="w-full sm:w-auto rounded-xl px-6 py-3 text-white text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "#1F9D55" }}>
          {busy === "all" ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />} Approve all {drafts.length}
        </button>
      )}

      <div className="space-y-3">
        {d.upcoming.map((p) => <PostCard key={p.id} p={p} today={d.today} busy={busy} act={act} canPost={d.ghl && live.length > 0} />)}
        {d.writing && <p className="text-sm text-slate-500 flex gap-2"><Loader2 className="animate-spin" size={16} /> Writing the next posts...</p>}
        {!d.upcoming.length && !d.writing && <p className="text-sm text-slate-500">Nothing waiting.</p>}
      </div>

      {d.done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-slate-600">On LinkedIn ({d.done.length})</summary>
          <div className="mt-2 divide-y divide-slate-100">
            {d.done.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5">
                {p.photo ? <img src={thumb(p.photo.id, 120)} alt="" loading="lazy" className="w-10 h-10 rounded object-cover bg-slate-100" /> : <span className="w-10 h-10 rounded bg-slate-100" />}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{p.text.split("\n")[0]}</span>
                  <span className="block text-xs text-slate-500">{dayName(p.day)}{p.posted ? `, ${ago(p.posted.at)} by ${p.posted.by}` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {msg && <p className="text-sm text-red-600 break-words">{msg}</p>}
    </Card>
  );
}

function PostCard({ p, today, busy, act, canPost }: { p: Post; today: string; busy: string; act: (key: string, json: any) => Promise<void>; canPost: boolean }) {
  const [text, setText] = useState(p.text);
  useEffect(() => { setText(p.text); }, [p.text]);
  const k = (s: string) => `${p.id}:${s}`;
  const spin = (s: string, icon: React.ReactNode) => (busy === k(s) ? <Loader2 className="animate-spin" size={15} /> : icon);
  const late = p.day < today && p.status === "draft";
  const chip =
    p.status === "approved" ? <span className="text-xs font-semibold text-green-700">Approved, posts {p.day === today ? "today" : dayName(p.day)}</span>
    : p.status === "failed" ? <span className="text-xs font-semibold text-red-600">Didn't post</span>
    : p.status === "skipped" ? <span className="text-xs text-slate-500">Skipped</span>
    : <span className={`text-xs font-semibold ${late ? "text-amber-700" : "text-slate-500"}`}>{late ? "Missed its day: Post now or skip" : "Waiting for your OK"}</span>;
  const btn = "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50";
  const save = () => { if (text !== p.text) act(k("text"), { action: "edit", id: p.id, text }); };

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${p.status === "approved" ? "border-green-300 bg-green-50/40" : p.status === "skipped" ? "border-slate-200 opacity-60" : "border-slate-200"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm" style={{ color: NAVY }}>{dayName(p.day)}</span>
        {chip}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="sm:w-40 shrink-0">
          {p.photo ? <img src={thumb(p.photo.id)} alt={p.photo.name} loading="lazy" className="w-full sm:w-40 h-40 rounded-lg object-cover bg-slate-100" />
            : <div className="w-full sm:w-40 h-24 rounded-lg bg-slate-100 text-xs text-slate-500 flex items-center justify-center">No photo</div>}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} disabled={p.status === "skipped"}
          rows={10} className="flex-1 w-full rounded-lg border border-slate-200 p-2 text-sm leading-relaxed" />
      </div>
      {p.error && <p className="text-xs text-red-600 break-words">{p.error}</p>}
      <div className="flex flex-wrap gap-2">
        {p.status === "skipped" ? (
          <button disabled={!!busy} onClick={() => act(k("back"), { action: "edit", id: p.id, skip: false })} className={`${btn} bg-slate-100`}>{spin("back", <Undo2 size={15} />)} Bring back</button>
        ) : (
          <>
            {p.status === "approved" ? (
              <button disabled={!!busy} onClick={() => act(k("ok"), { action: "edit", id: p.id, approve: false })} className={`${btn} bg-slate-100`}>{spin("ok", <Undo2 size={15} />)} Not yet</button>
            ) : !late && (
              <button disabled={!!busy} onClick={() => act(k("ok"), { action: "edit", id: p.id, text, approve: true })} className={`${btn} text-white`} style={{ background: "#1F9D55" }}>{spin("ok", <Check size={15} />)} Approve</button>
            )}
            {canPost && (
              <button disabled={!!busy} onClick={() => act(k("post"), { action: "post", id: p.id })} className={`${btn} text-white`} style={{ background: NAVY }}>{spin("post", <Send size={15} />)} {p.status === "failed" ? "Try again" : "Post now"}</button>
            )}
            <button disabled={!!busy} onClick={() => act(k("words"), { action: "edit", id: p.id, rewrite: true })} className={`${btn} bg-slate-100`}>{spin("words", <Sparkles size={15} />)} New words</button>
            <button disabled={!!busy} onClick={() => act(k("photo"), { action: "edit", id: p.id, photo: "new" })} className={`${btn} bg-slate-100`}>{spin("photo", <RefreshCw size={15} />)} New photo</button>
            {p.photo && <button disabled={!!busy} onClick={() => act(k("nophoto"), { action: "edit", id: p.id, photo: "none" })} className={`${btn} bg-slate-100`}>{spin("nophoto", <ImageOff size={15} />)} No photo</button>}
            <button disabled={!!busy} onClick={() => act(k("skip"), { action: "edit", id: p.id, skip: true })} className={`${btn} bg-slate-100`}>{spin("skip", <X size={15} />)} Skip</button>
          </>
        )}
      </div>
    </div>
  );
}
