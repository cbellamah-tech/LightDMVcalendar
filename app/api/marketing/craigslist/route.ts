import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { addClPost, CL_AREAS, craigslistView } from "@/lib/craigslist";
import { logCount } from "@/lib/marketing";
import { syncSheet } from "@/lib/marketingData";
import { googleStatus } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Each area's ad for this week, which ones are due, and photos to add. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await craigslistView());
}

/* POST { area, title }: it's posted. Remembers when (so the area isn't due again for a week), counts it and writes the sheet. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const area = CL_AREAS.find((a) => a.id === b.area);
  if (!area) return NextResponse.json({ error: "Pick DC, Northern Virginia or Maryland" }, { status: 400 });
  const title = String(b.title || "").slice(0, 150);
  await addClPost({ area: area.id, at: Date.now(), by: s.name, title });
  await logCount({ channel: "craigslist", n: 1, by: s.name, via: "tap", note: `${area.label}: ${title}` });
  let sheet: string | undefined;
  if ((await googleStatus()).connected) sheet = (await syncSheet(`${s.name} posted a Craigslist ad`).catch((e) => ({ error: e.message }))).error;
  return NextResponse.json({ ok: true, sheetError: sheet });
}
