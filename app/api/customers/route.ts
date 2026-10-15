import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadIndex, searchRows } from "@/lib/customers";
import { getCxState, kickCustomers } from "@/lib/cxSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the background sync this starts runs after the answer

/** Owners' customer list: ?q= any name, street, phone or email; ?status=customer|quoted|lead. */
export async function GET(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const url = new URL(req.url);
  const [rows, state] = await Promise.all([loadIndex(), getCxState(), kickCustomers(url.origin, 15 * 60_000).catch(() => false)]);
  const hits = searchRows(rows, url.searchParams.get("q") || "", url.searchParams.get("status") || "all");
  const limit = Math.min(1000, Number(url.searchParams.get("limit")) || 100);
  const counts = { all: rows.length, customer: 0, quoted: 0, lead: 0 };
  for (const r of rows) counts[r.status]++;
  return NextResponse.json({ rows: hits.slice(0, limit), found: hits.length, counts, state });
}

/** { sync: true }: read Jobber and GoHighLevel now. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const started = await kickCustomers(new URL(req.url).origin, 0);
  return NextResponse.json({ started, state: await getCxState() });
}
