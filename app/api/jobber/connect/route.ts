import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { OFFICE, requireRole } from "@/lib/auth";
import { authorizeUrl, jobberConfigured } from "@/lib/jobber";

export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  if (!jobberConfigured()) return NextResponse.redirect(new URL("/settings/jobber?error=not_configured", req.url));
  const state = randomBytes(16).toString("hex");
  cookies().set("ldmv_jobber_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  return NextResponse.redirect(authorizeUrl(new URL(req.url).origin, state));
}
