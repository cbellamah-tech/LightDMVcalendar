import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { quotesPage } from "@/lib/jobber";

export const dynamic = "force-dynamic";

/** One page of quotes with line items; the Jobber page loops over `next` and builds the CSV. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(await quotesPage(new URL(req.url).searchParams.get("cursor")));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
