import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "./lib/session";

const PUBLIC = ["/login", "/api/auth/", "/api/jobber/callback", "/manifest.webmanifest", "/icon"];
const OWNER_ONLY = ["/calendar", "/api/board", "/people", "/api/people", "/settings", "/api/jobber"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");
  if (!s) {
    if (isApi) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Maria (manager) can see People and Jobber settings too; the owner calendar stays owners-only.
  const ownerOnly = OWNER_ONLY.some((p) => pathname.startsWith(p));
  const officeOk = s.role === "manager" && !pathname.startsWith("/calendar") && !pathname.startsWith("/api/board");
  if (ownerOnly && s.role !== "owner" && !officeOk) {
    if (isApi) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|leaflet/).*)"],
};
