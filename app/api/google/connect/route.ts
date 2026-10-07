import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { googleAuthUrl, googleConfigured } from "@/lib/google";
import { stableOrigin } from "@/lib/jobber";

export async function GET(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  if (!googleConfigured()) return NextResponse.redirect(new URL("/marketing?error=google_not_set_up", req.url));
  // Start on the address Google sends people back to, so the state cookie is there on return.
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const origin = `${req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")}://${host}`;
  const home = stableOrigin(origin);
  if (home !== origin) return NextResponse.redirect(`${home}/api/google/connect`);
  const state = randomBytes(16).toString("hex");
  cookies().set("ldmv_google_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  return NextResponse.redirect(googleAuthUrl(origin, state));
}

export async function DELETE() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const { googleDisconnect } = await import("@/lib/google");
  await googleDisconnect();
  return NextResponse.json({ ok: true });
}
