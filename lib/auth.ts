import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, Role, Session, verifySession } from "./session";

export async function getSession(): Promise<Session | null> {
  return verifySession(cookies().get(COOKIE)?.value);
}

/** For route handlers: returns the session, or a 401/403 response to return as-is. */
export async function requireRole(...roles: Role[]): Promise<Session | NextResponse> {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (roles.length && !roles.includes(s.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return s;
}

export const OFFICE: Role[] = ["owner", "manager"];
export const ANYONE: Role[] = [];
