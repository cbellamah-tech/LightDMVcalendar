"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, EyeOff, Loader2, Mail, Plus, RefreshCw, Undo2 } from "lucide-react";
import { ago, api, fmtDay, NAVY } from "@/components/ui";
import { Card, Dot, Feed, FeedItem, Light, LIGHT_WORD } from "./parts";
import { ChannelName, Media, MediaBoard, SheetView } from "./media";
import { Attribution, OrganicPaid } from "./dashboard";
import { googleAdsScript } from "./adsScript";
import { WebsiteGoogle } from "./web";
import { LiveStats } from "./stats";
import { SocialPosts } from "./social";
import { LinkedInPosts } from "./linkedin";

export type Ch = { id: string; label: string; box: string; sheetRow: string; bot?: string; auto?: string; link?: string; monthlyGoal?: number; done: number; lastWeek: number; goal: number; light: Light };
type Box = { id: string; title: string; line: string; bots: string[]; link?: string; done: number; goal: number; light: Light; channels: string[] };
type Thread = { id: string; from: string; email: string; subject: string; snippet: string; lastAt: number; waiting: boolean; link: string; kind?: "customer" | "lead" };
type Data = {
  today: string; week: string; thisWeek: string; daysIn: number; role: string;
  channels: Ch[]; boxes: Box[];
  events: { id: string; channel: string; n: number; day: string; at: number; by: string; via: string; note?: string }[];
  ghl: { configured: boolean; at: number | null; errors: string[]; accounts: { platform: string; name: string; expired?: boolean }[]; weekLeads: number; bySource: Record<string, number> };
  google: { configured: boolean; connected: boolean; email?: string; sheetUrl: string };
  inbox: { at: number; threads: Thread[]; error?: string } | null;
  feed: FeedItem[];
  autopost: boolean;
  drafts: { text: Record<string, { title?: string; body: string; at?: number }>; urls: Record<string, string> };
  attribution: Attribution | null;
  ads: { facebook: AdSide & { configured: boolean }; google: AdSide; lsa: AdSide; error?: string };
  cold: { url: string; latest: { day: string; sent: number; responses: number; positive: number } | null };
  media: Media[];
  platforms: { id: "facebook" | "instagram" | "linkedin" | "google"; label: string }[];
  lastFill: { at: number; week: string; by: string; written: { range: string; row: string; value: number }[]; missingRows: string[]; error?: string } | null;
  botBox: { url: string; key: string } | null;
  deals: { url: string | null; error?: string; list: DealRow[] };
};
type DealRow = {
  name: string; vendor: string; channels: string[]; start: string; end: string; cost: number; emails: number; status: string; notes: string;
  daysTotal: number; daysDone: number; daysLeft: number; spotsTotal: number; spotsSoFar: number; spentSoFar: number;
};

const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 86400_000).toISOString().slice(0, 10);
const shortDay = (d: string) => fmtDay(`${d}T12:00:00`);
const STALE_MS = 4 * 3600_000;

