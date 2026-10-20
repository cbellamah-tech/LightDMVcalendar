import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { googleStatus } from "@/lib/google";
import { getGbp, refreshGbp } from "@/lib/gbp";
import { adsSummary, allAdDays } from "@/lib/ads";
import { laterOnce } from "@/lib/background";
import { addDays, etDay } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The live stats card at the top of Marketing: Business Profile, Facebook ads and Google ads, 90 days per day.
    Saved numbers come back at once; Google and Facebook are re-read in the background. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const g = await googleStatus();
  let gbp = await getGbp();
  if (g.connected && (refresh || !gbp)) gbp = await refreshGbp().catch(() => gbp);
  else if (g.connected && Date.now() - (gbp?.at ?? 0) > 3 * 3600_000) await laterOnce("gbp-refresh", () => refreshGbp());

  const ads = await adsSummary(); // also re-reads Facebook in the background when it's over an hour old
  const since = addDays(etDay(Date.now()), -100);
  const days = (await allAdDays()).filter((d) => d.day >= since).sort((a, b) => a.day.localeCompare(b.day));
  return NextResponse.json({
    today: etDay(Date.now()),
    google: { connected: g.connected, configured: g.configured },
    gbp: gbp && g.connected ? { ...gbp, locations: gbp.locations.map((l) => ({ ...l, days: l.days.filter((d) => d.day >= since) })) } : null,
    ads: {
      facebook: { configured: ads.facebook.configured, days: days.filter((d) => d.source === "facebook") },
      google: { days: days.filter((d) => d.source === "google") },
      lsa: { days: days.filter((d) => d.source === "lsa") },
      error: ads.error,
    },
    role: s.role,
  });
}
