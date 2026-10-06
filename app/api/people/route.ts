import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { hashPin, listUsers, saveUsers, slug, toPublic, User, validPin } from "@/lib/users";

export const dynamic = "force-dynamic";
const ROLES = ["owner", "manager", "lead", "crew"];

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json((await listUsers()).map(toPublic));
}

/* Upsert one person. Body: { id?, name, role, crew?, phone?, jobberName?, active?, pin? } */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  if (!b.name || !ROLES.includes(b.role)) return NextResponse.json({ error: "Name and role are required." }, { status: 400 });
  // Only owners can create or edit owners.
  if (s.role !== "owner" && b.role === "owner") return NextResponse.json({ error: "Only an owner can add an owner." }, { status: 403 });
  if (b.pin && !validPin(b.pin)) return NextResponse.json({ error: "PIN must be 4 to 8 digits." }, { status: 400 });

  const users = await listUsers();
  let u = b.id ? users.find((x) => x.id === b.id) : undefined;
  if (u && s.role !== "owner" && u.role === "owner") return NextResponse.json({ error: "Only an owner can edit an owner." }, { status: 403 });
  if (!u) {
    let id = slug(b.name);
    while (users.some((x) => x.id === id)) id += "-2";
    u = { id, name: b.name, role: b.role, active: true } as User;
    users.push(u);
  }
  u.name = String(b.name).trim();
  u.role = b.role;
  u.crew = b.crew || undefined;
  u.phone = b.phone || undefined;
  u.jobberName = b.jobberName || undefined;
  u.active = b.active !== false;
  if (b.pin) u.pinHash = hashPin(b.pin);
  if (b.clearPin) u.pinHash = undefined;
  await saveUsers(users);
  return NextResponse.json(toPublic(u));
}
