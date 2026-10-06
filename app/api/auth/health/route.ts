import { NextResponse } from "next/server";
import { storeKind, usingRedis } from "@/lib/store";
import { photoStore } from "@/lib/photos";
import { hasSessionSecret } from "@/lib/session";

export const dynamic = "force-dynamic";

// Which settings this deployment can see (yes/no only, never the values). Shown on the sign-in page.
export async function GET() {
  return NextResponse.json({
    env: process.env.VERCEL_ENV || "local",
    setupCode: !!process.env.OWNER_SETUP_CODE?.trim(),
    authSecret: hasSessionSecret(),
    database: usingRedis,
    photos: photoStore() !== "memory",
    store: storeKind,
  });
}
