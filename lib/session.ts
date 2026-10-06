/* Signed session cookie. Uses Web Crypto so it works in middleware (edge) and route handlers. */

export type Role = "owner" | "manager" | "lead" | "crew";
export type Session = { uid: string; name: string; role: Role; crew?: string; exp: number };

export const COOKIE = "ldmv_session";
const MAX_AGE_S = 60 * 60 * 24 * 60; // 60 days, crews stay signed in on their phones

function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  // Previews share the production database, so every Vercel deploy needs a real secret.
  if (process.env.VERCEL) {
    throw new Error("AUTH_SECRET is not set");
  }
  return "dev-only-secret-change-me";
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...s, exp: Date.now() + MAX_AGE_S * 1000 })));
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_S,
};

export const isOwner = (s: Session | null) => s?.role === "owner";
export const isOffice = (s: Session | null) => s?.role === "owner" || s?.role === "manager";
