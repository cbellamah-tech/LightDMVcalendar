import { NextResponse } from "next/server";
import { requireRole, OFFICE } from "@/lib/auth";
import { getJobs } from "@/lib/jobs";
import { listUsers } from "@/lib/users";
import { googleStatus } from "@/lib/google";
import { BONUS, cardLink, changeReview, getCards, getReviews, getSettings, getTaps, reviewUrl, scanIfStale, scanReviews, setReviewUrl } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Review cards page: each person's card link and taps, every review and where its $50 went. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const users = await listUsers();
  const [cards, taps, reviews, settings, jobsById, google] = await Promise.all([getCards(users), getTaps(), getReviews(), getSettings(), getJobs(), googleStatus()]);
  await scanIfStale().catch(() => {});
  const monthAgo = Date.now() - 30 * 86400_000;
  const people = users.filter((u) => u.active).map((u) => ({
    id: u.id, name: u.name, role: u.role, crew: u.crew, link: cardLink(cards[u.id]),
    taps: taps.filter((t) => t.personId === u.id && t.at >= monthAgo).length,
    lastTap: taps.filter((t) => t.personId === u.id).at(-1)?.at,
    credited: Object.values(reviews).filter((r) => r.status === "credited" && r.personId === u.id).reduce((t, r) => t + (r.amount ?? BONUS), 0),
  }));
  const job = (id?: string) => (id && jobsById[id] ? { id, client: jobsById[id].client, start: jobsById[id].start, kind: jobsById[id].kind } : undefined);
  const list = Object.values(reviews).sort((a, b) => b.at - a.at).map((r) => ({ ...r, job: job(r.jobId), suggestJob: job(r.suggest?.jobId) }));
  // Jobs the office can pick from when assigning: the last 60 days of installs and takedowns.
  const since = new Date(Date.now() - 60 * 86400_000).toISOString(), until = new Date(Date.now() + 86400_000).toISOString();
  const jobs = Object.values(jobsById).filter((j) => j.kind !== "fix" && j.start >= since && j.start < until)
    .sort((a, b) => b.start.localeCompare(a.start)).map((j) => ({ id: j.id, client: j.client, start: j.start, kind: j.kind }));
  return NextResponse.json({
    people, reviews: list, jobs, bonus: BONUS,
    reviewUrl: settings.reviewUrl ?? "", goesTo: await reviewUrl(), scannedAt: settings.scannedAt, error: settings.error,
    gmail: google.connected,
  });
}

/* { reviewUrl } | { scan: true } | { id, jobId?, personId?, amount?, skip?, reopen? } */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if ("reviewUrl" in b) {
    const v = String(b.reviewUrl || "").trim();
    if (v && !/^https:\/\/[^\s]+$/i.test(v)) return NextResponse.json({ error: "Paste the full link, starting with https://" }, { status: 400 });
    await setReviewUrl(v || null);
    return NextResponse.json({ ok: true });
  }
  if (b.scan) {
    try { return NextResponse.json(await scanReviews()); }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  }
  if (typeof b.id !== "string") return NextResponse.json({ error: "Which review?" }, { status: 400 });
  let amount: number | null | undefined;
  if ("amount" in b) {
    amount = b.amount === null || b.amount === "" ? null : Number(b.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1000)) return NextResponse.json({ error: "Enter a dollar amount." }, { status: 400 });
  }
  const r = await changeReview(b.id, { jobId: b.jobId, personId: b.personId, amount, skip: !!b.skip, reopen: !!b.reopen }, s.name);
  if (!r) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  return NextResponse.json({ review: r });
}
