import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getMedia, patchMedia, Platform, PLATFORMS } from "@/lib/media";
import { expireGhlSnap, getGhlSnap, ghlConfigured, ghlPostNow } from "@/lib/ghl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* POST { id, platforms: ["facebook", ...], captions?: {...} }  -> posts now through GoHighLevel, one post per platform
   PATCH { id, captions?, skipped? }                            -> edit captions, or hide it */

export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  if (!ghlConfigured()) return NextResponse.json({ error: "GoHighLevel isn't connected yet." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const m = (await getMedia()).find((x) => x.id === b.id);
  if (!m || m.status !== "ready") return NextResponse.json({ error: "That media isn't ready." }, { status: 404 });
  const want: Platform[] = (Array.isArray(b.platforms) ? b.platforms : []).filter((p: string) => PLATFORMS.some((x) => x.id === p));
  const accounts = (await getGhlSnap())?.accounts ?? [];
  const results: { platform: string; ok: boolean; error?: string }[] = [];
  for (const p of want) {
    const ids = accounts.filter((a) => a.platform.includes(p === "google" ? "google" : p) && !a.expired).map((a) => a.id);
    const text = String(b.captions?.[p] ?? m.captions[p] ?? m.captions.facebook ?? m.title).slice(0, 3000);
    try {
      if (!ids.length) throw new Error(`No ${p} account connected in GoHighLevel's Social Planner.`);
      await ghlPostNow(ids, text, [{ url: m.url, type: m.contentType }]);
      results.push({ platform: p, ok: true });
    } catch (e: any) {
      results.push({ platform: p, ok: false, error: e.message });
    }
  }
  const ok = results.filter((r) => r.ok).map((r) => r.platform);
  const errors = results.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error}`).join("; ");
  await patchMedia(m.id, (x) => {
    x.posts = [...(x.posts ?? []), { at: Date.now(), by: s.name, platforms: ok, ok: !errors, error: errors || undefined }];
    if (b.captions && typeof b.captions === "object") for (const p of want) if (typeof b.captions[p] === "string") x.captions[p] = b.captions[p].slice(0, 3000);
  });
  // The posts count themselves when the Social Planner list is read next.
  await expireGhlSnap();
  return NextResponse.json({ results });
}

export async function PATCH(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const m = await patchMedia(String(b.id || ""), (x) => {
    if (b.captions && typeof b.captions === "object")
      for (const p of PLATFORMS) if (typeof b.captions[p.id] === "string") x.captions[p.id] = b.captions[p.id].slice(0, 3000);
    if (typeof b.skipped === "boolean") x.skipped = b.skipped;
  });
  return m ? NextResponse.json(m) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
