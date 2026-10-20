import { kvGet, kvSet } from "./store";
import { gapi, googleStatus } from "./google";
import type { Part, Rates } from "./materials";

/* The quoting rates that turn a line's price into feet and strands for "What to bring". They are company
   prices, so they live in the "Light DMV install rates" sheet in the company Drive, never here: one row per
   rate, column A the name below, column B the dollars. */

export const RATES_SHEET_TITLE = "Light DMV install rates";
const CACHE = "ldmv:bringrates";
type Cached = { at: number; rates?: Rates; error?: string };

const ROWS: Record<string, (r: Rates, v: number) => void> = {
  "c9 roofline per foot": (r, v) => { r.c9Foot = v; },
  "stakes per foot": (r, v) => { r.stakeFoot = v; },
  "mini strand": (r, v) => { r.miniStrand = v; },
  "pillar": (r, v) => { r.pillar = v; },
};
const PARTS: Part[] = ["roofline", "windows", "stakes", "tree", "bushes", "railing", "pillars", "garland"];

async function readRates(): Promise<Cached> {
  const q = encodeURIComponent(`name = '${RATES_SHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
  const found = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`);
  const id: string | undefined = found.files?.[0]?.id;
  if (!id) return { at: Date.now() };
  const v = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:B60?valueRenderOption=UNFORMATTED_VALUE`);
  const r: Rates = { c9Foot: 0, stakeFoot: 0, miniStrand: 0, pillar: 0, wreath: {}, typical: {} };
  for (const [a, b] of (v.values ?? []) as unknown[][]) {
    const name = String(a ?? "").trim().toLowerCase();
    const n = Number(String(b ?? "").replace(/[$,\s]/g, ""));
    if (!name || !(n > 0)) continue;
    const wreath = name.match(/^(\d{2})\s*(?:"|in|inch)?\s*wreath/);
    const typical = name.match(/^typical (\w+)/);
    if (ROWS[name]) ROWS[name](r, n);
    else if (wreath) r.wreath[wreath[1]] = n;
    else if (typical && PARTS.includes(typical[1] as Part)) r.typical[typical[1] as Part] = n;
  }
  return { at: Date.now(), rates: r.c9Foot > 0 ? r : undefined };
}

/** The rates, re-read from the sheet at most every 6 hours. None when Google isn't connected or the sheet is missing. */
export async function getBringRates(): Promise<Rates | undefined> {
  const cur = await kvGet<Cached>(CACHE);
  if (cur && Date.now() - cur.at < 6 * 3600_000) return cur.rates;
  try {
    if (!(await googleStatus()).connected) return cur?.rates;
    const next = await readRates();
    await kvSet(CACHE, next);
    return next.rates;
  } catch (e: any) {
    await kvSet(CACHE, { at: Date.now() - 5 * 3600_000, rates: cur?.rates, error: e.message }); // try again in an hour
    return cur?.rates;
  }
}
