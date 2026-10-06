import { Redis } from "@upstash/redis";

/* Tiny key-value layer. Uses the same Upstash Redis the calendar already uses;
   falls back to process memory so the app runs locally before Redis is connected. */

const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = hasRedis ? Redis.fromEnv() : null;

const g = globalThis as unknown as { __ldmvMem?: Map<string, unknown> };
const mem = (g.__ldmvMem ??= new Map<string, unknown>());

export const usingRedis = hasRedis;

export async function kvGet<T>(key: string): Promise<T | null> {
  if (redis) return ((await redis.get<T>(key)) ?? null) as T | null;
  return (mem.has(key) ? structuredClone(mem.get(key)) : null) as T | null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (redis) {
    await redis.set(key, value);
    return;
  }
  mem.set(key, structuredClone(value));
}

export async function kvDel(key: string): Promise<void> {
  if (redis) {
    await redis.del(key);
    return;
  }
  mem.delete(key);
}

/** Read-modify-write helper. Last write wins, same as the calendar board. */
export async function kvUpdate<T>(key: string, fallback: T, fn: (cur: T) => T | void): Promise<T> {
  const cur = (await kvGet<T>(key)) ?? fallback;
  const next = (fn(cur) ?? cur) as T;
  await kvSet(key, next);
  return next;
}
