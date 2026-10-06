import { NextResponse } from "next/server";
import { usingRedis } from "@/lib/store";

export const dynamic = "force-dynamic";

// Which settings this deployment can see (yes/no only, never the values). Shown on the sign-in page.
export async function GET() {
  return NextResponse.json({
    env: process.env.VERCEL_ENV || "local",
    setupCode: !!process.env.OWNER_SETUP_CODE?.trim(),
    authSecret: !!process.env.AUTH_SECRET?.trim(),
    database: usingRedis,
    photos: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}
