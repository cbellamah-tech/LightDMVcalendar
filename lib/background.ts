import { waitUntil } from "@vercel/functions";
import { kvGet, kvSet } from "./store";

/* Slow work (Jobber, GoHighLevel, Gmail, Drive) runs after the page has its answer instead of before.
   On Vercel waitUntil keeps the function alive until it finishes; locally the promise just runs. */
export function later(name: string, work: () => Promise<unknown>) {
  const p = work().catch((e) => console.error(`[later] ${name}:`, e?.message ?? e));
  try { waitUntil(p); } catch { /* not on Vercel */ }
}

/** Run `work` in the background unless another request started the same job in the last `holdMs`. */
export async function laterOnce(name: string, work: () => Promise<unknown>, holdMs = 3 * 60_000) {
  const key = `ldmv:running:${name}`;
  const at = await kvGet<number>(key);
  if (at && Date.now() - at < holdMs) return;
  await kvSet(key, Date.now());
  later(name, async () => {
    try { await work(); } finally { await kvSet(key, 0); }
  });
}
