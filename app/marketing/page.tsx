"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, EyeOff, Loader2, Mail, Plus, RefreshCw, Undo2 } from "lucide-react";
import { ago, api, fmtDay, NAVY } from "@/components/ui";
import { Card, Dot, Feed, FeedItem, Light, LIGHT_WORD } from "./parts";
import { Media, MediaBoard, SheetView } from "./media";

type Ch = { id: string; label: string; box: string; bot?: string; auto?: string; done: number; lastWeek: number; goal: number; light: Light };
type Box = { id: string; title: string; line: string; bots: string[]; done: number; goal: number; light: Light; channels: string[] };
type Lead = { id: string; name: string; sourceName: string; day: string; at: number; phone?: string; email?: string };
type Thread = { id: string; from: string; email: string; subject: string; snippet: string; lastAt: number; waiting: boolean; link: string; kind?: "customer" | "lead" };
type Data = {
  today: string; week: string; thisWeek: string; daysIn: number; role: string;
  channels: Ch[]; boxes: Box[];
  events: { id: string; channel: string; n: number; day: string; at: number; by: string; via: string; note?: string }[];
  ghl: { configured: boolean; at: number | null; errors: string[]; accounts: { platform: string; name: string; expired?: boolean }[]; leads: Lead[]; weekLeads: number; bySource: Record<string, number>; pipeline: { name: string; count: number; value: number; pipeline?: string }[] };
  google: { configured: boolean; connected: boolean; email?: string; sheetUrl: string };
  inbox: { at: number; threads: Thread[]; error?: string } | null;
  feed: FeedItem[];
  autopost: boolean;
  ads: { facebook: AdSide & { configured: boolean }; google: AdSide; error?: string };
  cold: { url: string; latest: { day: string; sent: number; responses: number; positive: number } | null };
  media: Media[];
  platforms: { id: "facebook" | "instagram" | "linkedin" | "google"; label: string }[];
  lastFill: { at: number; week: string; by: string; written: { range: string; row: string; value: number }[]; missingRows: string[]; error?: string } | null;
  botBox: { url: string; key: string } | null;
};

const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 86400_000).toISOString().slice(0, 10);
const shortDay = (d: string) => fmtDay(`${d}T12:00:00`);
const STALE_MS = 4 * 3600_000;

