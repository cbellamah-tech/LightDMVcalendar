// The Light Design Hero design for each line of the training pack's past quotes, so the Photo library can show a
// line's own picture instead of the whole finished house. The designs come from the Drive sync's library (lib/mockups.ts),
// which is keyed by customer; the pack carries no names, so each quote's customer is read once from Jobber and kept
// server side. Names never leave the server.
import { gql } from "./jobber";
import { loadLibrary, mockupsFor, wantsPhoto } from "./mockups";
import { kvGetMany, kvSet } from "./store";
import type { Pack } from "./training";

const NAME_KEY = (id: string) => `ldmv:pqclient:${id}`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Who = { name: string; lines: { name: string; description?: string }[] };
const Q_FULL = `query LdmvPqClient($id: EncodedId!) { quote(id: $id) { client { name } lineItems(first: 50) { nodes { name description } } } }`;
const Q_NAME = `query LdmvPqClientName($id: EncodedId!) { quote(id: $id) { client { name } } }`;

async function readQuote(quoteId: string): Promise<Who> {
  // The full line list (with the $0 photo lines the pack dropped) decides which line gets Design 1, 2, 3.
  try {
    const d = await gql<{ quote: any }>(Q_FULL, { id: quoteId });
    return { name: d.quote?.client?.name ?? "", lines: (d.quote?.lineItems?.nodes ?? []).map((l: any) => ({ name: String(l.name || ""), description: l.description || "" })) };
  } catch {
    const d = await gql<{ quote: any }>(Q_NAME, { id: quoteId });
    return { name: d.quote?.client?.name ?? "", lines: [] };
  }
}

async function clientNames(pack: Pack): Promise<Record<string, Who>> {
  const ids = pack.quotes.map((q) => q.id);
  const have = await kvGetMany<Who>(ids.map(NAME_KEY));
  const out: Record<string, Who> = {};
  const missing: typeof pack.quotes = [];
  pack.quotes.forEach((q, i) => (have[i] != null ? (out[q.id] = have[i]!) : missing.push(q)));
  // A few at a time, so one page load doesn't flood Jobber; the rest fill in on later loads.
  await Promise.all(missing.slice(0, 15).map(async (q) => {
    try {
      const who = await readQuote(q.quoteId);
      await kvSet(NAME_KEY(q.id), who);
      out[q.id] = who;
    } catch { /* Jobber not connected or busy: no designs for this quote yet */ }
  }));
  return out;
}

/** pack quote id -> line index -> design picture URL, for lines the Drive sync has a design for. */
export async function packDesigns(pack: Pack): Promise<Record<string, Record<number, string>>> {
  const lib = await loadLibrary();
  if (!Object.keys(lib).length) return {};
  const names = await clientNames(pack);
  const out: Record<string, Record<number, string>> = {};
  for (const q of pack.quotes) {
    const who = names[q.id];
    const designs = mockupsFor(lib, who?.name || "").filter((m) => !m.ai);
    if (!designs.length) continue;
    // Design 1, 2, 3 go on the quote's photo lines in quote order, as on the job page, then onto the pack's lines by name.
    const order = (who.lines.length ? who.lines : q.lines.map((l) => ({ name: l.raw || l.name, description: l.desc }))).filter(wantsPhoto);
    const byName = new Map<string, string>();
    order.forEach((l, k) => { if (designs[k] && !byName.has(norm(l.name))) byName.set(norm(l.name), designs[k].url); });
    const map: Record<number, string> = {};
    q.lines.forEach((l, i) => { const u = byName.get(norm(l.raw || l.name)) ?? byName.get(norm(l.name)); if (u) map[i] = u; });
    if (Object.keys(map).length) out[q.id] = map;
  }
  return out;
}
