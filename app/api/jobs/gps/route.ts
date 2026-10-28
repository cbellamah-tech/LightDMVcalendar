import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getJobs } from "@/lib/jobs";
import { etDay } from "@/lib/crewNotes";
import { later, laterOnce } from "@/lib/background";
import { autoTextIfDue, crewJobs, geocodeMissing, savePing } from "@/lib/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Whether this phone should be sharing its location: a crew lead with stops today. */
export async function GET() {
  const s = await requireRole("lead", "crew", "owner", "manager");
  if (s instanceof NextResponse) return s;
  if (!s.crew) return NextResponse.json({ share: false, stops: 0 });
  const stops = crewJobs(await getJobs(), s.crew, etDay()).length;
  return NextResponse.json({ share: s.role === "lead" && stops > 0, stops, crew: s.crew });
}

/* Body: { lat, lng, acc } from the crew lead's phone, about once a minute while the app is open. */
export async function POST(req: Request) {
  const s = await requireRole("lead", "crew", "owner", "manager");
  if (s instanceof NextResponse) return s;
  if (!s.crew) return NextResponse.json({ error: "You're not on a crew." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.acc);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: "Bad location" }, { status: 400 });
  await savePing(s.crew, { lat, lng, acc: Number.isFinite(acc) ? Math.round(acc) : undefined }, s.name);
  const crew = s.crew;
  const origin = new URL(req.url).origin;
  // Map points for today's homes and, when switched on, the customers' links: after the answer, never before.
  await laterOnce(`trk-geo-${crew}`, async () => {
    const all = await getJobs();
    await geocodeMissing(crewJobs(all, crew, etDay()).map((j) => j.address), 25_000);
  }, 10 * 60_000);
  later(`trk-auto-${crew}`, () => autoTextIfDue(crew, origin));
  return NextResponse.json({ ok: true });
}
