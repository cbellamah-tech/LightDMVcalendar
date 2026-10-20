import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { refreshDrafts, saveSiteToken } from "@/lib/siteDrafts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** An owner pastes a read-only GitHub token once so the tab can show pages waiting to go live. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.token !== "string" || !b.token.trim()) return NextResponse.json({ error: "Paste the token." }, { status: 400 });
  try {
    await saveSiteToken(b.token, s.name);
    const d = await refreshDrafts();
    return NextResponse.json({ ok: true, waiting: d?.items.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
