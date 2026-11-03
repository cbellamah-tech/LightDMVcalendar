import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getJobs } from "@/lib/jobs";
import { listUsers, CREWS } from "@/lib/users";
import { etDay, nextDay } from "@/lib/crewNotes";
import { laterOnce } from "@/lib/background";
import { crewDay, crewJobs, crewKey, crewLabel, crewsOn, geocodeMissing, leadOf, getSends, getSettings, linkText, linkTokens, linkUrl, saveSettings, sendLink } from "@/lib/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The office map: every crew's day with live ETAs, each customer's link and whether it was texted. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const origin = new URL(req.url).origin;
  const day = new URL(req.url).searchParams.get("day") || etDay();
  const [all, users, settings] = await Promise.all([getJobs(), listUsers(), getSettings()]);
  // Every crew out that day (People crews and Jobber-only groups), plus People crews with a lead even on a day off.
  const withLead = Object.keys(CREWS).filter((c) => users.some((u) => u.active && u.role === "lead" && u.crew === c));
  const keys = [...new Set([...withLead, ...crewsOn(all, day)])];
  const crews = await Promise.all(keys.map((c) => crewDay(c, day, { all, users })));
  const ids = crews.flatMap((c) => c.stops.map((x) => x.jobId));
  const [tokens, sends] = await Promise.all([linkTokens(ids), getSends(ids)]);
  const extra = new Map(ids.map((id, i) => [id, { link: linkUrl(tokens[i], origin), sends: sends[i] }]));
  // Homes without a map point yet (today and tomorrow) are looked up after this answer goes out.
  const missing = crews.flatMap((c) => c.stops.filter((x) => !x.at).map((x) => x.address));
  const tomorrow = crewsOn(all, nextDay(day)).flatMap((c) => crewJobs(all, c, nextDay(day)).map((j) => j.address));
  if (missing.length || tomorrow.length) await laterOnce("trk-geo-office", () => geocodeMissing([...missing, ...tomorrow], 25_000), 5 * 60_000);
  return NextResponse.json({
    day,
    settings,
    sample: linkText("Sam", users.find((u) => u.role === "lead" && u.crew === "crew1")?.name || "Gary", "install", `${linkUrl("example", origin)}`),
    crews: crews.map((c) => ({ ...c, label: crewLabel(c.crew, users, c.stops.map((x) => all[x.jobId]).filter(Boolean)), stops: c.stops.map((x) => ({ ...x, ...extra.get(x.jobId) })) })),
    locating: missing.length,
  });
}

/* Body: { autoText: boolean } (owners), or { text: jobId } to text one customer their link now. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.autoText === "boolean") {
    if (s.role !== "owner") return NextResponse.json({ error: "Only an owner can turn automatic texts on or off." }, { status: 403 });
    const next = b.autoText ? { autoText: true, turnedOnBy: s.name, turnedOnAt: Date.now() } : { autoText: false };
    await saveSettings(next);
    return NextResponse.json({ settings: next });
  }
  if (typeof b.text === "string") {
    const [all, users] = await Promise.all([getJobs(), listUsers()]);
    const job = all[b.text];
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const last = (await getSends([job.id]))[0].filter((x) => x.ok).pop();
    if (last && Date.now() - last.at < 5 * 60_000) return NextResponse.json({ error: "This customer was just texted their link." }, { status: 429 });
    const lead = leadOf(crewKey(job), users, [job]);
    const sent = await sendLink(job, lead, s.name, new URL(req.url).origin);
    if (!sent.ok) return NextResponse.json({ error: `Text not sent: ${sent.error}` }, { status: 502 });
    return NextResponse.json({ sent });
  }
  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}
