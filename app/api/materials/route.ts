import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { listMaterials } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Material used per job (C9 feet, C7 bulbs, mini strands), for the inventory ledger. ?format=csv for a spreadsheet. */
export async function GET(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const rows = await listMaterials();
  if (new URL(req.url).searchParams.get("format") !== "csv") return NextResponse.json({ rows });
  const head = ["date", "kind", "crew", "jobNumber", "jobberJobId", "c9Feet", "c7Bulbs", "miniStrands", "enteredBy"];
  const csv = [head.join(","), ...rows.map((r) => [r.date.slice(0, 10), r.kind, r.crew ?? "", r.jobNumber ?? "", r.jobberJobId ?? "", r.c9Feet, r.c7Bulbs, r.miniStrands, `"${r.by.replace(/"/g, '""')}"`].join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=materials_used.csv" } });
}
