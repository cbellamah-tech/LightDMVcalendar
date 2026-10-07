import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { googleExchange } from "@/lib/google";
import { ensureRunnerFile } from "@/lib/marketingData";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/marketing?${q}`, req.url));
  const s = await getSession();
  if (!s || s.role !== "owner") return back("error=sign_in_first");
  const state = cookies().get("ldmv_google_state")?.value;
  if (!state || state !== url.searchParams.get("state")) return back("error=bad_state");
  const code = url.searchParams.get("code");
  if (!code) return back(`error=${encodeURIComponent(url.searchParams.get("error") || "no_code")}`);
  try {
    await googleExchange(code, url.origin);
    await ensureRunnerFile(true).catch(() => {});
  } catch (e: any) {
    return back(`error=${encodeURIComponent(e.message)}`);
  }
  return back("google=1");
}
