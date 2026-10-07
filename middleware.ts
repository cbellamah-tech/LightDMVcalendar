import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "./lib/session";

// The bot drop box checks its own key; the callbacks check the session themselves.
const PUBLIC = ["/login", "/api/auth/", "/api/jobber/callback", "/api/jobber/cron", "/api/marketing/bot", "/api/marketing/cron", "/api/marketing/runner/", "/api/google/callback", "/manifest.webmanifest", "/icon"];
const OWNER_ONLY = ["/calendar", "/api/board", "/insurance", "/api/insurance", "/people", "/api/people", "/settings", "/api/jobber", "/marketing", "/api/marketing", "/api/google", "/briefing"];

// Owners only, not the manager either.
const STRICT_OWNER = ["/calendar", "/api/board", "/insurance", "/api/insurance", "/costs", "/api/costs"];

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
  // The owners' Briefing and the Google connection stay with owners, managers included.
  if (["/briefing", "/api/google"].some((p) => pathname.startsWith(p)) && s.role !== "owner") {
    if (isApi) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Maria (manager) can see People and Jobber settings too; the owner calendar and insurance stay owners-only.
  const ownerOnly = [...OWNER_ONLY, ...STRICT_OWNER].some((p) => pathname.startsWith(p));
  const officeOk = s.role === "manager" && !STRICT_OWNER.some((p) => pathname.startsWith(p));
  if (ownerOnly && s.role !== "owner" && !officeOk) {
    if (isApi) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|leaflet/).*)"],
};
