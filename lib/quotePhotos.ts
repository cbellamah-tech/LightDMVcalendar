// Mockup photos on past quotes' line items, read through the app's Jobber connection when a trainee opens them,
// then copied into our own photo storage so they keep working after Jobber's links expire.
import { gql } from "./jobber";
import { buildSelection, rows, Spec } from "./jobberSchema";
import { filesOf, LINE } from "./jobDetails";
import { savePhoto } from "./photos";
import { kvGet, kvSet } from "./store";

type QuoteImages = { at: number; lines: { name: string; images: { name: string; url: string }[] }[]; error?: string };
const SPEC: Spec = { id: true, quoteNumber: true, lineItems: { first: 50, sel: { nodes: { sel: LINE } } } };
const LIST_KEY = (id: string) => `ldmv:quoteimgs:${id}`;
const COPY_KEY = (id: string, line: number, k: number) => `ldmv:quoteimg:${id}:${line}:${k}`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

let sel: string | null = null;
async function fetchImages(quoteId: string): Promise<QuoteImages> {
  sel ??= await buildSelection(gql, "Quote", SPEC);
  if (!sel.includes("lineItems")) return { at: Date.now(), lines: [], error: "Jobber's API doesn't list quote line items here" };
  const d = await gql<{ quote: any }>(`query LdmvQuoteImgs($id: EncodedId!) { quote(id: $id) ${sel} }`, { id: quoteId });
  const lines = rows(d.quote?.lineItems).map((li: any) => ({
    name: String(li.name || ""),
    images: [...filesOf(li), ...(li.imageUrl ? [{ name: li.name, url: li.imageUrl, image: true }] : [])].filter((f) => f.image).map((f) => ({ name: f.name, url: f.url })),
  }));
  return { at: Date.now(), lines };
}

/** The Jobber line item images for one quote (cached half a day; Jobber's file links are short-lived). */
export async function quoteImages(quoteId: string, fresh = false): Promise<QuoteImages> {
  const cached = await kvGet<QuoteImages>(LIST_KEY(quoteId));
  if (cached && !fresh && Date.now() - cached.at < 12 * 3600_000) return cached;
  let r: QuoteImages;
  try { r = await fetchImages(quoteId); } catch (e: any) { r = { at: Date.now(), lines: [], error: e.message }; }
  await kvSet(LIST_KEY(quoteId), r);
  return r;
}

/** How many mockups each named line has on that quote. */
export async function imageCounts(quoteId: string, names: string[]) {
  const q = await quoteImages(quoteId);
  return { counts: names.map((n) => q.lines.find((l) => norm(l.name) === norm(n))?.images.length ?? 0), error: q.error ?? null };
}

/** A stored copy of one mockup, copying it from Jobber the first time. Returns a URL or null. */
export async function mockupUrl(quoteId: string, lineIndex: number, lineName: string, k: number): Promise<string | null> {
  const key = COPY_KEY(quoteId, lineIndex, k);
  const have = await kvGet<string>(key);
  if (have) return have;
  for (const fresh of [false, true]) {
    const q = await quoteImages(quoteId, fresh);
    const line = q.lines.find((l) => norm(l.name) === norm(lineName));
    const img = line?.images[k];
    if (!img) return null;
    const res = await fetch(img.url).catch(() => null);
    if (!res?.ok) continue; // link expired: ask Jobber again
    const type = res.headers.get("content-type") || "image/jpeg";
    const file = new File([await res.arrayBuffer()], img.name || "mockup.jpg", { type });
    const url = await savePhoto(file, `training/${quoteId.slice(-12)}`);
    await kvSet(key, url);
    return url;
  }
  return null;
}
