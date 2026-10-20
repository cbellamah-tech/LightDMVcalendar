import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { ghlConfigured } from "@/lib/ghl";
import { etDay } from "@/lib/marketing";
import { aiReady } from "@/lib/cxSummary";
import { laterOnce } from "@/lib/background";
import { editPost, fillQueue, getLiSettings, getQueue, linkedinAccounts, postNow, setLiSettings } from "@/lib/linkedin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* GET                                              -> the LinkedIn list: posts written ahead, recent ones, accounts
   POST { action: "edit", id, text?, approve?, skip?, photo?: "new"|"none"|driveId, rewrite? }
        { action: "post", id }                      -> posts it now
        { action: "approveAll" }                    -> approves every draft on the list
        { action: "perWeek", perWeek: 1|2 } */

async function page() {
  const [queue, settings, accounts, ai] = await Promise.all([getQueue(), getLiSettings(), linkedinAccounts(), aiReady()]);
  const today = etDay(Date.now());
  const upcoming = queue.filter((p) => p.status !== "posted" && !(p.status === "skipped" && p.day < today));
  const done = queue.filter((p) => p.status === "posted").reverse().slice(0, 20);
  // Fewer days written ahead than the schedule wants: write the rest after the answer goes out.
  const ahead = queue.filter((p) => p.day >= today).length;
  const writing = ahead < 4;
  if (writing) await laterOnce("li-fill", fillQueue, 5 * 60_000);
  return { ghl: ghlConfigured(), ai, settings, accounts: accounts.map((a) => ({ name: a.name, expired: a.expired })), upcoming, done, writing, today };
}

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await page());
}

export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "edit") {
      await editPost(String(b.id || ""), s.name, {
        text: typeof b.text === "string" ? b.text : undefined,
        approve: typeof b.approve === "boolean" ? b.approve : undefined,
        skip: typeof b.skip === "boolean" ? b.skip : undefined,
        photo: typeof b.photo === "string" ? b.photo : undefined,
        rewrite: b.rewrite === true,
      });
    } else if (b.action === "post") {
      await postNow(String(b.id || ""), s.name);
    } else if (b.action === "approveAll") {
      for (const p of (await getQueue()).filter((x) => x.status === "draft")) await editPost(p.id, s.name, { approve: true });
    } else if (b.action === "perWeek") {
      await setLiSettings({ perWeek: b.perWeek === 2 ? 2 : 1 });
      await laterOnce("li-fill", fillQueue, 5 * 60_000);
    } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json(await page());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
