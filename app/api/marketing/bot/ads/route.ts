import { NextResponse } from "next/server";
import { checkBotKey } from "@/lib/marketing";
import { AdDay, recordAds } from "@/lib/ads";
import { AdKeyword, saveAdKeywords } from "@/lib/googleInsights";

export const dynamic = "force-dynamic";

/* The Google Ads script's drop box ("Authorization: Bearer <bot key>"):
   POST { "source": "google", "days": [{ "day": "2026-10-06", "spend": 41.2, "clicks": 33, "impressions": 900, "leads": 2 }] }
   or   { "source": "google_keywords", "days": 30, "keywords": [{ "text", "match", "campaign", "clicks", "impressions", "cost", "conversions" }], "terms": [...] } */
export async function POST(req: Request) {
  if (!(await checkBotKey(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(1e7, Number(x))) : 0);
  if (b?.source === "google_keywords") {
    const clean = (rows: unknown): AdKeyword[] => (Array.isArray(rows) ? rows : []).slice(0, 500)
      .filter((k: any) => typeof k?.text === "string" && k.text.trim())
      .map((k: any) => ({
        text: k.text.trim().slice(0, 120), match: typeof k.match === "string" ? k.match.slice(0, 20) : undefined,
        campaign: typeof k.campaign === "string" ? k.campaign.slice(0, 80) : undefined,
        clicks: num(k.clicks), impressions: num(k.impressions), cost: Math.round(num(k.cost) * 100) / 100, conversions: Math.round(num(k.conversions) * 10) / 10,
      }));
    const keywords = clean(b.keywords), terms = clean(b.terms);
    await saveAdKeywords({ at: Date.now(), days: num(b.days) || 30, keywords, terms });
    return NextResponse.json({ saved: keywords.length + terms.length });
  }
  if (!["google", "lsa", "facebook"].includes(b?.source)) return NextResponse.json({ error: "source must be google, lsa, facebook or google_keywords" }, { status: 400 });
  const days: AdDay[] = (Array.isArray(b.days) ? b.days : []).slice(0, 400)
    .filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d?.day)))
    .map((d: any) => ({ source: b.source, day: d.day, spend: num(d.spend), clicks: num(d.clicks), impressions: num(d.impressions), leads: num(d.leads) }));
  return NextResponse.json({ saved: await recordAds(days) });
}
