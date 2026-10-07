import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "./lib/session";

// The bot drop box checks its own key; the callbacks check the session themselves.
const PUBLIC = ["/login", "/api/auth/", "/api/jobber/callback", "/api/jobber/cron", "/api/marketing/bot", "/api/marketing/cron", "/api/google/callback", "/manifest.webmanifest", "/icon"];
const OWNER_ONLY = ["/calendar", "/api/board", "/people", "/api/people", "/settings", "/api/jobber", "/marketing", "/api/marketing", "/api/google", "/briefing"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  // Connect Jobber is opened as a page (and may hop to the branch URL), so send it to sign-in like a page.
  const isApi = pathname.startsWith("/api/") && pathname !== "/api/jobber/connect" && pathname !== "/api/google/connect";
  if (!s) {
    if (isApi) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Maria (manager) can see People, Jobber settings and Marketing too; the owner calendar and Briefing stay owners-only.
  const ownerOnly = OWNER_ONLY.some((p) => pathname.startsWith(p));
  const officeOk = s.role === "manager" && !["/calendar", "/api/board", "/briefing", "/api/google"].some((p) => pathname.startsWith(p));
  if (ownerOnly && s.role !== "owner" && !officeOk) {
    if (isApi) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|leaflet/).*)"],
};
