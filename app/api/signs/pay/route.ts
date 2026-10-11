import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getPay, PAY_PER_SIGN, PayEntry } from "@/lib/signs";

export const dynamic = "force-dynamic";

const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function summary(uid: string, list: PayEntry[]) {
  const today = dayKey(Date.now());
  const weekAgo = Date.now() - 7 * 86400_000;
  const sum = (f: (e: PayEntry) => boolean) => list.filter(f).reduce((a, e) => ({ signs: a.signs + e.signs, amount: a.amount + e.amount }), { signs: 0, amount: 0 });
  const days = new Map<string, { signs: number; amount: number }>();
  for (const e of list) {
    const k = dayKey(e.at), d = days.get(k) ?? { signs: 0, amount: 0 };
    d.signs += e.signs; d.amount += e.amount; days.set(k, d);
  }
  return {
    uid, name: list[0]?.name ?? uid,
    today: sum((e) => dayKey(e.at) === today), week: sum((e) => e.at >= weekAgo), all: sum(() => true),
    added: list.filter((e) => e.added).length,
    days: [...days.entries()].map(([day, v]) => ({ day, ...v })),
    recent: list.slice(0, 200),
  };
}

/** The sign placer sees his own pay; owners and the office see everyone's. */
export async function GET() {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  const all = await getPay();
  const office = s.role === "owner" || s.role === "manager";
  const people = Object.entries(all).filter(([uid]) => office || uid === s.uid).map(([uid, list]) => summary(uid, list));
  if (!office && !people.length) people.push({ ...summary(s.uid, []), name: s.name });
  return NextResponse.json({ perSign: PAY_PER_SIGN, people });
}
