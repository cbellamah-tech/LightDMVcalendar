"use client";

import { useEffect, useState } from "react";
import { api, NAVY } from "@/components/ui";

const PATTERN = /^[A-Za-z]_.+_Design\d+(_AI)?(\s*\(\d+\))?\.(png|jpe?g|webp)$/i;

/** Shrink a mockup to a 1600 px JPEG before sending (the downloads are 1 MB+ PNGs). */
async function shrink(f: File): Promise<Blob> {
  const img = await createImageBitmap(f);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't read the picture"))), "image/jpeg", 0.85));
}

/** Light Design Hero mockups (A_Name_Design1.png) dropped here pair with each job's line items. */
export default function MockupDrop() {
  const [info, setInfo] = useState<{ known: string[]; customers: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/mockups").then(setInfo).catch(() => {}); }, []);

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
        setMsg(`Sending mockups… ${done + failed} of ${files.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setBusy(false);
    setMsg(`Added ${done} mockup${done === 1 ? "" : "s"}${failed ? `, ${failed} failed (drop them again)` : ""}${skipped ? `, skipped ${skipped} already in or not mockups` : ""}. Jobs show them next to each line now.`);
    api("/api/mockups").then(setInfo).catch(() => {});
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="font-bold">Line item photos (Light Design Hero mockups)</div>
      <p className="text-sm text-slate-600">
        Jobber doesn&apos;t give out line item photos, so pick your Light Design Hero downloads here (files like S_Smith_Design1.png in Downloads; select them all, anything else is ignored).
        Each job then shows Design 1, 2, 3… next to its photo lines.
        {info ? ` ${info.known.length} mockups for ${info.customers} customers so far.` : ""}
      </p>
      <label className={`inline-block rounded-lg px-4 py-2 font-semibold text-white text-sm cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`} style={{ background: NAVY }}>
        {busy ? "Sending…" : "Pick mockup files"}
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const l = e.target.files; if (l?.length) send(l); e.target.value = ""; }} />
      </label>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
