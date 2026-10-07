"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/ui";

/** Owner uploads training_pack.json. It holds real prices, so it lives in the database, not the code. */
export function PackUpload({ onDone }: { onDone?: () => void }) {
  const [info, setInfo] = useState<{ builtAt: string | null; modules: number; practice: number } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/training/pack").then(setInfo).catch(() => {}); }, []);
  async function upload(f: File) {
    setMsg("Loading...");
    try {
      const r = await api("/api/training/pack", { method: "POST", json: JSON.parse(await f.text()) });
      setInfo(r); setMsg("Loaded."); onDone?.();
    } catch (e: any) { setMsg(e instanceof SyntaxError ? "That file isn't the training pack." : e.message); }
  }
  return (
    <div className="space-y-2">
      <div className="font-bold">Course content</div>
      <p className="text-sm text-slate-600">
        {info?.builtAt ? `${info.modules} modules and ${info.practice} practice quotes, built ${new Date(info.builtAt).toLocaleDateString()}.` : "Not loaded yet. Upload training_pack.json to turn the course on."}
      </p>
      <label className="inline-block rounded-lg px-4 py-2 font-semibold border border-slate-300 cursor-pointer text-sm">
        Upload training_pack.json
        <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </label>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
