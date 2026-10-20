import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { driveThumb } from "@/lib/google";
import { getLibrary } from "@/lib/social";

export const dynamic = "force-dynamic";

/** A preview of a file on the Post screen's Drive list (?id=, ?w=). Only files on that list. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  if (!(await getLibrary()).items.some((x) => x.id === id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const r = await driveThumb(id, Number(q.get("w")) || 400);
    return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=86400" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
