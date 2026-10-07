import { NextResponse } from "next/server";
import { OFFICE, requireRole } from "@/lib/auth";
import { blockSender } from "@/lib/google";
import { kvGet, kvSet } from "@/lib/store";

/** "Not a customer": hide this sender (or their whole @domain) from the Marketing inbox from now on. */
export async function POST(req: Request) {
  const s = await requireRole(...OFFICE);
  if (s instanceof NextResponse) return s;
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").toLowerCase().trim();
  if (!email.includes("@")) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  const personal = /@(gmail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|comcast|verizon)\./.test(email);
  await blockSender(personal ? email : `@${email.split("@")[1]}`);
  // Drop the hidden threads from the cached list right away.
  const cur = await kvGet<{ at: number; threads: { email: string }[] }>("ldmv:google:inbox");
  if (cur) await kvSet("ldmv:google:inbox", { ...cur, threads: cur.threads.filter((t) => personal ? t.email !== email : !t.email.endsWith(`@${email.split("@")[1]}`)) });
  return NextResponse.json({ ok: true });
}
