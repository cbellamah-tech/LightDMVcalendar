"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";

type Status = { configured: boolean; connected: boolean; redirectUri: string; lastSyncAt?: number; lastError?: string; lastCount?: number; connectedAt?: number };

export default function JobberSettings() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [qErr, setQErr] = useState("");

  const load = useCallback(() => api<Status>("/api/jobber/status").then(setS).catch((e) => setMsg(e.message)), []);
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("error")) setQErr(q.get("error")!);
    if (q.get("connected")) setMsg("Jobber is connected.");
  }, [load]);

  async function sync() {
    setBusy(true); setMsg("");
    try { const r = await api("/api/jobber/sync", { method: "POST" }); setMsg(`Synced ${r.count} visits.`); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); load(); }
  }

  async function exportQuotes() {
    setBusy(true); setMsg("Downloading quotes from Jobber...");
    try {
      const rows: Record<string, string | number>[] = [];
      let cursor: string | null = null, quotes = 0;
      do {
        let page: { rows: typeof rows; quotes: number; next: string | null } | null = null;
        for (let tries = 0; !page; tries++) {
          try { page = await api(`/api/jobber/quotes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`); }
          catch (e: any) {
            // Jobber rate-limits big pulls; wait and retry the same page.
            if (tries < 6 && /throttl|429/i.test(e.message)) await new Promise((r) => setTimeout(r, 5000));
            else throw e;
          }
        }
        rows.push(...page.rows); quotes += page.quotes; cursor = page.next;
        setMsg(`Downloading quotes from Jobber... ${quotes} so far`);
      } while (cursor);
      const cols = rows.length ? Object.keys(rows[0]) : ["quote_number"];
      const cell = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = "jobber_quotes_line_items.csv";
      a.click();
      setMsg(`Downloaded ${quotes} quotes (${rows.length} line items).`);
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!s) return <div className="p-6 text-slate-500 flex gap-2"><Loader2 className="animate-spin" /> Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Jobber</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {s.connected ? (
          <>
            <div className="flex items-center gap-2 font-semibold text-green-700"><CheckCircle2 /> Connected{s.connectedAt ? ` ${ago(s.connectedAt)}` : ""}</div>
            <p className="text-sm text-slate-600">
              Visits from 2 days ago to 3 weeks ahead sync automatically when someone opens Jobs (at most every 5 minutes).
              {s.lastSyncAt ? ` Last sync ${ago(s.lastSyncAt)}: ${s.lastCount} visits.` : ""}
            </p>
            <button onClick={sync} disabled={busy} className="rounded-lg px-4 py-2 text-white font-semibold flex items-center gap-2" style={{ background: NAVY }}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Sync now
            </button>
            <button onClick={exportQuotes} disabled={busy} className="rounded-lg px-4 py-2 font-semibold flex items-center gap-2 border border-slate-300">
              <Download size={16} /> Download all quotes (CSV)
            </button>
          </>
        ) : s.configured ? (
          <>
            <p className="text-sm text-slate-600">The app keys are in place. Connect your Jobber account (a Jobber admin has to approve).</p>
            <a href="/api/jobber/connect" className="inline-block rounded-lg px-4 py-2 text-white font-semibold" style={{ background: NAVY }}>Connect Jobber</a>
          </>
        ) : (
          <div className="text-sm text-slate-700 space-y-2">
            <p className="font-semibold">Jobber isn't set up yet. Steps:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Go to developer.getjobber.com, sign in with your Jobber admin account, and create an app (name it Light DMV App).</li>
              <li>Set its OAuth callback URL to <code className="bg-slate-100 px-1 rounded break-all">{s.redirectUri}</code></li>
              <li>Give it read access to Clients, Requests, Quotes, Jobs, Scheduled Items and Users.</li>
              <li>In Vercel, open this project, then Settings, then Environment Variables, and add <code>JOBBER_CLIENT_ID</code> and <code>JOBBER_CLIENT_SECRET</code> from the app page. Redeploy.</li>
              <li>Come back here and press Connect Jobber.</li>
            </ol>
          </div>
        )}
        {(s.lastError || qErr) && <p className="text-sm text-red-600 break-words">Last error: {qErr || s.lastError}</p>}
        {msg && <p className="text-sm">{msg}</p>}
      </div>
      <DriveIndexCard />
      <p className="text-sm text-slate-500">Each job lands on a crew by matching Jobber's assigned team members to the "Name in Jobber" on the People page.</p>
    </div>
  );
}

/** Bin lists, takedown photos and finished-install photos, read from Google Drive with the app's Google connection. */
function DriveIndexCard() {
  type Info = { generatedAt: string | null; auto: boolean; bins: number; photos: number; installPhotos: number; google: boolean; sync: { at?: number; error?: string; sheets?: string[] } };
  const [info, setInfo] = useState<Info | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Info>("/api/drive-index").then(setInfo).catch(() => {}); }, []);
  async function readNow() {
    setMsg(""); setBusy(true);
    try { const r = await api<Info>("/api/drive-index?sync=1", { method: "POST" }); setInfo(r); setMsg("Read from Drive."); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function upload(f: File) {
    setMsg("");
    try {
      const r = await api<Info>("/api/drive-index", { method: "POST", json: JSON.parse(await f.text()) });
      setInfo(r); setMsg("Loaded.");
    } catch (e: any) { setMsg(e instanceof SyntaxError ? "That file isn't the Drive index." : e.message); }
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="font-bold">Bins and photos (Google Drive)</div>
      <p className="text-sm text-slate-600">
        {info?.generatedAt
          ? `${info.bins} bin rows, ${info.photos} takedown photos and ${info.installPhotos} install photos, ${info.auto ? "read from Drive" : "from an uploaded file"} on ${new Date(info.generatedAt).toLocaleString()}.`
          : "Not read yet."}
        {info?.google ? " Read again automatically every 6 hours with each Jobber sync." : ""}
      </p>
      {info?.sync?.sheets?.length ? <p className="text-xs text-slate-500">Bin sheets: {info.sync.sheets.join(", ")}.</p> : null}
      {info?.sync?.error && <p className="text-sm text-red-600">Last read from Drive failed: {info.sync.error}</p>}
      {info?.google ? (
        <button onClick={readNow} disabled={busy} className="rounded-lg px-4 py-2 font-semibold border border-slate-300 text-sm disabled:opacity-60">
          {busy ? "Reading Drive…" : "Read from Drive now"}
        </button>
      ) : (
        <>
          <p className="text-sm text-amber-800">Connect Google on the Marketing tab and this fills itself from Drive. Until then you can upload drive_index.json.</p>
          <label className="inline-block rounded-lg px-4 py-2 font-semibold border border-slate-300 cursor-pointer text-sm">
            Upload drive_index.json
            <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </label>
        </>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
