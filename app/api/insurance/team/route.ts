import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadTeam, setClass } from "@/lib/insurance";
import { CREWS, listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Everyone with an app account plus how owners classed them (owner, W-2 or 1099). */
export async function GET() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const [users, team] = await Promise.all([listUsers(), loadTeam()]);
  const people = users.filter((u) => u.active).map(({ id, name, role, crew, phone }) => ({ id, name, role, crew: crew ? CREWS[crew] ?? crew : undefined, phone }));
  return NextResponse.json({ people, team });
}

/** Body: { userId, cls: "owner" | "w2" | "1099" | "unset" } */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.userId !== "string" || !b.userId) return NextResponse.json({ error: "Missing person" }, { status: 400 });
  try {
    return NextResponse.json({ team: await setClass(b.userId, b.cls) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
