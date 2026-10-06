import { Redis } from "@upstash/redis";
import postgres from "postgres";
import { envAny } from "./env";

/* Tiny key-value layer shared by the whole app (and the calendar board).
   1. Supabase / Postgres when Vercel's Supabase integration is connected (POSTGRES_URL).
      The table is created automatically on first use; nothing to run by hand.
   2. Upstash Redis if that's connected instead.
   3. Process memory, so the app still runs locally with nothing connected. */

const pgUrl = envAny("POSTGRES_URL", "DATABASE_URL", "SUPABASE_DB_URL");

// Vercel's Upstash integration may name these UPSTASH_REDIS_REST_* or KV_REST_API_*; Redis.fromEnv() reads both.
const hasRedis =
  (!!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN) ||
  (!!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN);

const g = globalThis as unknown as {
  __ldmvMem?: Map<string, unknown>;
  __ldmvSql?: ReturnType<typeof postgres>;
  __ldmvReady?: Promise<unknown>;
};
const mem = (g.__ldmvMem ??= new Map<string, unknown>());

// prepare:false so it works through Supabase's connection pooler.
const sql = pgUrl ? (g.__ldmvSql ??= postgres(pgUrl, { prepare: false, max: 3, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(pgUrl) ? false : "require", idle_timeout: 20 })) : null;
const redis = !sql && hasRedis ? Redis.fromEnv() : null;

function ready() {
  if (!sql) return Promise.resolve();
  return (g.__ldmvReady ??= sql`
    create table if not exists ldmv_kv (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )`.catch((e) => { g.__ldmvReady = undefined; throw e; }));
}

export const storeKind: "supabase" | "redis" | "memory" = sql ? "supabase" : redis ? "redis" : "memory";
export const usingRedis = storeKind !== "memory"; // "has a real database"

export async function kvGet<T>(key: string): Promise<T | null> {
  if (sql) {
    await ready();
    const rows = await sql`select value from ldmv_kv where key = ${key}`;
    return rows.length ? (rows[0].value as T) : null;
  }
  if (redis) return ((await redis.get<T>(key)) ?? null) as T | null;
  return (mem.has(key) ? structuredClone(mem.get(key)) : null) as T | null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (sql) {
    await ready();
    const v = sql.json(value as any);
    await sql`insert into ldmv_kv (key, value, updated_at) values (${key}, ${v}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
    return;
  }
  if (redis) {
    await redis.set(key, value);
    return;
  }
  mem.set(key, structuredClone(value));
}

export async function kvDel(key: string): Promise<void> {
  if (sql) {
    await ready();
    await sql`delete from ldmv_kv where key = ${key}`;
    return;
  }
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
