"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Film, Image as ImageIcon, Loader2, RefreshCw, Send, X } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card } from "./parts";

/* Social posts: GoHighLevel's numbers per day and platform, and a Post screen fed by the daily reels and Drive. */

type Platform = "facebook" | "instagram" | "linkedin" | "google" | "youtube";
type StatRow = { day: string; platform: string; account: string; posts: number; likes: number; impressions: number; followers: number };
type WeekRow = { platform: string; account: string; posts: number; likes: number; comments: number; shares: number; impressions: number; reach: number; followers: number };
type DriveItem = { id: string; name: string; kind: "photo" | "video"; createdTime: string; folderName?: string; seconds?: number };
type Reel = { id: string; day: string; kind: "video" | "photo"; url: string; title: string; captions: Partial<Record<Platform, string>>; still?: string; posted: boolean };
type Log = { at: number; by: string; title: string; thumb: string; platforms: string[]; errors?: string };
type Data = {
  ghl: boolean;
  accounts: { platform: string; name: string; expired?: boolean }[];
  platforms: { id: Platform; label: string }[];
  stats: { at: number; rows: StatRow[]; week: WeekRow[]; weekEnds?: string; errors: string[] };
  drive: { at: number; error?: string; items: DriveItem[] };
  reels: Reel[];
  log: Log[];
  refreshing: boolean;
};

const NAME: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", google: "Google Business", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok" };
const pname = (p: string) => NAME[p] ?? p;
const n = (x: number) => x.toLocaleString();
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" });
const thumb = (id: string, w = 300) => `/api/marketing/social/thumb?id=${encodeURIComponent(id)}&w=${w}`;

