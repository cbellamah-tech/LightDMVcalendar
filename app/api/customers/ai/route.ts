import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { setAiKey } from "@/lib/cxSummary";

export const dynamic = "force-dynamic";

/** An owner saves the Claude key the customer summaries use. The key is checked with Anthropic, stored on the
    server, and never sent back. */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const { key } = await req.json().catch(() => ({}));
  const error = await setAiKey(String(key ?? ""));
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
