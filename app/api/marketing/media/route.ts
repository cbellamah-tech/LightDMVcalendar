import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getMedia, patchMedia, Platform, PLATFORMS } from "@/lib/media";
import { ghlConfigured } from "@/lib/ghl";
import { getAutoPost, postMedia, setAutoPost } from "@/lib/autopost";

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
  const results = await postMedia(m, want, s.name, b.captions && typeof b.captions === "object" ? b.captions : undefined);
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

/* PUT { autopost: true|false } (owner) -> new daily media posts itself to every connected platform */
export async function PUT(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  await setAutoPost(!!b.autopost, s.name);
  return NextResponse.json(await getAutoPost());
}
