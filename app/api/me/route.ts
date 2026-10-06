import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ uid: s.uid, name: s.name, role: s.role, crew: s.crew });
}
