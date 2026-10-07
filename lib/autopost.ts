import { kvGet, kvSet } from "./store";
import { getMedia, MediaItem, patchMedia, Platform, PLATFORMS } from "./media";
import { expireGhlSnap, getGhlSnap, ghlConfigured, ghlPostNow } from "./ghl";

/* Posting a media item through GoHighLevel, by hand (Post now) or on its own (Auto-post on). */

export async function postMedia(m: MediaItem, want: Platform[], by: string, captions?: Partial<Record<Platform, string>>) {
  const accounts = (await getGhlSnap())?.accounts ?? [];
  const results: { platform: string; ok: boolean; error?: string }[] = [];
  for (const p of want) {
    const ids = accounts.filter((a) => a.platform.includes(p) && !a.expired).map((a) => a.id);
    const text = String(captions?.[p] ?? m.captions[p] ?? m.captions.facebook ?? m.title).slice(0, 3000);
    try {
      if (!ids.length) throw new Error(`No ${p} account connected in GoHighLevel's Social Planner.`);
      await ghlPostNow(ids, text, [{ url: m.url, type: m.contentType }]);
      results.push({ platform: p, ok: true });
    } catch (e: any) {
      results.push({ platform: p, ok: false, error: e.message });
    }
  }
  const ok = results.filter((r) => r.ok).map((r) => r.platform);
  const errors = results.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error}`).join("; ");
  await patchMedia(m.id, (x) => {
    x.posts = [...(x.posts ?? []), { at: Date.now(), by, platforms: ok, ok: !errors, error: errors || undefined }];
    if (captions) for (const p of want) if (typeof captions[p] === "string") x.captions[p] = captions[p]!.slice(0, 3000);
  });
  // The posts count themselves when the Social Planner list is read next.
  await expireGhlSnap();
  return results;
}

const AUTO = "ldmv:mkt:autopost";
export type AutoPost = { on: boolean; by?: string; at?: number };
export const getAutoPost = async (): Promise<AutoPost> => (await kvGet<AutoPost>(AUTO)) ?? { on: false };
export const setAutoPost = (on: boolean, by: string) => kvSet(AUTO, { on, by, at: Date.now() });

/** With Auto-post on: the newest ready, never-posted, not-hidden item goes to every connected platform. */
export async function autoPostNext() {
  if (!(await getAutoPost()).on || !ghlConfigured()) return null;
  const m = (await getMedia()).filter((x) => x.status === "ready" && !x.skipped && !(x.posts ?? []).length)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!m) return null;
  const accounts = (await getGhlSnap())?.accounts ?? [];
  const want = PLATFORMS.map((p) => p.id).filter((p) => accounts.some((a) => a.platform.includes(p) && !a.expired));
  return want.length ? postMedia(m, want, "Auto-post") : null;
}