export default function Marketing() {
  const [d, setD] = useState<Data | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback((refresh = false) =>
    api<Data>(`/api/marketing?${new URLSearchParams({ ...(week ? { week } : {}), ...(refresh ? { refresh: "1" } : {}) })}`)
      .then(setD).catch((e) => setMsg(e.message)), [week]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error")) setMsg(`Couldn't connect: ${q.get("error")}`);
    if (q.get("google")) setMsg("Google is connected. The inbox shows below and the sheet fills every morning. The first daily video comes tomorrow morning.");
  }, []);

  async function log(channel: string, ask = false) {
    let n = 1;
    if (ask) {
      const v = window.prompt("How many?", "1");
      if (!v) return;
      n = Math.round(Number(v));
      if (!(n > 0)) return;
    }
    setBusy(true);
    try { await api("/api/marketing/log", { method: "POST", json: { channel, n } }); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function hide(email: string) {
    await api("/api/marketing/inbox", { method: "POST", json: { email } }).catch((e) => setMsg(e.message));
    load();
  }
  async function undo(id: string) {
    await api(`/api/marketing/log?id=${id}`, { method: "DELETE" }).catch((e) => setMsg(e.message));
    load();
  }

  const asks = useMemo(() => (d?.feed ?? []).filter((f) => f.ask && !f.answer), [d]);
  const reports = useMemo(() => (d?.feed ?? []).filter((f) => !f.ask || f.answer), [d]);
  const waiting = useMemo(() => (d?.inbox?.threads ?? []).filter((t) => t.waiting && t.kind !== "lead" && Date.now() - t.lastAt > STALE_MS), [d]);

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{msg || <><Loader2 className="animate-spin" /> Loading marketing...</>}</div>;
  const owner = d.role === "owner";
  const label = (id: string) => d.channels.find((c) => c.id === id)?.label ?? id;
  const isThisWeek = d.week === d.thisWeek;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap pt-2">
        <h1 className="text-2xl font-extrabold flex-1" style={{ color: NAVY }}>Marketing</h1>
        <div className="flex items-center gap-1 text-sm font-semibold">
          <button aria-label="Previous week" className="p-1.5 rounded hover:bg-slate-200" onClick={() => setWeek(addDays(d.week, -7))}><ChevronLeft size={18} /></button>
          <span>{isThisWeek ? "This week" : `Week of ${shortDay(d.week)}`}</span>
          <button aria-label="Next week" disabled={isThisWeek} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30" onClick={() => setWeek(addDays(d.week, 7))}><ChevronRight size={18} /></button>
        </div>
        <button onClick={() => { setBusy(true); load(true).finally(() => setBusy(false)); }} className="p-2 rounded-md hover:bg-slate-200" aria-label="Refresh" title="Pull fresh numbers">
          <RefreshCw size={18} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {msg && <p className="text-sm bg-white border border-slate-200 rounded-lg p-2">{msg}</p>}

      <MediaBoard media={d.media} platforms={d.platforms} accounts={d.ghl.accounts} ghlOn={d.ghl.configured} autopost={d.autopost} owner={owner} today={d.today} reload={load} />

      {/* The map: where customers find us, then where leads land */}
      <section className="rounded-xl border border-slate-200 bg-slate-100 p-3 space-y-3">
        <div className="text-sm font-bold" style={{ color: NAVY }}>Where customers find us</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {d.boxes.map((b) => (
            <button key={b.id} onClick={() => b.id === "cold" ? window.open(d.cold.url, "_blank", "noopener") : setOpen(open === b.id ? null : b.id)}
              className={`text-left bg-white rounded-xl border p-3 hover:shadow ${open === b.id ? "border-slate-500" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <Dot l={b.light} />
                <span className="font-bold flex-1">{b.title}</span>
                {b.goal ? <span className="text-sm font-semibold tabular-nums">{b.done} / {b.goal}</span> : <span className="text-sm tabular-nums">{b.done}</span>}
              </div>
              <div className="text-xs text-slate-500 mt-1">{b.id === "cold" && d.cold.latest
                ? `Last week: ${d.cold.latest.sent.toLocaleString()} sent, ${d.cold.latest.responses} replies, ${d.cold.latest.positive} positive · Open Smartlead ↗`
                : b.id === "cold" ? `${b.line} · Open Smartlead ↗`
                : b.id === "paid" && (d.ads.facebook.has || d.ads.google.has) ? adsLine(d.ads) : b.line}</div>
              <div className="text-xs mt-1 flex gap-1 flex-wrap">
                <span className="text-slate-500">{LIGHT_WORD[b.light]}</span>
                {b.bots.map((x) => <span key={x} className="rounded bg-slate-100 px-1.5 text-slate-600">{x} bot</span>)}
              </div>
            </button>
          ))}
        </div>
        {open && (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            {open === "paid"
              ? <AdsPanel ads={d.ads} botBox={d.botBox} />
              : <ChannelRows rows={d.channels.filter((c) => c.box === open)} onLog={log} busy={busy} />}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2"><span className="font-bold flex-1">GoHighLevel</span>
              <span className="text-sm font-semibold tabular-nums">{d.ghl.configured ? `${d.ghl.weekLeads} new leads` : "Not connected"}</span></div>
            <div className="text-xs text-slate-500 mt-1">
              {Object.keys(d.ghl.bySource).length ? Object.entries(d.ghl.bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") : "Every lead, text and reply, with where they came from"}
            </div>
            {d.ghl.pipeline.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {[...new Set(d.ghl.pipeline.map((st) => st.pipeline ?? ""))].map((pl) => (
                  <div key={pl}>
                    {pl && <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{pl}</div>}
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {d.ghl.pipeline.filter((st) => (st.pipeline ?? "") === pl).map((st) => (
                        <span key={st.name} className="text-xs rounded bg-slate-100 px-1.5 py-0.5" title={st.value ? `$${Math.round(st.value).toLocaleString()}` : undefined}>
                          {st.name} <b className="tabular-nums">{st.count}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2"><span className="font-bold flex-1">info@lightdmv.com</span>
              <span className="text-sm font-semibold tabular-nums">{d.inbox ? `${d.inbox.threads.filter((t) => t.waiting && t.kind !== "lead").length} customers waiting` : "Not connected"}</span></div>
            <div className="text-xs text-slate-500 mt-1">{waiting.length ? `${waiting.length} with no reply after 4 hours` : "Customer emails that skip GoHighLevel"}{d.inbox && d.inbox.threads.some((t) => t.kind === "lead") ? ` · ${d.inbox.threads.filter((t) => t.kind === "lead").length} cold email leads` : ""}</div>
          </div>
        </div>
        <a href="/jobs" className="block bg-white rounded-xl border border-slate-200 p-3 hover:shadow">
          <div className="font-bold">Jobber</div>
          <div className="text-xs text-slate-500 mt-1">Quotes and booked jobs. Won dollars per lead source comes in a later step.</div>
        </a>
      </section>

      {(asks.length > 0 || waiting.length > 0) && (
        <Card title={`Needs you (${asks.length + waiting.length})`}>
          <Feed items={asks} canAnswer={owner} onChange={load} empty="" />
          {waiting.map((t) => (
            <a key={t.id} href={t.link} target="_blank" rel="noreferrer" className="flex items-start gap-2 py-2 border-t border-slate-100 text-sm">
              <Mail size={16} className="mt-0.5 text-red-600 shrink-0" />
              <span className="flex-1"><b>{t.from}</b>: {t.subject} <span className="text-slate-400">· no reply, {ago(t.lastAt)}</span></span>
            </a>
          ))}
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`${isThisWeek ? "This week" : `Week of ${shortDay(d.week)}`} against the campaign sheet`}
          right={<a href={d.google.sheetUrl} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">Sheet <ExternalLink size={11} /></a>}>
          <ChannelRows rows={d.channels} onLog={log} busy={busy} />
          <p className="text-xs text-slate-500">Weekly goal = the sheet's monthly goal ÷ 4. Door-to-door, car magnets and Bing aren't rows in the sheet, so they count here only. Yard signs count themselves from the Yard signs tab; social posts count from GoHighLevel once it's connected. Tap + when you post a listing or hand out cards.</p>
          {d.events.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Recent taps</summary>
              <div className="mt-2 space-y-1">
                {d.events.slice(0, 12).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">{e.by}: +{e.n} {label(e.channel)} <span className="text-slate-400">{ago(e.at)}</span></span>
                    <button onClick={() => undo(e.id)} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Undo"><Undo2 size={13} /></button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Leads" right={d.ghl.at ? <span className="text-xs text-slate-400">GoHighLevel, {ago(d.ghl.at)}</span> : null}>
            {!d.ghl.configured ? <p className="text-sm text-slate-500">Shows here once GoHighLevel is connected (see Setup below).</p>
              : d.ghl.leads.length === 0 ? <p className="text-sm text-slate-500">No leads came back from GoHighLevel.</p>
              : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-auto">
                  {d.ghl.leads.map((l) => (
                    <div key={l.id} className="py-1.5 text-sm flex gap-2">
                      <span className="flex-1 truncate font-semibold">{l.name}</span>
                      <span className="text-slate-600">{l.sourceName}</span>
                      <span className="text-slate-400 w-24 text-right">{shortDay(l.day)}</span>
                    </div>
                  ))}
                </div>
              )}
            {d.ghl.errors.map((e) => <p key={e} className="text-xs text-red-600 break-words">{e}</p>)}
          </Card>

          <Card title="Inbox" right={d.inbox ? <span className="text-xs text-slate-400">{ago(d.inbox.at)}</span> : null}>
            {!d.inbox ? <p className="text-sm text-slate-500">Shows info@lightdmv.com here once Google is connected (see Setup below).</p>
              : d.inbox.threads.length === 0 ? <p className="text-sm text-slate-500">No customer or lead emails in the last 14 days.</p>
              : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-auto">
                  {d.inbox.threads.map((t) => (
                    <div key={t.id} className="flex items-start gap-1 py-1.5 hover:bg-slate-50">
                      <a href={t.link} target="_blank" rel="noreferrer" className="block flex-1 min-w-0 text-sm">
                        <div className="flex gap-2">
                          <span className={`flex-1 truncate ${t.waiting ? "font-bold" : ""}`}>{t.from}</span>
                          {t.kind === "lead" && <span className="text-[11px] font-semibold rounded bg-blue-50 text-blue-700 px-1.5">Lead</span>}
                          <span className={`text-xs ${t.waiting ? "text-red-600 font-semibold" : "text-green-700"}`}>{t.waiting ? "Waiting" : "Replied"}</span>
                          <span className="text-xs text-slate-400">{ago(t.lastAt)}</span>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{t.subject} · {t.snippet}</div>
                      </a>
                      <button title="Not a customer: hide this sender from now on" aria-label="Not a customer" onClick={() => hide(t.email)}
                        className="p-1 text-slate-300 hover:text-slate-700"><EyeOff size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            {d.inbox?.error && <p className="text-xs text-red-600 break-words">{d.inbox.error}</p>}
          </Card>
        </div>
      </div>

      <SheetView today={d.today} owner={owner} sheetUrl={d.google.sheetUrl} />

      <Card title="Bot reports">
        <Feed items={reports} canAnswer={owner} onChange={load} empty="Nothing from the bots yet. Once a bot has the drop box line (Setup below), its results land here." />
      </Card>

      {owner && <Setup d={d} reload={load} />}
    </div>
  );
}

function ChannelRows({ rows, onLog, busy }: { rows: Ch[]; onLog: (id: string, ask?: boolean) => void; busy: boolean }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((c) => (
        <div key={c.id} className="flex items-center gap-2 py-1.5 text-sm">
          <Dot l={c.light} />
          <span className="flex-1">{c.label}{c.auto === "signs" && <span className="text-xs text-slate-400"> · automatic</span>}</span>
          <span className="tabular-nums font-semibold w-20 text-right">{c.done}{c.goal ? ` / ${c.goal}` : ""}</span>
          <span className="tabular-nums text-xs text-slate-400 w-16 text-right" title="Last week">last {c.lastWeek}</span>
          {c.auto !== "signs" ? (
            <span className="flex">
              <button disabled={busy} onClick={() => onLog(c.id)} className="rounded-l-md border border-slate-300 px-2 py-1 hover:bg-slate-50" aria-label={`Add one ${c.label}`}><Plus size={14} /></button>
              <button disabled={busy} onClick={() => onLog(c.id, true)} className="rounded-r-md border border-l-0 border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">#</button>
            </span>
          ) : <span className="w-[62px]" />}
        </div>
      ))}
    </div>
  );
}

function Setup({ d, reload }: { d: Data; reload: () => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(d.botBox?.key ?? "");
  const snippet = d.botBox ? botInstructions(d.botBox.url, key) : "";

  async function fill(dry: boolean) {
    setBusy(true); setMsg("");
    try {
      const r = await api(`/api/marketing/fill${dry ? "?dry=1" : ""}`, { method: "POST" });
      if (r.error) setMsg(`Sheet: ${r.error}`);
      else if (!r.written.length) setMsg("Nothing to write for last week yet: no counts in the app for it.");
      else setMsg(`${dry ? "Would write" : "Wrote"} ${r.written.length} cells: ${r.written.map((w: any) => `${w.row} ${w.value}`).join(", ")}${r.missingRows?.length ? `. Not found in the sheet: ${r.missingRows.join(", ")}` : ""}`);
      if (!dry) reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function rotate() {
    if (!window.confirm("Make a new key? Every bot needs the new line after this.")) return;
    const r = await api("/api/marketing/key", { method: "POST" });
    setKey(r.key);
  }

  return (
    <Card title="Setup (owners)">
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 p-3 space-y-1">
          <div className="font-bold">GoHighLevel</div>
          {d.ghl.configured ? (
            <>
              <div className="text-green-700 font-semibold">Connected</div>
              <div className="text-slate-600">Social accounts: {d.ghl.accounts.length ? d.ghl.accounts.map((a) => `${a.platform}${a.expired ? " (needs reconnecting in GHL)" : ""}`).join(", ") : "none found"}</div>
            </>
          ) : <p className="text-slate-600">Waiting on the GHL key in Vercel (GHL_API_KEY and GHL_LOCATION_ID).</p>}
        </div>
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="font-bold">Google (info@, the sheet, Drive photos)</div>
          {d.google.connected ? (
            <>
              <div className="text-green-700 font-semibold">Connected{d.google.email ? ` as ${d.google.email}` : ""}</div>
              <div className="flex gap-2 flex-wrap">
                <button disabled={busy} onClick={() => fill(true)} className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300">Preview fill</button>
                <button disabled={busy} onClick={() => fill(false)} className="rounded-lg px-3 py-1.5 font-semibold text-white" style={{ background: NAVY }}>Fill last week now</button>
              </div>
              <p className="text-xs text-slate-500">Runs by itself every morning (this week and last week). Only cells the app has numbers for change.
                {d.lastFill ? ` Last fill ${ago(d.lastFill.at)}: ${d.lastFill.error ? d.lastFill.error : `${d.lastFill.written.length} cells`}.` : ""}</p>
            </>
          ) : d.google.configured ? (
            <a href="/api/google/connect" className="inline-block rounded-lg px-3 py-1.5 text-white font-semibold" style={{ background: NAVY }}>Connect Google</a>
          ) : <p className="text-slate-600">Waiting on the Google key in Vercel (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>}
        </div>
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="font-bold">Bot drop box</div>
          <p className="text-slate-600">Paste the line below into each bot's routine once. Treat it like a password: it lets a bot post here.</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { navigator.clipboard.writeText(snippet); setMsg("Copied the bot instructions."); }} className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300 inline-flex items-center gap-1"><Copy size={14} /> Copy for bots</button>
            <button onClick={rotate} className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300 text-slate-600">New key</button>
          </div>
        </div>
      </div>
      {msg && <p className="text-sm break-words">{msg}</p>}
    </Card>
  );
}

function botInstructions(url: string, key: string) {
  return `After every run, report to the Light DMV app.
POST ${url}
Header: Authorization: Bearer ${key}
JSON body: {"bot": "<your name, e.g. SEO>", "title": "<one line result>", "body": "<details>", "link": "<https link if any>",
"ask": "<a yes/no question for an owner, only if you need one>", "options": ["Yes", "No"],
"counts": {"<channel>": <number done>}}
Channels: google_posts, facebook_posts, instagram_posts, linkedin_posts, linkedin_engage, fb_groups, marketplace, craigslist, nextdoor, blog, cold_emails, door_hangers, tree_shop_cards, eddm, door_to_door, car_magnets, bing_posts.
At the start of every run, GET ${url}?bot=<your name> with the same header and act on any answers to your questions.`;
}

type AdTotals = { spend: number; clicks: number; leads: number; lastDay?: string };
type AdSide = { has: boolean; week: AdTotals; month: AdTotals };
const money = (x: number) => `$${x.toLocaleString()}`;
function adsLine(a: Data["ads"]) {
  const part = (name: string, s: AdSide) => s.has ? `${name} ${money(s.week.spend)}, ${s.week.leads} leads` : "";
  return `Last 7 days: ${[part("Facebook", a.facebook), part("Google", a.google)].filter(Boolean).join(" · ")}`;
}

function googleAdsScript(url: string, key: string) {
  return `// Light DMV app: sends yesterday's and the last 30 days' Google Ads numbers to the Marketing tab.
function main() {
  var rows = AdsApp.search("SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
    "FROM customer WHERE segments.date DURING LAST_30_DAYS");
  var days = [];
  while (rows.hasNext()) {
    var r = rows.next();
    days.push({ day: r.segments.date, spend: r.metrics.costMicros / 1e6, clicks: Number(r.metrics.clicks),
      impressions: Number(r.metrics.impressions), leads: Math.round(Number(r.metrics.conversions)) });
  }
  UrlFetchApp.fetch("${url}/ads", { method: "post", contentType: "application/json",
    headers: { Authorization: "Bearer ${key}" }, payload: JSON.stringify({ source: "google", days: days }) });
}`;
}

function AdsPanel({ ads, botBox }: { ads: Data["ads"]; botBox: Data["botBox"] }) {
  const [copied, setCopied] = useState(false);
  const side = (name: string, s: AdSide) => (
    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 p-2">
      <div className="font-semibold">{name}</div>
      {s.has ? (
        <div className="text-xs text-slate-600 tabular-nums">
          7 days: {money(s.week.spend)} · {s.week.clicks} clicks · {s.week.leads} leads<br />
          This month: {money(s.month.spend)} · {s.month.leads} leads{s.month.spend && s.month.leads ? ` · ${money(Math.round(s.month.spend / s.month.leads))} a lead` : ""}
        </div>
      ) : <div className="text-xs text-slate-500">Not paired yet</div>}
    </div>
  );
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2 flex-wrap">{side("Facebook ads", ads.facebook)}{side("Google ads", ads.google)}</div>
      {ads.error && <p className="text-xs text-red-600 break-words">{ads.error}</p>}
      {!ads.facebook.configured && (
        <p className="text-xs text-slate-600"><b>Pair Facebook:</b> in Meta Business Settings, make a System User with the ad account assigned (view performance), generate a token with ads_read,
          then add META_ADS_TOKEN and META_AD_ACCOUNT_ID (the number after act_) in Vercel, Production and Preview.</p>
      )}
      {!ads.google.has && botBox && (
        <div className="text-xs text-slate-600 space-y-1">
          <p><b>Pair Google:</b> in Google Ads go to Tools, Bulk actions, Scripts, press +, paste this, Authorize, then set Frequency to Daily.</p>
          <button className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300" onClick={() => {
            navigator.clipboard.writeText(googleAdsScript(botBox.url, botBox.key)).then(() => setCopied(true)).catch(() => {});
          }}>{copied ? "Copied" : "Copy the Google Ads script"}</button>
        </div>
      )}
    </div>
  );
}