export default function Marketing() {
  const [d, setD] = useState<Data | null>(null);
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback((refresh = false) =>
    api<Data>(`/api/marketing?${new URLSearchParams({ days: String(days), ...(refresh ? { refresh: "1" } : {}) })}`)
      .then(setD).catch((e) => setMsg(e.message)), [days]);
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

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap pt-2">
        <h1 className="text-2xl font-extrabold flex-1" style={{ color: NAVY }}>Marketing</h1>
        <button onClick={() => { setBusy(true); load(true).finally(() => setBusy(false)); }} className="p-2 rounded-md hover:bg-slate-200" aria-label="Refresh" title="Pull fresh numbers">
          <RefreshCw size={18} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {msg && <p className="text-sm bg-white border border-slate-200 rounded-lg p-2">{msg}</p>}

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

      <LiveStats owner={owner} />

      <WebsiteGoogle owner={owner} botBox={d.botBox} />

      <SocialPosts />

      <LinkedInPosts />

      <OrganicPaid a={d.attribution} at={d.ghl.at} days={days} setDays={setDays} connected={d.ghl.configured} errors={d.ghl.errors} />

      <Deals deals={d.deals} a={d.attribution} days={days} sheetUrl={d.google.sheetUrl} />

      <MediaBoard media={d.media} platforms={d.platforms} accounts={d.ghl.accounts} ghlOn={d.ghl.configured} autopost={d.autopost} owner={owner} today={d.today} reload={load} />

      <Inbox inbox={d.inbox} onHide={hide} />

      <SheetView today={d.today} owner={owner} sheetUrl={d.google.sheetUrl} channels={d.channels} onLog={log} busy={busy} drafts={d.drafts} />
      {d.events.length > 0 && (
        <div className="px-1">
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-slate-600">Recent taps (undo a mistake)</summary>
            <div className="mt-2 space-y-1">
              {d.events.slice(0, 12).map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1">{e.by}: +{e.n} {label(e.channel)} <span className="text-slate-400">{ago(e.at)}</span></span>
                  <button onClick={() => undo(e.id)} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Undo"><Undo2 size={13} /></button>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {reports.length > 0 && (
        <Card title="Bot reports">
          <Feed items={reports} canAnswer={owner} onChange={load} empty="" />
        </Card>
      )}

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
          <span className="flex-1"><ChannelName c={c} />{c.auto && <span className="text-xs text-slate-400"> · automatic</span>}</span>
          <span className="tabular-nums font-semibold w-20 text-right">{c.done}{c.goal ? ` / ${c.goal}` : ""}</span>
          <span className="tabular-nums text-xs text-slate-400 w-16 text-right" title="Last week">last {c.lastWeek}</span>
          {!c.auto ? (
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
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="font-bold text-sm mb-2">Paid ads</div>
        <AdsPanel ads={d.ads} botBox={d.botBox} />
      </div>
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
          <div className="font-bold">Google (info@, the sheet, Drive photos, Search Console, Analytics)</div>
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
Channels: google_posts, facebook_posts, instagram_posts, linkedin_posts, linkedin_engage, fb_groups, marketplace, craigslist, nextdoor, blog, cold_emails, iheart_emails, door_hangers, tree_shop_cards, eddm, door_to_door, car_magnets, bing_posts.
At the start of every run, GET ${url}?bot=<your name> with the same header and act on any answers to your questions.`;
}

type AdTotals = { spend: number; clicks: number; leads: number; lastDay?: string };
type AdSide = { has: boolean; week: AdTotals; month: AdTotals };
const money = (x: number) => `$${x.toLocaleString()}`;
function adsLine(a: Data["ads"]) {
  const part = (name: string, s: AdSide) => s.has ? `${name} ${money(s.week.spend)}, ${s.week.leads} leads` : "";
  return `Last 7 days: ${[part("Facebook", a.facebook), part("Google", a.google), part("Local Services", a.lsa)].filter(Boolean).join(" · ")}`;
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
      <div className="flex gap-2 flex-wrap">{side("Facebook ads", ads.facebook)}{side("Google ads", ads.google)}{ads.lsa.has && side("Local Services", ads.lsa)}</div>
      {ads.error && <p className="text-xs text-red-600 break-words">{ads.error}</p>}
      {!ads.facebook.configured && (
        <p className="text-xs text-slate-600"><b>Pair Facebook:</b> paste the ads token and ad account number in the Facebook Ads box under Live stats at the top of this tab.</p>
      )}
      {!ads.google.has && botBox && (
        <div className="text-xs text-slate-600 space-y-1">
          <p><b>Pair Google:</b> in Google Ads go to Tools, Bulk actions, Scripts, press +, paste this, Authorize, then set Frequency to Daily. It covers Local Services and keywords too.</p>
          <button className="rounded-lg px-3 py-1.5 font-semibold border border-slate-300" onClick={() => {
            navigator.clipboard.writeText(googleAdsScript(botBox.url, botBox.key)).then(() => setCopied(true)).catch(() => {});
          }}>{copied ? "Copied" : "Copy the Google Ads script"}</button>
        </div>
      )}
    </div>
  );
}

/** Deals bought for a set run (iHeart radio and emails): where each stands today, and the leads it brought in.
 *  The figures come from the "Light DMV marketing deals" sheet in Drive; edit them there. */
function Deals({ deals, a, days, sheetUrl }: { deals: Data["deals"]; a: Attribution | null; days: number; sheetUrl: string }) {
  if (!deals || (!deals.list.length && !deals.error)) return null;
  const leadsOf = (chs: string[]) => (a?.rows ?? [])
    .filter((r) => (chs.includes("radio") && r.id === "radio") || (chs.includes("iheart_emails") && r.id === "iheart_email"))
    .reduce((n, r) => n + r.leads, 0);
  const md = (x: string) => `${+x.slice(5, 7)}/${+x.slice(8, 10)}`;
  const link = deals.url ?? sheetUrl;
  return (
    <Card title="Radio and other deals" right={<a href={link} target="_blank" rel="noreferrer" className="text-xs text-slate-500 inline-flex items-center gap-1">Deals sheet <ExternalLink size={12} /></a>}>
      {deals.error && <p className="text-xs text-red-600 break-words">{deals.error}</p>}
      {deals.list.map((x) => {
        const leads = leadsOf(x.channels);
        const live = x.daysDone > 0 && x.daysLeft > 0;
        return (
          <a key={x.name} href={link} target="_blank" rel="noreferrer" className="block rounded-lg bg-slate-50 p-3 text-sm space-y-1 hover:bg-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <b className="flex-1">{x.name}</b>
              <span className="text-xs text-slate-500">{md(x.start)} to {md(x.end)} · {x.daysLeft > 0 ? `${x.daysLeft} days left` : "finished"}</span>
            </div>
            {x.status && <div className="text-xs text-amber-700">{x.status}</div>}
            <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs text-slate-700 tabular-nums">
              {x.spotsTotal > 0 && <span>Radio spots: {x.spotsSoFar} of {x.spotsTotal}{live ? " so far" : ""}</span>}
              {x.emails > 0 && <span>Emails: {x.emails.toLocaleString()}</span>}
              {x.cost > 0 && <span>Spent: {money(x.spentSoFar)} of {money(x.cost)}</span>}
              <span>Leads (last {days} days): {leads}{leads && x.spentSoFar ? ` · ${money(Math.round(x.spentSoFar / leads))} a lead` : ""}</span>
            </div>
          </a>
        );
      })}
      <p className="text-xs text-slate-500">Spots and spend so far are spread evenly over the run. Leads count when GoHighLevel's source or tags say radio, 97.1, WASH-FM or iHeart.</p>
    </Card>
  );
}

const GHL_URL = "https://app.gohighlevel.com/";

/** Short on purpose: customers waiting on us first, then the rest, five at a time. */
function Inbox({ inbox, onHide }: { inbox: Data["inbox"]; onHide: (email: string) => void }) {
  const [all, setAll] = useState(false);
  const rank = (t: Thread) => (t.kind === "lead" ? 2 : t.waiting ? 0 : 1);
  const sorted = [...(inbox?.threads ?? [])].sort((a, b) => rank(a) - rank(b) || b.lastAt - a.lastAt);
  const shown = all ? sorted : sorted.slice(0, 5);
  const waiting = sorted.filter((t) => rank(t) === 0).length;
  return (
    <Card title={`Inbox${waiting ? ` · ${waiting} waiting on us` : ""}`} right={inbox ? <span className="text-xs text-slate-400">info@, {ago(inbox.at)}</span> : null}>
      {!inbox ? <p className="text-sm text-slate-500">Shows info@lightdmv.com once Google is connected (Setup below).</p>
        : !sorted.length ? <p className="text-sm text-slate-500">Nothing from customers or leads in the last 14 days.</p>
        : (
          <div className="divide-y divide-slate-100">
            {shown.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                <a href={t.link} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex gap-2 hover:underline">
                  <span className={`truncate ${t.waiting && t.kind !== "lead" ? "font-bold" : ""}`}>{t.from}</span>
                  <span className="truncate text-slate-500 flex-1">{t.subject}</span>
                </a>
                {t.kind === "lead" ? <span className="text-[11px] font-semibold rounded bg-blue-50 text-blue-700 px-1.5">Lead</span>
                  : t.waiting ? <span className="text-xs text-red-600 font-semibold">Reply</span> : null}
                <span className="text-xs text-slate-400 w-14 text-right">{ago(t.lastAt)}</span>
                <button title="Not a customer: hide this sender from now on" aria-label="Not a customer" onClick={() => onHide(t.email)}
                  className="p-1 text-slate-300 hover:text-slate-700"><EyeOff size={14} /></button>
              </div>
            ))}
          </div>
        )}
      {sorted.length > 5 && <button onClick={() => setAll(!all)} className="text-xs underline text-slate-600">{all ? "Show fewer" : `Show all ${sorted.length}`}</button>}
      {inbox?.error && <p className="text-xs text-red-600 break-words">{inbox.error}</p>}
    </Card>
  );
}
