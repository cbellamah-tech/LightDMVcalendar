import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { disconnect, getStatus, isConnected, jobberConfigured, redirectUri } from "@/lib/jobber";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json({
    configured: jobberConfigured(),
    connected: await isConnected(),
    redirectUri: redirectUri(new URL(req.url).origin),
    ...(await getStatus()),
  });
}

export async function DELETE() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  await disconnect();
  return NextResponse.json({ ok: true });
}
