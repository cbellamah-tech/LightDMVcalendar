"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Film, Loader2, RefreshCw, Send } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card } from "./parts";

/* ---------- Today's media: watch it, tweak the words, tap Post ---------- */

type Platform = "facebook" | "instagram" | "linkedin" | "google";
export type Media = {
  id: string; day: string; kind: "video" | "photo"; url: string; contentType: string; title: string;
  captions: Partial<Record<Platform, string>>; createdAt: number; by: string;
  posts?: { at: number; by: string; platforms: string[]; ok: boolean; error?: string }[];
};
type Account = { platform: string; name: string; expired?: boolean };

const has = (accounts: Account[], p: string) => accounts.some((a) => a.platform.toLowerCase().includes(p) && !a.expired);

export function MediaBoard({ media, platforms, accounts, ghlOn, today, reload }: {
  media: Media[]; platforms: { id: Platform; label: string }[]; accounts: Account[]; ghlOn: boolean; today: string; reload: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const m = media.find((x) => x.id === pick) ?? media[0];
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [caps, setCaps] = useState<Partial<Record<Platform, string>>>({});
  const [tab, setTab] = useState<Platform>("facebook");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!m) return;
    setCaps(m.captions);
    setOn(Object.fromEntries(platforms.map((p) => [p.id, has(accounts, p.id)])));
    setMsg("");
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = platforms.filter((p) => on[p.id]);
  const posted = (m?.posts ?? []).filter((p) => p.ok || p.platforms.length);

  async function post() {
    if (!m || !chosen.length) return;
    setBusy(true); setMsg("");
    try {
      const r = await api("/api/marketing/media", { method: "POST", json: { id: m.id, platforms: chosen.map((p) => p.id), captions: caps } });
      const good = r.results.filter((x: any) => x.ok).map((x: any) => x.platform);
      const bad = r.results.filter((x: any) => !x.ok);
      setMsg([good.length ? `Posted to ${good.join(", ")}.` : "", ...bad.map((x: any) => `${x.platform}: ${x.error}`)].filter(Boolean).join(" "));
      reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function saveCaption() {
    if (!m) return;
    await api("/api/marketing/media", { method: "PATCH", json: { id: m.id, captions: caps } }).catch(() => {});
  }
  async function skip() {
    if (!m || !window.confirm("Hide this one?")) return;
    await api("/api/marketing/media", { method: "PATCH", json: { id: m.id, skipped: true } }).catch((e) => setMsg(e.message));
    setPick(null); reload();
  }

  if (!m)
    return (
      <Card title="Today's post">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Film className="text-slate-400 shrink-0" />
          <p>Every morning a fresh video made from your newest Drive job photos lands here, with the words written for each site. You watch it and tap Post. The first one comes the morning after Google is connected (Setup below).</p>
        </div>
      </Card>
    );

  return (
    <Card title={m.day === today ? "Today's post" : `Post from ${m.day.slice(5).replace("-", "/")}`}
      right={posted.length ? <span className="text-xs font-semibold text-green-700 inline-flex items-center gap-1"><Check size={14} /> Posted {ago(posted[posted.length - 1].at)}</span> : null}>
      <div className="grid md:grid-cols-[minmax(0,280px)_1fr] gap-4">
        <div className="mx-auto w-full max-w-[280px]">
          {m.kind === "video"
            ? <video key={m.url} src={`${m.url}#t=1`} controls playsInline loop className="w-full rounded-xl bg-black aspect-[9/16]" />
            : <img src={m.url} alt={m.title} className="w-full rounded-xl" />}
          <div className="flex gap-3 text-xs mt-1 text-slate-500">
            <a href={m.url} download className="underline inline-flex items-center gap-1">Download <ExternalLink size={11} /></a>
            <button onClick={skip} className="underline">Hide</button>
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          <div className="font-bold">{m.title}</div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Post to</div>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => {
                const ok = has(accounts, p.id);
                return (
                  <button key={p.id} disabled={!ok} onClick={() => setOn({ ...on, [p.id]: !on[p.id] })}
                    title={ok ? "" : `${p.label} isn't connected in GoHighLevel's Social Planner`}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${on[p.id] ? "text-white border-transparent" : "border-slate-300 text-slate-600"} disabled:opacity-40`}
                    style={on[p.id] ? { background: NAVY } : undefined}>
                    {on[p.id] && <Check size={13} className="inline -mt-0.5 mr-1" />}{p.label}
                  </button>
                );
              })}
            </div>
            {!ghlOn && <p className="text-xs text-slate-500 mt-1">The buttons light up once GoHighLevel is connected (Setup below). Until then, Download and post it by hand.</p>}
          </div>
          <div>
            <div className="flex gap-1 text-xs font-semibold mb-1">
              {platforms.map((p) => (
                <button key={p.id} onClick={() => setTab(p.id)} className={`px-2 py-1 rounded ${tab === p.id ? "bg-slate-200" : "text-slate-500"}`}>{p.label}</button>
              ))}
            </div>
            <textarea value={caps[tab] ?? ""} onChange={(e) => setCaps({ ...caps, [tab]: e.target.value })} onBlur={saveCaption}
              rows={6} className="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Words for this post" />
          </div>
          <button disabled={busy || !chosen.length || !ghlOn} onClick={post}
            className="w-full sm:w-auto rounded-xl px-6 py-3 text-white text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "#1F9D55" }}>
            {busy ? <Loader2 className="animate-spin" /> : <Send size={20} />} Post now{chosen.length ? ` to ${chosen.length}` : ""}
          </button>
          {msg && <p className="text-sm break-words">{msg}</p>}
          {(m.posts ?? []).map((p, i) => (
            <p key={i} className={`text-xs ${p.ok ? "text-green-700" : "text-red-600"}`}>
              {p.by} posted to {p.platforms.join(", ") || "nothing"} {ago(p.at)}{p.error ? `. ${p.error}` : ""}
            </p>
          ))}
        </div>
      </div>
      {media.length > 1 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Earlier</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {media.map((x) => (
              <button key={x.id} onClick={() => setPick(x.id)} className={`shrink-0 w-20 rounded-lg overflow-hidden border-2 ${x.id === m.id ? "border-slate-700" : "border-transparent"}`}>
                {x.kind === "video" ? <video src={`${x.url}#t=2`} muted preload="metadata" className="w-20 aspect-[9/16] object-cover bg-black" /> : <img src={x.url} alt="" className="w-20 aspect-[9/16] object-cover" />}
                <div className="text-[10px] py-0.5 bg-slate-100 flex items-center justify-center gap-1">
                  {x.day.slice(5).replace("-", "/")}{x.posts?.some((p) => p.ok) && <Check size={10} className="text-green-700" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- The campaign sheet, this month, read live from Google ---------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const num = (s?: string) => { const n = Number(String(s ?? "").replace(/[$,%\s]/g, "")); return Number.isFinite(n) ? n : 0; };

export function SheetView({ today, owner, sheetUrl }: { today: string; owner: boolean; sheetUrl: string }) {
  const [g, setG] = useState<{ connected: boolean; at?: number; rows: string[][]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState(Math.min(12, Math.max(7, +today.slice(5, 7))));
  const load = useCallback((refresh = false) => api(`/api/marketing/sheet${refresh ? "?refresh=1" : ""}`).then(setG).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const thisMonth = +today.slice(5, 7);
  const thisWeek = Math.min(4, Math.ceil(+today.slice(8, 10) / 7));
  const start = 2 + (month - 7) * 5; // the sheet's layout: July starts at column C, 4 weeks + a total per month
  const rows = useMemo(() => (g?.rows ?? []).filter((r) => (r[0] ?? "").trim() && !/^(marketing|channel|task|week)/i.test(r[0])), [g]);

  async function sync() {
    setBusy(true); setMsg("");
    try {
      const r = await api("/api/marketing/sheet", { method: "POST" });
      setMsg(r.error ? `Sheet: ${r.error}` : `Synced: ${r.written} cells updated from the app.`);
      await load(true);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <Card title="2026 Marketing Campaign sheet"
      right={<span className="flex items-center gap-2">
        {g?.at && <span className="text-xs text-slate-400">{ago(g.at)}</span>}
        {owner && g?.connected && <button disabled={busy} onClick={sync} className="text-xs font-semibold rounded-md border border-slate-300 px-2 py-1 inline-flex items-center gap-1"><RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Sync now</button>}
        <a href={sheetUrl} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">Open <ExternalLink size={11} /></a>
      </span>}>
      {!g ? <p className="text-sm text-slate-500 flex gap-2"><Loader2 size={16} className="animate-spin" /> Reading the sheet...</p>
        : !g.connected ? <p className="text-sm text-slate-500">The sheet shows here, synced both ways, once Google is connected (Setup below). The app writes its counts into it every morning.</p>
        : (
          <>
            <div className="flex gap-1 flex-wrap text-xs font-semibold">
              {[7, 8, 9, 10, 11, 12].map((mo) => (
                <button key={mo} onClick={() => setMonth(mo)} className={`px-2.5 py-1 rounded-full ${month === mo ? "text-white" : "bg-slate-100 text-slate-600"}`} style={month === mo ? { background: NAVY } : undefined}>
                  {MONTHS[mo - 1].slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="text-left font-semibold py-1 pr-2">Channel</th>
                    {[1, 2, 3, 4].map((w) => (
                      <th key={w} className={`text-right font-semibold px-2 ${month === thisMonth && w === thisWeek ? "text-slate-900" : ""}`}>
                        Wk {w}{month === thisMonth && w === thisWeek ? " ●" : ""}
                      </th>
                    ))}
                    <th className="text-right font-semibold px-2">Month</th>
                    <th className="text-left font-semibold px-2 w-32">Goal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const weeks = [0, 1, 2, 3].map((k) => r[start + k] ?? "");
                    const total = r[start + 4] || String(weeks.reduce((s, v) => s + num(v), 0) || "");
                    const goal = num(r[1]);
                    const pct = goal ? Math.min(100, Math.round((num(total) / goal) * 100)) : 0;
                    return (
                      <tr key={i}>
                        <td className="py-1.5 pr-2 font-medium">{r[0]}</td>
                        {weeks.map((v, k) => (
                          <td key={k} className={`text-right tabular-nums px-2 ${month === thisMonth && k + 1 === thisWeek ? "bg-amber-50 font-bold" : ""}`}>{v}</td>
                        ))}
                        <td className="text-right tabular-nums px-2 font-semibold">{total}</td>
                        <td className="px-2">
                          {goal ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 rounded bg-slate-100 overflow-hidden"><div className="h-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#1F9D55" : pct >= 50 ? "#D97706" : "#DC2626" }} /></div>
                              <span className="text-xs tabular-nums text-slate-500">{r[1]}</span>
                            </div>
                          ) : <span className="text-xs text-slate-400">{r[1]}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Read live from the Google sheet. The app writes its own counts into this month's weeks every morning; anything typed into the sheet shows here too.</p>
          </>
        )}
      {(msg || g?.error) && <p className={`text-sm break-words ${msg.startsWith("Synced") ? "text-green-700" : "text-red-600"}`}>{msg || g?.error}</p>}
    </Card>
  );
}
