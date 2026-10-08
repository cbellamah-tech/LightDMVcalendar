import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { loadPack, savePack } from "@/lib/training";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const info = (p: Awaited<ReturnType<typeof loadPack>>) =>
  ({ builtAt: p?.builtAt ?? null, modules: p?.quote?.modules.length ?? p?.modules.length ?? 0, practice: p?.quote?.jobs.length ?? p?.quotes.length ?? 0, install: p?.install?.modules?.length ?? 0 });

export async function GET() {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(info(await loadPack()));
}

/** Owner uploads training_pack.json (lessons + past quotes with real prices; kept out of the public code). */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(info(await savePack(await req.json())));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