export function SocialPosts() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback((refresh = false) =>
    api<Data>(`/api/marketing/social${refresh ? "?refresh=1" : ""}`).then(setD).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (!d) return <Card title="Social posts"><p className="text-sm text-slate-500 flex gap-2">{msg || <><Loader2 className="animate-spin" size={16} /> Loading...</>}</p></Card>;

  return (
    <Card title="Social posts"
      right={
        <span className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{d.stats.at ? `GoHighLevel, ${ago(d.stats.at)}` : d.refreshing ? "Pulling from GoHighLevel..." : ""}</span>
          <button title="Pull fresh numbers and Drive files" aria-label="Refresh" className="p-1 rounded hover:bg-slate-100"
            onClick={() => { setBusy(true); load(true).finally(() => setTimeout(() => { load().finally(() => setBusy(false)); }, 8000)); }}>
            <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
          </button>
        </span>
      }>
      <button onClick={() => setPosting(!posting)}
        className="w-full sm:w-auto rounded-xl px-6 py-3 text-white text-lg font-bold inline-flex items-center justify-center gap-2" style={{ background: posting ? "#64748B" : "#1F9D55" }}>
        {posting ? <><X size={20} /> Close</> : <><Send size={20} /> Make a post</>}
      </button>
      {posting && <PostScreen d={d} reload={load} />}
      <StatsTable d={d} />
      {d.log.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-slate-600">Posted from the app ({d.log.length})</summary>
          <div className="mt-2 divide-y divide-slate-100">
            {d.log.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                {l.thumb ? <img src={l.thumb} alt="" loading="lazy" className="w-10 h-10 rounded object-cover bg-slate-100" /> : <span className="w-10 h-10 rounded bg-slate-100" />}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{l.title}</span>
                  <span className={`block text-xs ${l.errors ? "text-red-600" : "text-slate-500"}`}>
                    {l.by}, {ago(l.at)}: {l.platforms.length ? l.platforms.map(pname).join(", ") : "nothing posted"}{l.errors ? `. ${l.errors}` : ""}
                  </span>
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

/* ---------- The numbers ---------- */

function StatsTable({ d }: { d: Data }) {
  const [days, setDays] = useState(30);
  const [plat, setPlat] = useState<string | null>(null);
  const [shown, setShown] = useState(10);

  const since = useMemo(() => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10), [days]);
  const inRange = d.stats.rows.filter((r) => r.day >= since);
  const totals = useMemo(() => {
    const m = new Map<string, { platform: string; posts: number; likes: number; impressions: number; followers: number }>();
    for (const r of inRange) {
      const t = m.get(r.platform) ?? { platform: r.platform, posts: 0, likes: 0, impressions: 0, followers: 0 };
      t.posts += r.posts; t.likes += r.likes; t.impressions += r.impressions; t.followers += r.followers;
      m.set(r.platform, t);
    }
    return [...m.values()].sort((a, b) => b.impressions - a.impressions);
  }, [inRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = inRange.filter((r) => !plat || r.platform === plat).sort((a, b) => b.day.localeCompare(a.day) || a.platform.localeCompare(b.platform));

  if (!d.ghl) return <p className="text-sm text-slate-500">The posts table fills once GoHighLevel is connected (Setup below).</p>;
  if (!d.stats.rows.length)
    return (
      <div className="text-sm text-slate-500 space-y-1">
        <p>{d.refreshing ? "Pulling the numbers from GoHighLevel. Tap refresh in a moment." : "No numbers from GoHighLevel yet."}</p>
        {d.stats.errors.map((e, i) => <p key={i} className="text-xs text-red-600 break-words">{e}</p>)}
      </div>
    );

  const th = "px-2 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap";
  const td = "px-2 py-1.5 tabular-nums whitespace-nowrap";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm flex-1">Posts on each platform</span>
        {[7, 30, 90].map((k) => (
          <button key={k} onClick={() => { setDays(k); setShown(10); }} className={`text-xs px-2 py-1 rounded ${days === k ? "bg-slate-200 font-semibold" : "text-slate-500"}`}>{k} days</button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {totals.map((t) => (
          <button key={t.platform} onClick={() => { setPlat(plat === t.platform ? null : t.platform); setShown(10); }}
            className={`text-left rounded-lg p-2 border ${plat === t.platform ? "border-slate-700 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <div className="font-semibold text-sm">{pname(t.platform)}</div>
            <div className="text-xs text-slate-600 tabular-nums">{n(t.posts)} posts · {n(t.impressions)} views<br />{n(t.likes)} likes · {t.followers >= 0 ? "+" : ""}{n(t.followers)} followers</div>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr>
            <th className={th}>Date</th><th className={th}>Platform</th><th className={th}>Account</th>
            <th className={th}>Posts</th><th className={th}>Likes</th><th className={th}>Impressions</th><th className={th}>New followers</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, shown).map((r) => (
              <tr key={`${r.day}|${r.platform}|${r.account}`}>
                <td className={td}>{shortDay(r.day)}</td>
                <td className={td}><button className="underline decoration-dotted" onClick={() => setPlat(plat === r.platform ? null : r.platform)}>{pname(r.platform)}</button></td>
                <td className={`${td} max-w-[140px] truncate`}>{r.account}</td>
                <td className={td}>{r.posts}</td><td className={td}>{n(r.likes)}</td><td className={td}>{n(r.impressions)}</td><td className={td}>{r.followers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex-1">Showing {Math.min(shown, rows.length)} of {rows.length}{plat ? ` (${pname(plat)} only, tap it again for all)` : ""}</span>
        {rows.length > shown && <button className="underline" onClick={() => setShown(shown + 20)}>Show more</button>}
      </div>
      {d.stats.week.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-slate-600">Last 7 days with shares, comments and reach</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className={th}>Platform</th><th className={th}>Account</th><th className={th}>Likes</th><th className={th}>Shares</th><th className={th}>Comments</th>
                <th className={th}>Posts</th><th className={th}>Impressions</th><th className={th}>Followers</th><th className={th}>Reach</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.stats.week.map((w) => (
                  <tr key={`${w.platform}|${w.account}`}>
                    <td className={td}>{pname(w.platform)}</td><td className={`${td} max-w-[140px] truncate`}>{w.account}</td>
                    <td className={td}>{n(w.likes)}</td><td className={td}>{n(w.shares)}</td><td className={td}>{n(w.comments)}</td><td className={td}>{w.posts}</td>
                    <td className={td}>{n(w.impressions)}</td><td className={td}>{n(w.followers)}</td><td className={td}>{n(w.reach)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-1">GoHighLevel gives shares, comments and reach only as a 7-day total{d.stats.weekEnds ? ` (to ${shortDay(d.stats.weekEnds)})` : ""}, so they aren't in the daily table.</p>
        </details>
      )}
      {d.stats.errors.map((e, i) => <p key={i} className="text-xs text-red-600 break-words">{e}</p>)}
    </div>
  );
}

/* ---------- The Post screen ---------- */

const STARTERS = [
  "Another home lit up for the season ✨ Professional Christmas light installation across DC, Maryland and Virginia. We design, install, take down and store. Get a fast quote at lightdmv.com",
  "Skip the ladder this year. Light DMV handles everything: custom-cut lights, install, takedown in January and storage. Book your install at lightdmv.com",
  "Spots are filling up for this season! Tap the link to get your free quote from Light DMV: lightdmv.com",
];

type Pick = { source: "reel"; reel: Reel } | { source: "drive"; item: DriveItem };

function PostScreen({ d, reload }: { d: Data; reload: () => void }) {
  const [tab, setTab] = useState<"reels" | "video" | "photo">(d.reels.length ? "reels" : "video");
  const [folder, setFolder] = useState<string>("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [each, setEach] = useState(false);
  const [caps, setCaps] = useState<Partial<Record<Platform, string>>>({});
  const [capTab, setCapTab] = useState<Platform>("facebook");
  const [shown, setShown] = useState(24);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const connected = (p: string) => d.accounts.some((a) => a.platform.toLowerCase().includes(p) && !a.expired);
  useEffect(() => { setOn(Object.fromEntries(d.platforms.map((p) => [p.id, connected(p.id)]))); }, [d.accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const files = d.drive.items.filter((x) => tab !== "reels" && x.kind === tab);
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of files) if (f.folderName) m.set(f.folderName, (m.get(f.folderName) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [files]);
  const list = files.filter((f) => !folder || f.folderName === folder);

  function choose(p: Pick) {
    setPick(p); setMsg("");
    if (p.source === "reel") {
      setText(p.reel.captions.facebook ?? p.reel.title);
      setCaps(p.reel.captions);
    }
  }

  const chosen = d.platforms.filter((p) => on[p.id]);
  const starters = [...d.reels.map((r) => r.captions.facebook).filter((x): x is string => !!x).slice(0, 5), ...STARTERS];

  async function post() {
    if (!pick || !chosen.length) return;
    setBusy(true); setMsg("");
    const captions = Object.fromEntries(chosen.map((p) => [p.id, each ? (caps[p.id] ?? text) : text]));
    try {
      const r = await api("/api/marketing/social", {
        method: "POST",
        json: { source: pick.source, id: pick.source === "reel" ? pick.reel.id : pick.item.id, platforms: chosen.map((p) => p.id), captions },
      });
      const good = r.results.filter((x: any) => x.ok).map((x: any) => pname(x.platform));
      const bad = r.results.filter((x: any) => !x.ok);
      setMsg([good.length ? `Posted to ${good.join(", ")}.` : "", ...bad.map((x: any) => `${pname(x.platform)}: ${x.error}`)].filter(Boolean).join(" "));
      if (good.length) setPick(null);
      reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  const tabBtn = (id: typeof tab, label: string, count: number) => (
    <button onClick={() => { setTab(id); setFolder(""); setShown(24); }}
      className={`px-3 py-1.5 rounded-full text-sm font-semibold ${tab === id ? "text-white" : "text-slate-600 bg-slate-100"}`} style={tab === id ? { background: NAVY } : undefined}>
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="text-sm font-semibold">1. Pick something ready-made</div>
      <div className="flex gap-2 flex-wrap">
        {tabBtn("reels", "Daily reels", d.reels.length)}
        {tabBtn("video", "Drive videos", d.drive.items.filter((x) => x.kind === "video").length)}
        {tabBtn("photo", "Drive photos", d.drive.items.filter((x) => x.kind === "photo").length)}
      </div>
      {tab !== "reels" && folders.length > 1 && (
        <div className="flex gap-1.5 flex-wrap text-xs">
          <button onClick={() => setFolder("")} className={`px-2 py-1 rounded ${!folder ? "bg-slate-200 font-semibold" : "text-slate-500"}`}>All folders</button>
          {folders.slice(0, 12).map(([f, c]) => (
            <button key={f} onClick={() => { setFolder(f); setShown(24); }} className={`px-2 py-1 rounded ${folder === f ? "bg-slate-200 font-semibold" : "text-slate-500"}`}>{f} ({c})</button>
          ))}
        </div>
      )}
      {tab !== "reels" && d.drive.error && <p className="text-xs text-red-600 break-words">{d.drive.error}</p>}
      {tab !== "reels" && !d.drive.items.length && !d.drive.error && (
        <p className="text-sm text-slate-500">{d.refreshing ? "Reading Drive... tap refresh at the top in a moment." : "No photos or videos found in Drive."}</p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {tab === "reels"
          ? d.reels.map((r) => {
              const sel = pick?.source === "reel" && pick.reel.id === r.id;
              return (
                <button key={r.id} onClick={() => choose({ source: "reel", reel: r })} className={`relative rounded-lg overflow-hidden aspect-[9/16] bg-slate-900 ${sel ? "ring-4 ring-green-600" : ""}`}>
                  {r.still ? <img src={r.still} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <video src={`${r.url}#t=1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />}
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[11px] px-1 py-0.5 text-left">{r.day.slice(5).replace("-", "/")}{r.posted ? " · posted" : ""}</span>
                </button>
              );
            })
          : list.slice(0, shown).map((f) => {
              const sel = pick?.source === "drive" && pick.item.id === f.id;
              return (
                <button key={f.id} onClick={() => choose({ source: "drive", item: f })} title={f.name}
                  className={`relative rounded-lg overflow-hidden aspect-square bg-slate-100 ${sel ? "ring-4 ring-green-600" : ""}`}>
                  <img src={thumb(f.id)} alt={f.name} loading="lazy" className="w-full h-full object-cover" />
                  {f.kind === "video" && <span className="absolute top-1 left-1 bg-black/60 text-white rounded px-1 text-[11px] inline-flex items-center gap-0.5"><Film size={11} />{f.seconds ? `${f.seconds}s` : ""}</span>}
                </button>
              );
            })}
      </div>
      {tab !== "reels" && list.length > shown && <button className="text-xs underline text-slate-600" onClick={() => setShown(shown + 48)}>Show more ({list.length - shown} left)</button>}

      {pick && (
        <div className="grid md:grid-cols-[minmax(0,240px)_1fr] gap-4 border-t border-slate-100 pt-3">
          <div className="mx-auto w-full max-w-[240px]">
            {pick.source === "reel"
              ? pick.reel.kind === "video"
                ? <video key={pick.reel.url} src={`${pick.reel.url}#t=1`} controls playsInline className="w-full rounded-xl bg-black aspect-[9/16]" />
                : <img src={pick.reel.url} alt="" className="w-full rounded-xl" />
              : <div className="relative">
                  <img src={thumb(pick.item.id, 800)} alt={pick.item.name} className="w-full rounded-xl" />
                  {pick.item.kind === "video" && <span className="absolute top-2 left-2 bg-black/60 text-white rounded px-1.5 py-0.5 text-xs inline-flex items-center gap-1"><Film size={12} /> Video{pick.item.seconds ? `, ${pick.item.seconds}s` : ""}</span>}
                </div>}
            <div className="text-xs text-slate-500 mt-1 truncate flex items-center gap-1">
              {pick.source === "drive" ? <><ImageIcon size={11} /> {pick.item.folderName ? `${pick.item.folderName} · ` : ""}{pick.item.name}</> : pick.reel.title}
            </div>
          </div>
          <div className="space-y-3 min-w-0">
            <div>
              <div className="text-sm font-semibold mb-1">2. Where</div>
              <div className="flex flex-wrap gap-2">
                {d.platforms.map((p) => {
                  const ok = connected(p.id);
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
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold flex-1">3. Words</span>
                <select value="" onChange={(e) => { if (e.target.value) { setText(e.target.value); setEach(false); } }} className="text-xs border border-slate-300 rounded px-1 py-0.5 max-w-[180px]">
                  <option value="">Use saved words...</option>
                  {starters.map((s, i) => <option key={i} value={s}>{s.slice(0, 60)}</option>)}
                </select>
              </div>
              {!each ? (
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Words for the post" />
              ) : (
                <>
                  <div className="flex gap-1 text-xs font-semibold mb-1 flex-wrap">
                    {chosen.map((p) => (
                      <button key={p.id} onClick={() => setCapTab(p.id)} className={`px-2 py-1 rounded ${capTab === p.id ? "bg-slate-200" : "text-slate-500"}`}>{p.label}</button>
                    ))}
                  </div>
                  <textarea value={caps[capTab] ?? text} onChange={(e) => setCaps({ ...caps, [capTab]: e.target.value })} rows={5} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={each} onChange={(e) => { setEach(e.target.checked); if (chosen[0]) setCapTab(chosen[0].id); }} /> Different words for each site
              </label>
            </div>
            <button disabled={busy || !chosen.length || !d.ghl || (!text.trim() && !each)} onClick={post}
              className="w-full sm:w-auto rounded-xl px-6 py-3 text-white text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "#1F9D55" }}>
              {busy ? <Loader2 className="animate-spin" /> : <Send size={20} />} Post now{chosen.length ? ` to ${chosen.length}` : ""}
            </button>
            {busy && pick.source === "drive" && pick.item.kind === "video" && <p className="text-xs text-slate-500">Copying the video from Drive first, this can take a minute.</p>}
            {!d.ghl && <p className="text-xs text-slate-500">Posting works once GoHighLevel is connected (Setup below).</p>}
          </div>
        </div>
      )}
      {msg && <p className="text-sm break-words">{msg}</p>}
    </div>
  );
}
