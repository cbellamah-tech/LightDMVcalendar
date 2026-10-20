import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { laterOnce } from "@/lib/background";
import { googleStatus } from "@/lib/google";
import { addManual, allSpending, CATS, editLine, emailStatus, importBank, removeManual, scanEmail, seasonStart, sheetState, SOURCE_LABEL, syncSheet } from "@/lib/spending";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Owners only (also gated in middleware). GET = every expense line; POST { action, ... } changes them.
   Opening the page reads new receipts from email and refreshes the Google Sheet in the background, each at most hourly. */
export async function GET() {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const [lines, email, sheet, google] = await Promise.all([allSpending(), emailStatus(), sheetState(), googleStatus()]);
  if (google.connected) {
    if (Date.now() - email.lastAt > 60 * 60_000) await laterOnce("spend-email", () => scanEmail(), 5 * 60_000);
    if (Date.now() - (sheet?.syncedAt ?? 0) > 60 * 60_000) await laterOnce("spend-sheet", () => syncSheet(), 5 * 60_000);
  }
  return NextResponse.json({
    lines, cats: CATS, sources: SOURCE_LABEL, email, google: google.connected,
    sheet: sheet ? { url: sheet.url, syncedAt: sheet.syncedAt } : null,
    seasonStart: seasonStart(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })),
  });
}

export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "add": return NextResponse.json({ ok: true, line: await addManual(body.line, s.name) });
      case "remove": await removeManual(String(body.id)); return NextResponse.json({ ok: true });
      case "edit": await editLine(String(body.id), String(body.vendor ?? ""), { cat: body.cat, skip: body.skip }, s.name); return NextResponse.json({ ok: true });
      case "bank": return NextResponse.json({ ok: true, ...(await importBank(String(body.text ?? ""), String(body.name ?? ""), s.name)) });
      case "email": return NextResponse.json({ ok: true, ...(await scanEmail(80)) });
      case "sheet": { const st = await syncSheet(); return NextResponse.json({ ok: true, url: st.url }); }
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
