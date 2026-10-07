import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { deleteSub, loadSubs, saveSub } from "@/lib/insurance";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ subs: await loadSubs() });
}

/** Add or update one subcontractor (send id to update). */
export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ subs: await saveSub(await req.json()) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  return NextResponse.json({ subs: await deleteSub(id) });
}
