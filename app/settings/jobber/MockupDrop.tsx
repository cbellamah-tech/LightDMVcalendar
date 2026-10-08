"use client";

import { useEffect, useState } from "react";
import { api, NAVY } from "@/components/ui";

const PATTERN = /^[A-Za-z]_.+_Design\d+(_AI)?(\s*\(\d+\))?\.(png|jpe?g|webp)$/i;

/** Shrink a design to a 1600 px JPEG before sending (the downloads are 1 MB+ PNGs). */
async function shrink(f: File): Promise<Blob> {
  const img = await createImageBitmap(f);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't read the picture"))), "image/jpeg", 0.85));
}

type Info = {
  known: string[]; customers: number; designs: number; google: boolean;
  drive: { at?: number; error?: string; files?: number; customers?: number };
  jobber: { at: number; version: string; fields: string[]; error?: string } | null;
};

/** Light Design Hero designs (A_Name_Design1.png), picked up from Google Drive by themselves; adding files by hand still works. */
export default function MockupDrop() {
  const [info, setInfo] = useState<Info | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Info>("/api/mockups").then(setInfo).catch(() => {}); }, []);

  async function lookNow() {
    setMsg(""); setBusy(true);
    try { setInfo(await api<Info>("/api/mockups?sync=1", { method: "POST" })); setMsg("Looked in Drive."); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function send(list: FileList) {
    const known = new Set(info?.known ?? []);
    const files = [...list].filter((f) => PATTERN.test(f.name) && !known.has(f.name));
    const skipped = list.length - files.length;
    if (!files.length) { setMsg(skipped ? "Those are already in, or aren't Light Design Hero downloads." : ""); return; }
    setBusy(true);
    let done = 0, failed = 0;
    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          const fd = new FormData();
          fd.append("file", new File([await shrink(f)], f.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          fd.append("name", f.name);
          await api("/api/mockups", { method: "POST", body: fd });
          done++;
        } catch { failed++; }
        setMsg(`Sending designs… ${done + failed} of ${files.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setBusy(false);
    setMsg(`Added ${done} design${done === 1 ? "" : "s"}${failed ? `, ${failed} failed (pick them again)` : ""}${skipped ? `, skipped ${skipped} already in or not designs` : ""}.`);
    api<Info>("/api/mockups").then(setInfo).catch(() => {});
  }

  const j = info?.jobber;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="font-bold">Line item photos (Light Design Hero designs)</div>
      <p className="text-sm text-slate-600">
        Jobber doesn&apos;t let any app read the photos on quote line items, so the app reads the Light Design Hero downloads
        (J_Doe_Design1.png) from Google Drive by itself and puts Design 1, 2, 3 next to each job&apos;s photo lines.
        {info ? ` ${info.designs} designs for ${info.customers} customers so far` : ""}
        {info?.drive.at ? `, last looked ${new Date(info.drive.at).toLocaleString()}.` : info ? "." : ""}
      </p>
      <p className="text-sm text-slate-600">
        Once on each computer that makes quotes: in Google Drive for desktop (signed in to the company Google account), Settings, My Computer, Add folder, pick Downloads.
        Only files named like Light Design Hero designs are read.
      </p>
      {info?.drive.error && <p className="text-sm text-red-600">Last look in Drive failed: {info.drive.error}</p>}
      {j && (
        <p className="text-xs text-slate-500">
          Jobber check ({j.version}): {j.error ? `couldn't ask Jobber (${j.error})` : j.fields.length ? `line photo field found (${j.fields.join(", ")}), jobs read it directly` : "still no line item photo field for apps"}.
        </p>
      )}
      {info && !info.google && <p className="text-sm text-amber-800">Connect Google on the Marketing tab so the app can read Drive.</p>}
      <div className="flex flex-wrap items-center gap-3">
        {info?.google && (
          <button onClick={lookNow} disabled={busy} className="rounded-lg px-4 py-2 font-semibold text-white text-sm disabled:opacity-60" style={{ background: NAVY }}>
            {busy ? "Looking…" : "Look in Drive now"}
          </button>
        )}
        <label className={`text-sm underline text-slate-600 cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          Add design files by hand
          <input type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const l = e.target.files; if (l?.length) send(l); e.target.value = ""; }} />
        </label>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
