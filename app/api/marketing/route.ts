import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { ensureRunnerFile, marketingDashboard } from "@/lib/marketingData";
import { botKey } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Marketing tab (?area=owners for the owners' Briefing). */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const q = new URL(req.url).searchParams;
  const area = q.get("area") === "owners" ? "owners" : "marketing";
  if (area === "owners" && s.role !== "owner") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  ensureRunnerFile().catch(() => {});
  const d = await marketingDashboard({ week: q.get("week") || undefined, refresh: q.get("refresh") === "1", days: [7, 30, 90].includes(+q.get("days")!) ? +q.get("days")! : 30 });
  return NextResponse.json({
    ...d,
    feed: d.feed.filter((f) => f.area === area),
    role: s.role,
    // Only owners see the drop box key (it lets a bot post here).
    botBox: s.role === "owner" ? { url: `${new URL(req.url).origin}/api/marketing/bot`, key: await botKey() } : null,
  });
}
