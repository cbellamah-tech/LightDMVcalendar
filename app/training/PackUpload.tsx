"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/ui";

type PackFile = { imageData?: Record<string, string>; [k: string]: unknown };

/** Owner uploads training_pack.json: the course and its install photos. Photos go to photo storage once each,
 *  the rest to the database (it holds real prices, so it stays out of the code). */
export function PackUpload({ onDone }: { onDone?: () => void }) {
  const [info, setInfo] = useState<{ builtAt: string | null; modules: number; practice: number; install?: number } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/training/pack").then(setInfo).catch(() => {}); }, []);
  async function upload(f: File) {
    setMsg("Reading the file...");
    try {
      const { imageData = {}, ...pack } = JSON.parse(await f.text()) as PackFile;
      // Downloads often keep an older copy under the same name; say which one was picked.
      if (Number(pack.version ?? 1) < 3 || !Array.isArray(pack.quotes)) {
        const built = typeof pack.builtAt === "string" ? new Date(pack.builtAt).toLocaleString() : "an older build";
        setMsg(`That's an older copy (${f.name}, built ${built}). Pick the newest training_pack.json in Downloads, about 11.9 MB, sometimes named "training_pack (1).json".`);
        return;
      }
      const have = new Set((await api<{ ids: string[] }>("/api/training/images")).ids);
      const todo = Object.keys(imageData).filter((id) => !have.has(id));
      for (let i = 0; i < todo.length; i++) {
        setMsg(`Uploading photos: ${i + 1} of ${todo.length}`);
        await api("/api/training/images", { method: "POST", json: { id: todo[i], data: imageData[todo[i]] } });
      }
      setMsg("Saving the course...");
      const r = await api("/api/training/pack", { method: "POST", json: pack });
      setInfo(r); setMsg("Loaded."); onDone?.();
    } catch (e: any) { setMsg(e instanceof SyntaxError ? "That file isn't the training pack." : e.message); }
  }
  return (
    <div className="space-y-2">
      <div className="font-bold">Course content</div>
      <p className="text-sm text-slate-600">
        {info?.builtAt
          ? `Loaded: the file built ${new Date(info.builtAt).toLocaleString()}. Quote course ${info.modules} modules, ${info.practice} real jobs. ${info.install ? `Installer course ${info.install} modules.` : "No installer course in it; upload the newest training_pack.json."}`
          : "Not loaded yet. Upload training_pack.json to turn the course on."}
      </p>
      <label className="inline-block rounded-lg px-4 py-2 font-semibold border border-slate-300 cursor-pointer text-sm">
        Upload training_pack.json
        <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </label>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
