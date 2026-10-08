import { randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { envAny } from "./env";
import { kvGet, kvSet, kvUpdate } from "./store";
import { etDay } from "./marketing";

/* Daily media: the video (or photos) the daily run makes from Drive job photos, with a caption per platform,
   waiting on the Marketing tab for one tap to post through GoHighLevel. */

export type Platform = "facebook" | "instagram" | "linkedin" | "google" | "youtube";
export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook" }, { id: "instagram", label: "Instagram" },
  { id: "google", label: "Google Business" }, { id: "linkedin", label: "LinkedIn" }, { id: "youtube", label: "YouTube" },
];

/* Listings there's no API for: the app writes them, someone taps Copy & open, posts, then taps Posted (which counts it in the sheet). */
export type ListingSite = "marketplace" | "craigslist";
export const LISTING_SITES: { id: ListingSite; label: string; channel: "marketplace" | "craigslist"; postUrl: string }[] = [
  { id: "marketplace", label: "Facebook Marketplace", channel: "marketplace", postUrl: "https://www.facebook.com/marketplace/create/item" },
  { id: "craigslist", label: "Craigslist", channel: "craigslist", postUrl: "https://post.craigslist.org/" },
];
export type Listing = { title: string; body: string; price?: string; posted?: { at: number; by: string } };

export type MediaItem = {
  id: string;
  day: string;                 // the day it was made for (Eastern)
  kind: "video" | "photo";
  url: string;                 // public URL (Supabase Storage)
  contentType: string;
  title: string;
  captions: Partial<Record<Platform, string>>;   // youtube: first line is the title
  listings?: Partial<Record<ListingSite, Listing>>;
  stills?: string[];           // a few still photos (public URLs) for the listings
  photoIds: string[];          // Drive photos used, so they aren't reused soon
  createdAt: number;
  by: string;
  status: "uploading" | "ready";
  posts?: { at: number; by: string; platforms: string[]; ok: boolean; error?: string }[];
  skipped?: boolean;
};

const ITEMS = "ldmv:mkt:media";
const USED = "ldmv:mkt:media:used";
const RUNNER_KEY = "ldmv:mkt:runnerkey";

export const getMedia = async () => (await kvGet<MediaItem[]>(ITEMS)) ?? [];

export async function saveMedia(item: MediaItem) {
  await kvUpdate<MediaItem[]>(ITEMS, [], (all) => [item, ...all.filter((m) => m.id !== item.id)].slice(0, 120));
  if (item.photoIds.length)
    await kvUpdate<Record<string, number>>(USED, {}, (u) => { for (const id of item.photoIds) u[id] = Date.now(); });
}

export async function patchMedia(id: string, fn: (m: MediaItem) => void) {
  let out: MediaItem | undefined;
  await kvUpdate<MediaItem[]>(ITEMS, [], (all) => all.map((m) => (m.id === id ? (fn(m), (out = m)) : m)));
  return out;
}

/** Drive photo ids used in the last 60 days. */
export async function usedPhotoIds() {
  const u = (await kvGet<Record<string, number>>(USED)) ?? {};
  return new Set(Object.entries(u).filter(([, t]) => Date.now() - t < 60 * 86400_000).map(([k]) => k));
}

export const newMediaId = () => `m_${etDay(Date.now())}_${randomBytes(4).toString("hex")}`;

/* ---------- The runner's key ---------- */

export async function runnerKey(): Promise<string> {
  const cur = await kvGet<string>(RUNNER_KEY);
  if (cur) return cur;
  const k = `ldmvrun_${randomBytes(24).toString("hex")}`;
  await kvSet(RUNNER_KEY, k);
  return k;
}

export async function checkRunner(header: string | null) {
  // MARKETING_RUNNER_KEY is only for running the video maker by hand (local testing); normally the key lives in kv.
  const cur = process.env.MARKETING_RUNNER_KEY?.trim() || (await kvGet<string>(RUNNER_KEY));
  const got = header?.replace(/^Bearer\s+/i, "").trim();
  return !!cur && !!got && got.length === cur.length && timingSafeEqual(Buffer.from(got), Buffer.from(cur));
}

/* ---------- Big files go straight to Supabase Storage (Vercel caps request bodies at 4.5 MB) ---------- */

const BUCKET = "ldmv-photos";
export function storage() {
  const url = envAny("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"), key = envAny("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET) : null;
}

export async function signedUpload(path: string) {
  const s = storage();
  if (!s) return null;
  // The photo store makes this bucket on first use; make sure it exists even if no photo has been taken yet.
  const url = envAny("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")!, key = envAny("SUPABASE_SERVICE_ROLE_KEY")!;
  await createClient(url, key, { auth: { persistSession: false } }).storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const { data, error } = await s.createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Couldn't make an upload link: ${error?.message}`);
  return { uploadUrl: data.signedUrl, publicUrl: s.getPublicUrl(path).data.publicUrl };
}
