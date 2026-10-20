"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, Search } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card } from "./parts";

/* Craigslist: no API and bots get banned, so the app writes a fresh ad per area each week and walks you through posting it. */

type Area = {
  id: string; label: string; subarea: string; zip: string; checkUrl: string;
  ad: { title: string; body: string };
  last: { at: number; by: string } | null; due: boolean; dueIn: number;
};
type Data = {
  areas: Area[]; photos: string[]; postUrl: string; category: string; phone: string; repostDays: number; thisMonth: number;
  recent: { area: string; label: string; at: number; by: string; title: string }[];
};

const GREEN = "#1F9D55";

export function CraigslistAds() {
  const [d, setD] = useState<Data | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => api<Data>("/api/marketing/craigslist").then((x) => {
    setD(x);
    setPick((cur) => cur ?? (x.areas.find((a) => a.due) ?? x.areas[0])?.id ?? null);
  }).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const a = d?.areas.find((x) => x.id === pick);
  useEffect(() => { if (a) { setTitle(a.ad.title); setBody(a.ad.body); setDone({}); setMsg(""); } }, [a?.id, a?.ad.title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return <Card title="Craigslist ads"><p className="text-sm text-slate-500 flex gap-2">{msg || <><Loader2 size={16} className="animate-spin" /> Writing this week's ads...</>}</p></Card>;
  const due = d.areas.filter((x) => x.due);

  async function copy(step: string, text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setDone((s) => ({ ...s, [step]: true }));
  }
  async function savePhotos() {
    setDone((s) => ({ ...s, photos: true }));
    try {
      const files = await Promise.all(d!.photos.map(async (u, i) => new File([await (await fetch(u)).blob()], `light-dmv-${i + 1}.jpg`, { type: "image/jpeg" })));
      // On a phone this saves them to Photos (Share, then Save Images), ready to pick on Craigslist's photo step.
      if (navigator.canShare?.({ files })) {
        const shared = await navigator.share({ files }).then(() => true, (e) => e?.name === "AbortError");
        if (shared) return;
      }
      for (const f of files) {
        const href = URL.createObjectURL(f);
        Object.assign(document.createElement("a"), { href, download: f.name }).click();
        setTimeout(() => URL.revokeObjectURL(href), 5000);
      }
    } catch { d!.photos.forEach((u) => window.open(u, "_blank", "noopener")); }
  }
  async function posted() {
    if (!a) return;
    setBusy(true);
    try {
      const r = await api("/api/marketing/craigslist", { method: "POST", json: { area: a.id, title } });
      setMsg(r.sheetError ? `Counted. The sheet didn't update: ${r.sheetError}` : `Counted and added to the sheet. ${a.label} is due again in ${d!.repostDays} days.`);
      setPick(null);
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  const stepBtn = (key: string, n: number, label: React.ReactNode, onClick: () => void, icon: React.ReactNode) => (
    <button onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-bold inline-flex items-center gap-2 ${done[key] ? "border border-slate-300 text-slate-500" : "text-white"}`}
      style={done[key] ? undefined : { background: NAVY }}>
      {done[key] ? <Check size={15} className="text-green-700" /> : icon} {n}. {label}
    </button>
  );

  return (
    <Card title="Craigslist ads"
      right={<span className="text-xs text-slate-500">{d.thisMonth} posted this month · {due.length ? `${due.length} due` : "all posted"}</span>}>
      <div className="flex gap-1.5 flex-wrap">
        {d.areas.map((x) => (
          <button key={x.id} onClick={() => setPick(x.id)} aria-pressed={pick === x.id}
            className={`rounded-full px-3 py-1 text-xs font-semibold inline-flex items-center gap-1.5 ${pick === x.id ? "text-white" : "bg-slate-100 text-slate-700"}`}
            style={pick === x.id ? { background: NAVY } : undefined}>
            <span className="w-2 h-2 rounded-full" style={{ background: x.due ? "#DC2626" : GREEN }} />
            {x.label} <span className="font-normal opacity-80">{x.due ? "due" : `in ${x.dueIn}d`}</span>
          </button>
        ))}
      </div>

      {a && (
        <div className="space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} className="w-full rounded-lg border border-slate-300 p-2 text-sm font-semibold" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
          <p className="text-xs text-slate-500">
            On Craigslist pick <b>{d.category}</b>, then <b>{a.subarea}</b>. Postal code <button onClick={() => copy("zip", a.zip)} className="underline font-semibold">{a.zip}</button>
            {done.zip && " (copied)"}. A new ad is written for each area every week, so the wording never repeats.
          </p>
          {d.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {d.photos.map((u, i) => <img key={u} src={u} alt={`Ad photo ${i + 1}`} loading="lazy" className="h-16 w-24 shrink-0 object-cover rounded-lg" />)}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {stepBtn("open", 1, "Copy title, open Craigslist", () => { copy("open", title); window.open(d.postUrl, "_blank", "noopener"); }, <ExternalLink size={15} />)}
            {stepBtn("body", 2, "Copy description", () => copy("body", body), <Copy size={15} />)}
            {d.photos.length > 0 && stepBtn("photos", 3, "Save photos", savePhotos, <Download size={15} />)}
            <button disabled={busy} onClick={posted}
              className={`rounded-xl px-3 py-2 text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40 ${done.open ? "text-white" : "border border-slate-300"}`}
              style={done.open ? { background: GREEN } : undefined}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {d.photos.length ? 4 : 3}. Posted, count it
            </button>
          </div>
          {a.last && (
            <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
              Last {a.label} ad: {a.last.by}, {ago(a.last.at)}.
              <a href={a.checkUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1"><Search size={11} /> Check it's showing</a>
            </p>
          )}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.startsWith("Counted") ? "text-green-700" : "text-red-600"}`}>{msg}</p>}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Why this isn't fully automatic</summary>
        <p className="mt-1">Craigslist has no way for apps to post and bans accounts that post by bot (their ads quietly stop showing). So the app does the writing, tracks which area is due every {d.repostDays} days, and counts each one in the campaign sheet; posting takes about two minutes by hand.</p>
      </details>
    </Card>
  );
}
