import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { signOff } from "@/lib/installProgress";

export const dynamic = "force-dynamic";

/** Body: { uid, module, undo? }. Crew leads and owners sign a person off on a module after a real job. */
export async function POST(req: Request) {
  const s = await requireRole("owner", "manager", "lead");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.uid !== "string" || typeof b.module !== "string") return NextResponse.json({ error: "Bad sign-off" }, { status: 400 });
  if (b.uid === s.uid && s.role !== "owner") return NextResponse.json({ error: "Someone else signs you off" }, { status: 403 });
  await signOff(b.uid, b.module.slice(0, 80), s.name, !!b.undo);
  return NextResponse.json({ ok: true });
}
