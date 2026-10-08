import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { LISTING_SITES, patchMedia } from "@/lib/media";
import { logCount } from "@/lib/marketing";
import { syncSheet } from "@/lib/marketingData";
import { googleStatus } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* POST { id, site: "marketplace" | "craigslist", title?, body? }: it's posted. Counts it (and writes the sheet), keeps any edits. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const site = LISTING_SITES.find((x) => x.id === b.site);
  if (!site) return NextResponse.json({ error: "Pick marketplace or craigslist" }, { status: 400 });
  const m = await patchMedia(String(b.id || ""), (x) => {
    const l = x.listings?.[site.id];
    if (!l) return;
    if (typeof b.title === "string") l.title = b.title.slice(0, 150);
    if (typeof b.body === "string") l.body = b.body.slice(0, 4000);
    l.posted = { at: Date.now(), by: s.name };
  });
  if (!m?.listings?.[site.id]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await logCount({ channel: site.channel, n: 1, by: s.name, via: "tap", note: m.listings[site.id]!.title });
  let sheet: string | undefined;
  if ((await googleStatus()).connected) sheet = (await syncSheet(`${s.name} posted a listing`).catch((e) => ({ error: e.message }))).error;
  return NextResponse.json({ ok: true, sheetError: sheet });
}
