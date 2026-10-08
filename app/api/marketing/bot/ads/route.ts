import { NextResponse } from "next/server";
import { checkBotKey } from "@/lib/marketing";
import { AdDay, recordAds } from "@/lib/ads";

export const dynamic = "force-dynamic";

/* The Google Ads script's drop box ("Authorization: Bearer <bot key>"):
   POST { "source": "google", "days": [{ "day": "2026-10-06", "spend": 41.2, "clicks": 33, "impressions": 900, "leads": 2 }] } */
export async function POST(req: Request) {
  if (!(await checkBotKey(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!["google", "lsa", "facebook"].includes(b?.source)) return NextResponse.json({ error: "source must be google, lsa or facebook" }, { status: 400 });
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(1e7, Number(x))) : 0);
  const days: AdDay[] = (Array.isArray(b.days) ? b.days : []).slice(0, 400)
    .filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d?.day)))
    .map((d: any) => ({ source: b.source, day: d.day, spend: num(d.spend), clicks: num(d.clicks), impressions: num(d.impressions), leads: num(d.leads) }));
  return NextResponse.json({ saved: await recordAds(days) });
}
