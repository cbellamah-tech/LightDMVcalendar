import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { OFFICE, requireRole } from "@/lib/auth";
import { authorizeUrl, jobberConfigured, stableOrigin } from "@/lib/jobber";

export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  if (!jobberConfigured()) return NextResponse.redirect(new URL("/settings/jobber?error=not_configured", req.url));
  // Start on the same address Jobber sends people back to, so the state cookie is there when they return.
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const origin = `${req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")}://${host}`;
  const home = stableOrigin(origin);
  if (home !== origin) return NextResponse.redirect(`${home}/api/jobber/connect`);
  const state = randomBytes(16).toString("hex");
  cookies().set("ldmv_jobber_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  return NextResponse.redirect(authorizeUrl(origin, state));
}
