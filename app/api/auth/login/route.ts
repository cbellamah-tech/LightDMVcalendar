import { NextResponse } from "next/server";
import { checkPin, hashPin, listUsers, saveUsers, validPin } from "@/lib/users";
import { kvGet, kvSet } from "@/lib/store";
import { COOKIE, cookieOptions, hasSessionSecret, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  try {
    return await login(req);
  } catch (e: any) {
    console.error("login failed", e);
    return NextResponse.json({ error: `Sign-in error: ${e?.message || "unknown"}` }, { status: 500 });
  }
}

async function login(req: Request) {
  const { userId, pin, setupCode } = await req.json().catch(() => ({}));
  const users = await listUsers();
  const user = users.find((u) => u.id === userId && u.active);
  if (!user || !validPin(pin)) return NextResponse.json({ error: "Pick your name and enter a 4 to 8 digit PIN." }, { status: 400 });

  const lockKey = `ldmv:loginfail:${user.id}`;
  const fails = (await kvGet<{ n: number; at: number }>(lockKey)) ?? { n: 0, at: 0 };
  if (fails.n >= MAX_FAILS && Date.now() - fails.at < LOCK_MS) {
    return NextResponse.json({ error: "Too many wrong PINs. Try again in 10 minutes." }, { status: 429 });
  }

  if (!user.pinHash) {
    // First sign-in. Owners set their own PIN with the setup code from Vercel; everyone else gets a PIN from an owner.
    const code = process.env.OWNER_SETUP_CODE?.trim();
    if (user.role !== "owner") return NextResponse.json({ error: "Ask Chris or Liam to set your PIN on the People page." }, { status: 403 });
    if (!code) return NextResponse.json({ error: `This ${process.env.VERCEL_ENV || "local"} deployment can't see OWNER_SETUP_CODE. In Vercel, make sure it's checked for this environment, then redeploy.`, needSetup: true }, { status: 403 });
    if (typeof setupCode !== "string" || !setupCode.trim()) return NextResponse.json({ error: "Enter the owner setup code to create your PIN.", needSetup: true }, { status: 403 });
    if (setupCode.trim() !== code) return NextResponse.json({ error: "That setup code doesn't match the one in Vercel (it's case-sensitive).", needSetup: true }, { status: 403 });
    if (!hasSessionSecret()) return NextResponse.json({ error: "Setup code is right, but this deployment has no database connected (Upstash Redis). Connect it for this environment in Vercel and redeploy." }, { status: 500 });
    user.pinHash = hashPin(pin);
    await saveUsers(users);
  } else if (!checkPin(pin, user.pinHash)) {
    await kvSet(lockKey, { n: fails.n + 1, at: Date.now() });
    return NextResponse.json({ error: "Wrong PIN." }, { status: 401 });
  }

  await kvSet(lockKey, { n: 0, at: 0 });
  const token = await signSession({ uid: user.id, name: user.name, role: user.role, crew: user.crew });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, cookieOptions);
  return res;
}
