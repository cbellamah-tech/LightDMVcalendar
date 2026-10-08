"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Film, Loader2, Plus, RefreshCw, Send } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card } from "./parts";

/* ---------- Today's media: watch it, tweak the words, tap Post ---------- */

type Platform = "facebook" | "instagram" | "linkedin" | "google" | "youtube";
type Site = "marketplace" | "craigslist";
type Listing = { title: string; body: string; price?: string; posted?: { at: number; by: string } };
export type Media = {
  id: string; day: string; kind: "video" | "photo"; url: string; contentType: string; title: string;
  captions: Partial<Record<Platform, string>>; createdAt: number; by: string;
  listings?: Partial<Record<Site, Listing>>; stills?: string[];
  posts?: { at: number; by: string; platforms: string[]; ok: boolean; error?: string }[];
};
type Account = { platform: string; name: string; expired?: boolean };

const has = (accounts: Account[], p: string) => accounts.some((a) => a.platform.toLowerCase().includes(p) && !a.expired);

export function MediaBoard({ media, platforms, accounts, ghlOn, autopost, owner, today, reload }: {
  media: Media[]; platforms: { id: Platform; label: string }[]; accounts: Account[]; ghlOn: boolean; autopost: boolean; owner: boolean; today: string; reload: () => void;
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
  async function toggleAuto() {
    await api("/api/marketing/media", { method: "PUT", json: { autopost: !autopost } }).catch((e) => setMsg(e.message));
    reload();
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
          {owner && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autopost} onChange={toggleAuto} disabled={!ghlOn} />
              <span><b>Auto-post</b>: each new daily video posts itself to every connected account. Leave it off to check each one first.</span>
            </label>
          )}
          {msg && <p className="text-sm break-words">{msg}</p>}
          {(m.posts ?? []).map((p, i) => (
            <p key={i} className={`text-xs ${p.ok ? "text-green-700" : "text-red-600"}`}>
              {p.by} posted to {p.platforms.join(", ") || "nothing"} {ago(p.at)}{p.error ? `. ${p.error}` : ""}
            </p>
          ))}
        </div>
      </div>
      <Listings m={m} reload={reload} />
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

/* ---------- Marketplace and Craigslist: no API, so copy, open, post, tap Posted ---------- */

const SITES: { id: Site; label: string; postUrl: string }[] = [
  { id: "marketplace", label: "Facebook Marketplace", postUrl: "https://www.facebook.com/marketplace/create/item" },
  { id: "craigslist", label: "Craigslist", postUrl: "https://post.craigslist.org/" },
];

function Listings({ m, reload }: { m: Media; reload: () => void }) {
  const sites = SITES.filter((x) => m.listings?.[x.id]);
  const [site, setSite] = useState<Site>(sites[0]?.id ?? "marketplace");
  const l = m.listings?.[site];
  const [title, setTitle] = useState(l?.title ?? "");
  const [body, setBody] = useState(l?.body ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle(l?.title ?? ""); setBody(l?.body ?? ""); setMsg(""); }, [m.id, site]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sites.length || !l) return null;
  const info = SITES.find((x) => x.id === site)!;

  async function copyOpen() {
    await navigator.clipboard.writeText(`${title}\n\n${body}`).catch(() => {});
    window.open(info.postUrl, "_blank", "noopener");
    setMsg("Copied. Paste it in, add the photos below, post it, then tap Posted.");
  }
  async function posted() {
    setBusy(true);
    try {
      const r = await api("/api/marketing/listing", { method: "POST", json: { id: m.id, site, title, body } });
      setMsg(r.sheetError ? `Counted. The sheet didn't update: ${r.sheetError}` : "Counted and added to the sheet.");
      reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold flex-1">Listings</span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
          {sites.map((x) => (
            <button key={x.id} onClick={() => setSite(x.id)} aria-pressed={site === x.id}
              className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${site === x.id ? "bg-white shadow-sm" : "text-slate-500"}`}>
              {x.label}{m.listings?.[x.id]?.posted && <Check size={12} className="text-green-700" />}
            </button>
          ))}
        </div>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm font-semibold" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
      {l.price && <p className="text-xs text-slate-500">Price to enter: {l.price}</p>}
      {(m.stills ?? []).length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {m.stills!.map((u, i) => (
            <a key={u} href={u} download={`light-dmv-${i + 1}.jpg`} title="Download this photo" className="shrink-0">
              <img src={u} alt={`Listing photo ${i + 1}`} className="h-20 w-28 object-cover rounded-lg" />
            </a>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button onClick={copyOpen} className="rounded-xl px-4 py-2 font-bold text-white inline-flex items-center gap-2" style={{ background: NAVY }}>
          <ExternalLink size={16} /> Copy and open {info.label}
        </button>
        <button disabled={busy} onClick={posted} className="rounded-xl px-4 py-2 font-bold border border-slate-300 inline-flex items-center gap-2 disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Posted
        </button>
      </div>
      {l.posted && <p className="text-xs text-green-700">{l.posted.by} posted it {ago(l.posted.at)}</p>}
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}

/* ---------- The campaign sheet, this month, read live from Google ---------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const num = (s?: string) => { const n = Number(String(s ?? "").replace(/[$,%\s]/g, "")); return Number.isFinite(n) ? n : 0; };

type SheetCh = { id: string; label: string; box: string; sheetRow: string; auto?: string; link?: string };
const GROUPS: { box: string; title: string }[] = [
  { box: "social", title: "Social posts" },
  { box: "listings", title: "Listings (posted by hand)" },
  { box: "website", title: "Website" },
  { box: "cold", title: "Cold email" },
  { box: "signs", title: "Yard signs and in person" },
  { box: "paid", title: "Paid ads ($ spent)" },
];
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const isHeading = (x: string) => /:\s*$/.test(x) || /^campaign type$/i.test(x.trim());

/** A channel's name, opening wherever that thing lives (the page, the ad account, the app tab). */
export function ChannelName({ c }: { c: { label: string; link?: string } }) {
  if (!c.link) return <>{c.label}</>;
  const inApp = c.link.startsWith("/");
  return (
    <a href={c.link} target={inApp ? undefined : "_blank"} rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
      {c.label}{!inApp && <ExternalLink size={11} className="text-slate-400" />}
    </a>
  );
}

export function SheetView({ today, owner, sheetUrl, channels, onLog, busy: logging, drafts }: {
  today: string; owner: boolean; sheetUrl: string; channels: SheetCh[]; onLog: (id: string, ask?: boolean) => Promise<void> | void; busy: boolean;
  drafts: { text: Record<string, { title?: string; body: string }>; urls: Record<string, string> };
}) {
  const [doing, setDoing] = useState<string | null>(null);
  const [g, setG] = useState<{ connected: boolean; at?: number; rows: string[][]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState(Math.min(12, Math.max(7, +today.slice(5, 7))));
  const load = useCallback((refresh = false) => api(`/api/marketing/sheet${refresh ? "?refresh=1" : ""}`).then(setG).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const thisMonth = +today.slice(5, 7);
  const thisWeek = Math.min(4, Math.ceil(+today.slice(8, 10) / 7));
  const start = 2 + (month - 7) * 5; // the sheet's layout: July starts at column C, 4 weeks + a total per month
  const rows = useMemo(() => (g?.rows ?? []).filter((r) => (r[0] ?? "").trim() && !/^(marketing|channel|task|week)/i.test(r[0]) && !isHeading(r[0])), [g]);
  // The sheet's rows, regrouped the way the tab's boxes are; anything the app doesn't know lands in "Other".
  const groups = useMemo(() => {
    const byRow = new Map(channels.map((c) => [norm(c.sheetRow), c]));
    const out = [...GROUPS, { box: "other", title: "Other" }].map((gr) => ({ ...gr, rows: [] as { r: string[]; c?: SheetCh }[] }));
    for (const r of rows) {
      const c = byRow.get(norm(r[0]));
      out.find((gr) => gr.box === (c?.box ?? "other"))!.rows.push({ r, c });
    }
    return out.filter((gr) => gr.rows.length);
  }, [rows, channels]);

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
                    <th className="text-left font-semibold py-1 pr-2">Tap a name to open it</th>
                    {[1, 2, 3, 4].map((w) => (
                      <th key={w} className={`text-right font-semibold px-2 ${month === thisMonth && w === thisWeek ? "text-slate-900" : ""}`}>
                        Wk {w}{month === thisMonth && w === thisWeek ? " ●" : ""}
                      </th>
                    ))}
                    <th className="text-right font-semibold px-2">Month</th>
                    <th className="text-left font-semibold px-2 w-32">Goal</th>
                  </tr>
                </thead>
                {groups.map((gr) => (
                  <tbody key={gr.box}>
                    <tr><td colSpan={7} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{gr.title}</td></tr>
                    {gr.rows.map(({ r, c }, i) => {
                      const weeks = [0, 1, 2, 3].map((k) => r[start + k] ?? "");
                      const total = r[start + 4] || String(weeks.reduce((s, v) => s + num(v), 0) || "");
                      const goal = num(r[1]);
                      const pct = goal ? Math.min(100, Math.round((num(total) / goal) * 100)) : 0;
                      const canTap = c && !c.auto && month === thisMonth;
                      return (
                        <Fragment key={i}>
                        <tr className="border-t border-slate-100">
                          <td className="py-1.5 pr-2">
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium"><ChannelName c={c ?? { label: r[0] }} /></span>
                              {c?.auto && <span className="text-[10px] rounded bg-green-50 text-green-700 px-1">auto</span>}
                              {c && drafts.text[c.id] && month === thisMonth && (
                                <button onClick={() => setDoing(doing === c.id ? null : c.id)}
                                  className="ml-auto rounded-md px-2.5 text-xs font-bold leading-6 text-white" style={{ background: "#1F9D55" }}>{doing === c.id ? "Close" : "Post"}</button>
                              )}
                              {canTap && (
                                <button disabled={logging} onClick={async () => { await onLog(c.id, true); if (owner) await sync(); }} title="Add how many you did"
                                  className={`${c && drafts.text[c.id] ? "" : "ml-auto "}rounded border border-slate-300 px-1.5 text-xs leading-5 hover:bg-slate-50`}><Plus size={12} /></button>
                              )}
                            </span>
                          </td>
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
                        {c && doing === c.id && drafts.text[c.id] && (
                          <tr><td colSpan={7} className="pb-3">
                            <PostDrawer label={c.label} draft={drafts.text[c.id]} url={drafts.urls[c.id]}
                              onPosted={async () => { await onLog(c.id); if (owner) await sync(); setDoing(null); }} />
                          </td></tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="text-xs text-slate-500">"auto" rows fill themselves every morning (posts from GoHighLevel, yard signs from the app, cold emails from Smartlead's report, ad spend once paired). For the rest, tap + when you do it. Anything typed into the sheet shows here too.</p>
          </>
        )}
      {(msg || g?.error) && <p className={`text-sm break-words ${msg.startsWith("Synced") ? "text-green-700" : "text-red-600"}`}>{msg || g?.error}</p>}
    </Card>
  );
}

/** No API for these sites: copy the ready text, open the site, paste, post, then tap Posted to count it. */
function PostDrawer({ label, draft, url, onPosted }: { label: string; draft: { title?: string; body: string }; url: string; onPosted: () => Promise<void> }) {
  const [title, setTitle] = useState(draft.title ?? "");
  const [body, setBody] = useState(draft.body);
  const [step, setStep] = useState<"start" | "opened" | "busy">("start");
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
      {draft.title !== undefined && <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm font-semibold bg-white" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 p-2 text-sm bg-white" />
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={async () => { await navigator.clipboard.writeText(title ? `${title}\n\n${body}` : body).catch(() => {}); window.open(url, "_blank", "noopener"); setStep("opened"); }}
          className="rounded-xl px-4 py-2 font-bold text-white inline-flex items-center gap-2" style={{ background: NAVY }}>
          <ExternalLink size={16} /> 1. Copy and open {label.replace(/ (posts|listings|ads)$/i, "")}
        </button>
        <button disabled={step === "busy"} onClick={async () => { setStep("busy"); await onPosted(); }}
          className={`rounded-xl px-4 py-2 font-bold inline-flex items-center gap-2 ${step === "opened" ? "text-white" : "border border-slate-300"}`} style={step === "opened" ? { background: "#1F9D55" } : undefined}>
          {step === "busy" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} 2. Posted, count it
        </button>
        {step === "opened" && <span className="text-xs text-slate-500">Paste it in (it's copied), post it, then tap Posted.</span>}
      </div>
    </div>
  );
}
