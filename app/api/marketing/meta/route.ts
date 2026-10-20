import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { saveMetaCreds, syncMetaAds } from "@/lib/ads";

export const dynamic = "force-dynamic";

/** An owner pastes the Facebook ads token and ad account ID once; it is checked against Facebook, then kept server-side. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.token !== "string" || typeof b.account !== "string" || !b.token.trim()) return NextResponse.json({ error: "Paste the token and the ad account ID." }, { status: 400 });
  try {
    const r = await saveMetaCreds(b.token, b.account, s.name);
    await syncMetaAds(true).catch(() => null);
    return NextResponse.json({ ok: true, name: r.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
