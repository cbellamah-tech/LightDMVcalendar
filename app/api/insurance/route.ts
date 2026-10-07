import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadInsurance, saveInsurance, setDone } from "@/lib/insurance";

export const dynamic = "force-dynamic";

// Owners only (the middleware also blocks everyone else from /insurance and /api/insurance).
export async function GET() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await loadInsurance());
}

/** Owner uploads insurance.json (built from the Drive policies and certificates). */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(await saveInsurance(await req.json()));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** Tick a to-do done or not: { id, done }. */
export async function PATCH(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });
  return NextResponse.json({ done: await setDone(b.id, !!b.done, s.name) });
}
