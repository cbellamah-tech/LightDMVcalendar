import { NextResponse } from "next/server";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

// Names for the sign-in picker. No phone numbers or roles beyond what the picker needs.
export async function GET() {
  const users = await listUsers();
  return NextResponse.json(
    users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, hasPin: !!u.pinHash, owner: u.role === "owner" })),
  );
}
