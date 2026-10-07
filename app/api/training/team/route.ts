import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { getProgress, getRates, loadPack, moduleStatus, trainees } from "@/lib/training";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Owner view: each trainee's modules, accuracy over time and weakest line item types. */
export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const pack = await loadPack();
  const rates = await getRates(pack);
  const users = await listUsers();
  const out = [];
  for (const uid of await trainees()) {
    const p = await getProgress(uid);
    const u = users.find((x) => x.id === uid);
    const byCat = new Map<string, number[]>();
    for (const a of p.attempts) for (const l of a.lines) byCat.set(l.cat, [...(byCat.get(l.cat) ?? []), l.pctOff]);
    const avg = (xs: number[]) => Math.round(xs.reduce((t, x) => t + x, 0) / xs.length);
    out.push({
      uid, name: u?.name ?? uid,
      modules: (pack?.modules ?? []).map((m) => ({ id: m.id, title: m.title, ...moduleStatus(m, p, rates.passPct) })),
      intake: p.intake ?? null,
      objections: p.objections ?? null,
      quotes: p.attempts.filter((a) => a.mode !== "tree").map((a) => ({ at: a.at, mode: a.mode, pctOff: a.pctOff })),
      trees: p.attempts.filter((a) => a.mode === "tree").length,
      finals: p.finals,
      worst: [...byCat].map(([cat, xs]) => ({ cat, n: xs.length, avgOff: avg(xs) })).sort((a, b) => b.avgOff - a.avgOff).slice(0, 4),
    });
  }
  return NextResponse.json({ passPct: rates.passPct, trainees: out });
}
