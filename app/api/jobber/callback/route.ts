import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { exchangeCode, syncJobber } from "@/lib/jobber";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/jobber?${q}`, req.url));
  const s = await getSession();
  if (!s || (s.role !== "owner" && s.role !== "manager")) return back("error=sign_in_first");
  const state = cookies().get("ldmv_jobber_state")?.value;
  if (!state || state !== url.searchParams.get("state")) return back("error=bad_state");
  const code = url.searchParams.get("code");
  if (!code) return back(`error=${encodeURIComponent(url.searchParams.get("error") || "no_code")}`);
  try {
    await exchangeCode(code, url.origin);
  } catch (e: any) {
    return back(`error=${encodeURIComponent(e.message)}`);
  }
  await syncJobber().catch(() => {});
  return back("connected=1");
}
