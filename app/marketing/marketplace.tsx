"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, ImageDown, Loader2 } from "lucide-react";
import { ago, api, NAVY } from "@/components/ui";
import { Card } from "./parts";
import type { Media } from "./media";

/* ---------- Facebook Marketplace: Meta has no way to post listings for us, so the app does everything up to the
   Publish tap: fresh words every morning, the photos saved in one tap, each field copied, and a nudge when one is due. ---------- */

const CREATE_URL = "https://www.facebook.com/marketplace/create/item";
const MINE_URL = "https://www.facebook.com/marketplace/you/selling";
const MAX_PHOTOS = 10;
const DUE_DAYS = 7;

export type MarketplacePace = { lastAt: number | null; month: number; goal: number };

export function MarketplaceCard({ media, draft, pace, reload }: {
  media: Media[]; draft?: { title?: string; body: string }; pace: MarketplacePace; reload: () => void;
}) {
  // The newest listing nobody has posted yet; failing that the newest one; failing that the standing draft.
  const src = useMemo(() => media.find((m) => m.listings?.marketplace && !m.listings.marketplace.posted) ?? media.find((m) => m.listings?.marketplace), [media]);
  const l = src?.listings?.marketplace;
  // Photos: the source's stills first, then recent days', up to Marketplace's 10.
  const photos = useMemo(() => {
    const all = [...(src?.stills ?? []), ...media.flatMap((m) => m.stills ?? [])];
    return [...new Set(all)].slice(0, MAX_PHOTOS);
  }, [src, media]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<"" | "photos" | "posted">("");
  useEffect(() => { setTitle(l?.title ?? draft?.title ?? ""); setBody(l?.body ?? draft?.body ?? ""); setMsg(""); }, [src?.id, draft?.body]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = pace.lastAt ? Math.floor((Date.now() - pace.lastAt) / 86400_000) : null;
  const due = days === null || days >= DUE_DAYS;
  const price = l?.price;

  async function copy(what: string, text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? "" : c)), 2500);
  }
  async function savePhotos() {
    setBusy("photos"); setMsg("");
    try {
      const files = await Promise.all(photos.map(async (u, i) => {
        const b = await (await fetch(u)).blob();
        return new File([b], `light-dmv-${i + 1}.${b.type.includes("png") ? "png" : "jpg"}`, { type: b.type || "image/jpeg" });
      }));
      // Phones: the share sheet's "Save images" puts them all in the camera roll at once.
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files }).catch(() => {});
        setMsg("Pick Save images, then add them from your camera roll on Marketplace.");
      } else {
        for (const f of files) {
          const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(f), download: f.name });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        }
        setMsg(`${files.length} photos saved to Downloads. Drag them onto Marketplace's Add photos box.`);
      }
    } catch (e: any) { setMsg(`Couldn't get the photos: ${e.message}`); } finally { setBusy(""); }
  }
  async function open() {
    await copy("title", title);
    window.open(CREATE_URL, "_blank", "noopener");
    setMsg("Title copied. Paste it, then come back for the price and description.");
  }
  async function posted() {
    setBusy("posted");
    try {
      const r = src
        ? await api("/api/marketing/listing", { method: "POST", json: { id: src.id, site: "marketplace", title, body } })
        : await api("/api/marketing/log", { method: "POST", json: { channel: "marketplace", note: title.slice(0, 200) } });
      setMsg(r.sheetError ? `Counted. The sheet didn't update: ${r.sheetError}` : "Counted. Tomorrow morning brings fresh words for the next one.");
      reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }

  const Chip = ({ id, label, text }: { id: string; label: string; text: string }) => (
    <button onClick={() => copy(id, text)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50">
      {copied === id ? <Check size={14} className="text-green-700" /> : <Copy size={14} />} {copied === id ? "Copied" : label}
    </button>
  );

  return (
    <Card title="Facebook Marketplace"
      right={<a href={MINE_URL} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">Your listings <ExternalLink size={11} /></a>}>
      <p className={`text-sm rounded-lg px-3 py-2 ${due ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"}`}>
        {days === null ? "No Marketplace listing counted yet. " : `Last one went up ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}. `}
        {pace.goal ? `${pace.month} of ${pace.goal} this month. ` : ""}
        {due ? "A fresh one is due: new listings show up near the top for the first few days." : "You're on pace."}
      </p>

      <div className="grid md:grid-cols-[1fr_minmax(0,320px)] gap-4">
        <div className="space-y-2 min-w-0">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="w-full rounded-lg border border-slate-300 p-2 text-sm font-semibold" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} aria-label="Description" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
          <p className="text-xs text-slate-500">
            {src ? `Written ${src.day.slice(5).replace("-", "/")} by the morning run.` : "The morning run rewrites this each day."}
            {price ? ` Price: ${price}.` : ""} Condition: New. Edit anything here before you copy it.
          </p>
        </div>
        <div className="min-w-0">
          {photos.length > 0 ? (
            <div className="grid grid-cols-4 md:grid-cols-3 gap-1.5">
              {photos.map((u, i) => <img key={u} src={u} alt={`Listing photo ${i + 1}`} loading="lazy" className="aspect-square w-full object-cover rounded-md" />)}
            </div>
          ) : <p className="text-sm text-slate-500">Photos from the newest Drive job pictures show here after the next morning run.</p>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {photos.length > 0 && (
          <button disabled={!!busy} onClick={savePhotos} className="rounded-xl px-4 py-2 font-bold border border-slate-300 inline-flex items-center gap-2 disabled:opacity-40">
            {busy === "photos" ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />} 1. Save {photos.length} photos
          </button>
        )}
        <button onClick={open} className="rounded-xl px-4 py-2 font-bold text-white inline-flex items-center gap-2" style={{ background: NAVY }}>
          <ExternalLink size={16} /> {photos.length > 0 ? "2." : "1."} Copy title and open Marketplace
        </button>
        {price && <Chip id="price" label="Copy price" text={price.replace(/[^0-9.]/g, "")} />}
        <Chip id="body" label="Copy description" text={body} />
        <button disabled={!!busy} onClick={posted} className="rounded-xl px-4 py-2 font-bold text-white inline-flex items-center gap-2 disabled:opacity-40" style={{ background: "#1F9D55" }}>
          {busy === "posted" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Posted, count it
        </button>
      </div>
      {l?.posted && <p className="text-xs text-green-700">{l.posted.by} posted this one {ago(l.posted.at)}</p>}
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </Card>
  );
}
