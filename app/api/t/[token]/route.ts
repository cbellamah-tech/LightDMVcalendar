import { NextResponse } from "next/server";
import { publicView } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/* A customer's live link. No sign-in: it's the customer's phone. Only that customer's ETA, the count of homes and
   the van to within a mile come back, never another customer's name or address. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = String(params.token || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  const v = await publicView(token).catch(() => ({ state: "gone" as const }));
  return NextResponse.json(v, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
