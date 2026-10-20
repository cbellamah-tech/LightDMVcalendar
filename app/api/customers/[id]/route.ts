import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { customerProfile } from "@/lib/customers";
import { laterOnce } from "@/lib/background";
import { ghlConfigured } from "@/lib/ghl";
import { googleStatus } from "@/lib/google";
import { refreshContacts } from "@/lib/cxGhl";
import { aiReady, fingerprint, getSummary, refreshSummary } from "@/lib/cxSummary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One customer: summary, seasons, photos, texts, emails and notes. After the answer, their GoHighLevel notes and
    texts and their emails are re-read when the saved copies are over 30 minutes old, and the summary is rewritten
    when the messages changed (the page asks again a few seconds later). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const [p, summary, ai, google] = await Promise.all([customerProfile(params.id), getSummary(params.id), aiReady(), googleStatus()]);
  if (!p) return NextResponse.json({ error: "No such customer" }, { status: 404 });
  const old = (t?: number) => !t || Date.now() - t > 30 * 60_000;
  const { notesAt, textsAt, emailsAt } = p.synced;
  const ghlStale = p.contactIds.length > 0 && ghlConfigured() && (old(notesAt) || old(textsAt));
  const emailStale = google.connected && p.emails.length > 0 && old(emailsAt);
  // A summary that failed is tried again after 10 minutes, not on every look.
  const failedLately = !!summary?.error && Date.now() - (summary.triedAt ?? summary.at) < 10 * 60_000;
  const summaryStale = ai && !failedLately && (!summary || !!summary.error || summary.fp !== fingerprint(p.timeline));
  const refreshing = ghlStale || emailStale || summaryStale;
  if (refreshing) {
    await laterOnce(`cx:${params.id}`, async () => {
      if (ghlStale) await refreshContacts(p.contactIds).catch((e) => console.error("[cx ghl]", e?.message ?? e));
      await refreshSummary(params.id);
    }, 60_000);
  }
  const { contactIds: _ids, ...shown } = p;
  return NextResponse.json({ ...shown, summary, ai, refreshing });
}
