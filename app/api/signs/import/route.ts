import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { importBundled, importRoutes } from "@/lib/signs";

export const dynamic = "force-dynamic";

/* Body: { csv?: string, filename?: string }. No csv re-imports the bundled draft file. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  try {
    const meta = b.csv ? await importRoutes(String(b.csv), b.filename || "uploaded CSV", s.name) : await importBundled(s.name);
    return NextResponse.json(meta);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Import failed" }, { status: 400 });
  }
}
