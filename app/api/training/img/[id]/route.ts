import { NextResponse } from "next/server";
import { ANYONE, requireRole } from "@/lib/auth";
import { imageUrl } from "@/lib/training";

export const dynamic = "force-dynamic";

/** A course photo, from the app's photo storage. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole(...ANYONE);
  if (s instanceof NextResponse) return s;
  const url = await imageUrl(params.id);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const res = NextResponse.redirect(new URL(url, req.url));
  res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
}
