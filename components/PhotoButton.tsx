"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

/** Shrink to max 1600px JPEG before upload so it works on a weak cell signal. */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b || file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const blob = await compress(file);
  const fd = new FormData();
  fd.append("file", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
  fd.append("folder", folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Upload failed");
  return j.url;
}

export default function PhotoButton({
  folder, onUploaded, label = "Add photo", multiple = true, className = "", color = "#112E5B",
}: {
  folder: string; onUploaded: (urls: string[]) => void | Promise<void>;
  label?: string; multiple?: boolean; className?: string; color?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  return (
    <>
      <button type="button" disabled={busy}
        onClick={() => input.current?.click()}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-60 ${className}`}
        style={{ background: color }}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        {busy ? "Uploading..." : label}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple={multiple} hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true); setErr("");
          try {
            const urls = [];
            for (const f of files) urls.push(await uploadPhoto(f, folder));
            await onUploaded(urls);
          } catch (x: any) {
            setErr(x.message);
          } finally {
            setBusy(false);
          }
        }} />
      {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
    </>
  );
}
