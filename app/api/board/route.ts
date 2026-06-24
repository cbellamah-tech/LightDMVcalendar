import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const KEY = "ldmv-ops-board-v1";
const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis ? Redis.fromEnv() : null;

// In-memory fallback so the app still runs locally before Redis is connected.
let memory: any = { tasks: null, done: {} };

export async function GET() {
  try {
    if (redis) {
      const data = await redis.get(KEY);
      return NextResponse.json(data ?? { tasks: null, done: {} });
    }
    return NextResponse.json(memory);
  } catch (e) {
    console.error("GET /api/board failed", e);
    return NextResponse.json({ tasks: null, done: {}, error: true });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = { tasks: body.tasks ?? null, done: body.done ?? {} };
    if (redis) {
      await redis.set(KEY, payload);
    } else {
      memory = payload;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/board failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
