import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { customerProfile } from "@/lib/customers";
import { laterOnce } from "@/lib/background";
import { ghlConfigured } from "@/lib/ghl";
import { refreshContacts } from "@/lib/cxGhl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One customer: seasons, photos, texts and notes. Their GoHighLevel notes and texts refresh after the answer
    when the saved copy is over 30 minutes old (the page asks again a few seconds later). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const p = await customerProfile(params.id);
  if (!p) return NextResponse.json({ error: "No such customer" }, { status: 404 });
  const { notesAt, textsAt } = p.synced;
  const stale = !notesAt || !textsAt || Date.now() - Math.min(notesAt, textsAt) > 30 * 60_000;
  const refreshing = stale && p.contactIds.length > 0 && ghlConfigured();
  if (refreshing) await laterOnce(`cx:${params.id}`, () => refreshContacts(p.contactIds), 60_000);
  const { contactIds: _ids, ...shown } = p;
  return NextResponse.json({ ...shown, refreshing });
}
