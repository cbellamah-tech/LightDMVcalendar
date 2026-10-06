import { NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/store";

export const dynamic = "force-dynamic";

const KEY = "ldmv-ops-board-v1";

export async function GET() {
  try {
    const data = await kvGet(KEY);
    return NextResponse.json(data ?? { tasks: null, done: {} });
  } catch (e) {
    console.error("GET /api/board failed", e);
    return NextResponse.json({ tasks: null, done: {}, error: true });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await kvSet(KEY, { tasks: body.tasks ?? null, done: body.done ?? {} });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/board failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
