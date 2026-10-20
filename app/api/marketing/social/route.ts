import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getMedia, Platform, PLATFORMS } from "@/lib/media";
import { getGhlSnap, ghlConfigured } from "@/lib/ghl";
import { getSocialLog, postFromLibrary, socialPage } from "@/lib/social";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* GET (?refresh=1)                                          -> saved posts table, Drive list, reels, recent posts
   POST { source: "drive"|"reel", id, platforms, captions }  -> posts now through GoHighLevel */

export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const [{ stats, lib, refreshing }, media, snap, log] = await Promise.all([socialPage(force), getMedia(), getGhlSnap(), getSocialLog()]);
  return NextResponse.json({
    ghl: ghlConfigured(),
    accounts: (snap?.accounts ?? []).map((a) => ({ platform: a.platform, name: a.name, expired: a.expired })),
    platforms: PLATFORMS,
    stats: { at: stats.at, rows: Object.values(stats.rows), week: stats.week, weekEnds: stats.weekEnds, errors: stats.errors },
    drive: { at: lib.at, error: lib.error, items: lib.items },
    reels: media.filter((m) => m.status === "ready" && !m.skipped).slice(0, 30).map((m) => ({
      id: m.id, day: m.day, kind: m.kind, url: m.url, title: m.title, captions: m.captions, still: m.stills?.[0],
      posted: (m.posts ?? []).some((p) => p.platforms.length),
    })),
    log: log.slice(0, 30),
    refreshing,
  });
}

export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  if (!ghlConfigured()) return NextResponse.json({ error: "GoHighLevel isn't connected yet." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const want: Platform[] = (Array.isArray(b.platforms) ? b.platforms : []).filter((p: string) => PLATFORMS.some((x) => x.id === p));
  const captions: Partial<Record<Platform, string>> = {};
  if (b.captions && typeof b.captions === "object")
    for (const p of PLATFORMS) if (typeof b.captions[p.id] === "string") captions[p.id] = b.captions[p.id].slice(0, 3000);
  try {
    const results = await postFromLibrary({ source: b.source === "reel" ? "reel" : "drive", id: String(b.id || "") }, want, captions, s.name);
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
