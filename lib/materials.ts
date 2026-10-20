/* What the crew needs to load for a job, worked out from its Jobber line items (name, description, quantity).
   Amounts come from what the line says (counts, sizes, feet) or, when it doesn't say, from the line's price and
   our quoting rates. Prices never leave the server: only the material amounts do. */

export type BringHow = "set" | "about" | "rough" | "check";
export type BringItem = { key: string; label: string; qty?: number; unit?: string; how: BringHow; note?: string };
export type Bring = { items: BringItem[]; notes: string[] };
export type BringLine = { name: string; description?: string; quantity?: number; price?: number };

/** Our quoting rates: per foot of C9 and of stakes, per mini strand, per pillar, per wreath size, and a typical
    price for each part (to split a line that covers several). They are company prices, so they are never in
    this repo: the server reads them from a sheet (lib/bringRates.ts). Without them only the counts, feet and sizes
    the quote writes out are shown. */
export type Rates = { c9Foot: number; stakeFoot: number; miniStrand: number; pillar: number; wreath: Record<string, number>; typical: Partial<Record<Part, number>> };
const MINI_FEET = 33; // one strand: 100 lights, 33 ft

export type Part = "roofline" | "windows" | "stakes" | "tree" | "bushes" | "railing" | "pillars" | "garland" | "wreath";
const PART_RE: [Part, RegExp][] = [
  ["roofline", /\b(?:roof\s*-?\s*lines?|roof|ridges?|dormers?|gables?|peaks?|eaves|gutter line)\b/i],
  ["windows", /\b(?:windows?|door\s*(?:way|frame)s?|doorways?|garage outline|outline the garage)\b/i],
  ["stakes", /\b(?:stakes?|pathway|walkway|driveway lights?)\b/i],
  ["tree", /\btrees?\b/i],
  ["bushes", /\b(?:bush(?:es)?|shrubs?|hedges?)\b/i],
  ["railing", /\b(?:railings?|hand\s*rails?|banisters?|fenc(?:e|es|ing))\b/i],
  ["pillars", /\b(?:pillars?|columns?|posts)\b/i],
  ["garland", /\bgarland\b/i],
  ["wreath", /\bwreaths?\b/i],
];
// Lines that are paperwork or included service, not something to install.
const NOT_WORK = /^(?:note|design photo|full design photo|takedown.*included|all included|always included|connect everything|we will connect|.*discount|gutter cleaning|takedown(?: only)?)\b/i;
const CUSTOMER_OWNED = /re-?installation|customer-owned|your own lights|you need to provide/i;
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, single: 1, both: 2, pair: 2 };

/** Line text without emoji and the quote's "Optional | Click photo" prompts. */
const clean = (s: string) => s
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
  .replace(/\|?\s*(?:optional|click (?:the )?(?:check ?box|photo|line item photo)[^|]*|\(click[^)]*\))\s*/gi, " | ")
  .replace(/\s+/g, " ").trim();

/** The bits of a line that talk about one part (title pieces and description sentences). */
const pieces = (s: string) => s.split(/\s*(?:\n|\||;|(?<=[.!?])\s+)\s*/).map((x) => x.trim()).filter(Boolean);

const num = (w?: string) => (w ? (/^\d+$/.test(w) ? Number(w) : WORDS[w.toLowerCase()]) : undefined);
/** "2 trees", "two front pillars", "5 front columns", "2- 36” wreaths". */
function countIn(text: string, re: RegExp): number | undefined {
  const m = text.match(new RegExp(String.raw`\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|both|pair of)(?!\d|\s*(?:["”″'%]|-?\s*inch|-?\s*in\b|ft\b|feet|foot|-\s*\d))\s*-?\s*(?:x\s*)?(?:[\w"”'″]+\s+){0,3}?(?:${re.source})`, "i"));
  return num(m?.[1]?.replace(/ of$/i, ""));
}
/** Feet the quote writes for this part ("approx 810 feet of mini lights"), never a height ("up about 20 ft"). */
function feetIn(text: string): number | undefined {
  for (const m of text.matchAll(/\b(\d{1,2},\d{3}|\d{2,4})\s*(?:linear\s*)?(?:ft|feet|foot)\b/gi)) {
    const n = Number(m[1].replace(",", ""));
    const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index).toLowerCase();
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 12).toLowerCase();
    if (n < 30 || /\b(up|high|tall|height|bigger|to)\b/.test(before) || /^\s*(tall|high|and up|up)\b/.test(after)) continue;
    return n;
  }
  return undefined;
}

type Light = "c9" | "c7" | "mini" | "icicle";
/** The light the words name, if they name one. */
function namedLight(text: string): Light | undefined {
  if (/icicle/i.test(text)) return "icicle";
  if (/\bc-?7\b/i.test(text)) return "c7";
  if (/\bc-?9\b/i.test(text)) return "c9";
  if (/\bmini|5\s?mm|led string/i.test(text)) return "mini";
  return undefined;
}
const lightFor = (body: string, title: string, part: Part): Light =>
  namedLight(body) ?? namedLight(title) ?? (part === "roofline" || part === "windows" || part === "stakes" ? "c9" : "mini");
function colorFor(text: string): string {
  if (/multi\s*-?\s*colou?r|r\s*,\s*g\s*,\s*b/i.test(text)) return "multicolor";
  if (/candy\s*cane|red\s*(?:&|and)\s*(?:warm\s*)?white/i.test(text)) return "red and white";
  if (/\b(?:cool|pure|bright)\s*white\b/i.test(text)) return "cool white";
  return "warm white";
}
const wireFor = (text: string) => (/white wire/i.test(text) ? "white wire" : /brown wire/i.test(text) ? "brown wire" : "green wire");

type Found = { part: Part; text: string; light: Light; count?: number; feet?: number; sizes: { size?: number; count: number }[] };

/** Title pieces: "Roofline, Pillars & 2 Wreaths" is three. Where a wreath or stake goes ("on the window",
    "around the tree") is a place, not another part. */
const titlePieces = (name: string) => pieces(clean(name)).flatMap((p) => p.split(/\s*(?:,|&|\+|\/|\band\b|\bwith\b)\s*/i))
  .map((p) => (/wreath|stake|garland/i.test(p) ? p.replace(/\b(?:around|on|above|over|by|under|in)\s+(?:the\s+|your\s+|a\s+)?(?:front\s+)?\w+/gi, "") : p))
  .map((p) => p.trim()).filter(Boolean);

/** The parts one line covers, each with the words that describe it. Parts come from the title; the description
    is read only when the title names none ("Full Design", "Design Photo"). */
function partsOf(name: string, desc: string, quantity: number): Found[] {
  const title = titlePieces(name);
  const body = pieces(clean(desc)).filter((p) => !/pairs? perfectly|perfectly pairs/i.test(p));
  const inTitle = PART_RE.filter(([, re]) => title.some((t) => re.test(t))).map(([p]) => p);
  const parts = inTitle.length ? inTitle : PART_RE.filter(([, re]) => body.some((t) => re.test(t))).map(([p]) => p);
  return parts.map((part) => {
    const re = PART_RE.find(([p]) => p === part)![1];
    const t = title.filter((x) => re.test(x)).join(" ");
    // Description sentences about this part; a line about one part also owns the sentences that name no part.
    const b = body.filter((x) => re.test(x) || (parts.length === 1 && !PART_RE.some(([, r]) => r.test(x)))).join(" ");
    const text = `${t} ${b}`.trim();
    const one = parts.length === 1;
    let count = countIn(text, re);
    if (count == null && one && quantity > 1) count = quantity;
    const f: Found = { part, text, light: lightFor(b, t, part), count, feet: feetIn(b), sizes: [] };
    if (part === "wreath") {
      const sizes = [...text.matchAll(/(?:\b(\d{1,2}|one|two|three|four|five|six)\s*-?\s*)?\b(\d{2})\s*(?:["”″]|''|-?\s*inch(?:es)?\b|-?\s*in\b)/gi)]
        .map((m) => ({ size: Number(m[2]), count: num(m[1]) ?? 0 })).filter((s) => s.size >= 18 && s.size <= 72);
      const uniq = sizes.filter((s, i) => sizes.findIndex((x) => x.size === s.size) === i);
      const n = count ?? (one ? quantity : 1);
      f.sizes = uniq.length ? uniq.map((s) => ({ size: s.size, count: s.count || (uniq.length === 1 ? n : 1) })) : [{ count: n }];
    }
    return f;
  });
}

const up5 = (n: number) => Math.max(5, Math.ceil(n / 5) * 5);

/** Materials for one line item. */
function lineBring(l: BringLine, rates?: Rates): BringItem[] {
  const name = l.name || "";
  const desc = l.description || "";
  if (NOT_WORK.test(clean(name)) && !desc.trim()) return [];
  if (NOT_WORK.test(clean(name)) && !PART_RE.some(([, re]) => re.test(clean(name)))) return [];
  const all = `${name} ${desc}`;
  const quantity = l.quantity && l.quantity > 0 ? l.quantity : 1;
  const found = partsOf(name, desc, quantity);
  if (CUSTOMER_OWNED.test(all) && /re-?installation|customer-owned/i.test(all)) {
    return [{ key: "own", label: "Customer's own lights (in their bin or garage)", how: "check", note: "check the quote and last year's photos" }];
  }
  if (!found.length) return [];

  // Money left for parts with no count or feet in the text, after the wreaths and counted pillars.
  let left = rates && l.price && l.price > 0 ? l.price : 0;
  for (const f of found) {
    if (f.part === "wreath") for (const s of f.sizes) left -= (s.size ? rates?.wreath[s.size] ?? 0 : 0) * s.count;
    if (f.part === "pillars" && f.count && !f.feet) left -= f.count * (rates?.pillar ?? 0);
  }
  const open = found.filter((f) => f.part !== "wreath" && !(f.part === "pillars" && f.count) && !f.feet);
  const typical = (p: Part) => rates?.typical[p] ?? 0;
  const weight = open.reduce((t, f) => t + typical(f.part), 0);
  const how: BringHow = open.length <= 1 ? "about" : "rough";
  const share = (f: Found) => (rates && left > 0 && weight > 0 ? (left * typical(f.part)) / weight : 0);

  const out: BringItem[] = [];
  for (const f of found) {
    const light = f.light;
    const color = colorFor(f.text);
    if (f.part === "wreath") {
      for (const s of f.sizes) out.push({ key: `wreath:${s.size ?? "?"}`, label: s.size ? `${s.size}" pre-lit wreath` : "Wreath (size on the quote)", qty: s.count, how: s.size ? "set" : "check" });
      if (/\bbows?\b/i.test(f.text)) out.push({ key: "bow", label: "Red bow", qty: f.sizes.reduce((t, s) => t + s.count, 0), how: "set" });
      continue;
    }
    if (f.part === "garland") {
      const theirs = /you need to provide|your garland|use your|existing garland/i.test(all);
      out.push({ key: theirs ? "garland:own" : "garland", label: theirs ? "Garland: the customer's" : "Pre-lit garland", how: "check", note: "length from the photo" });
      if (theirs || /mini/i.test(f.text)) out.push({ key: `mini:${color}:${wireFor(f.text)}`, label: `Mini lights, ${color}, ${wireFor(f.text)}`, unit: "strands", how: "check", note: "for the garland" });
      continue;
    }
    if (light === "icicle") { out.push({ key: `icicle:${color}`, label: `Icicle lights, ${color}`, how: "check", note: "strands from the photo" }); continue; }

    if (light === "mini") {
      const wire = wireFor(f.text);
      let strands: number | undefined;
      let h: BringHow = how;
      if (f.feet) { strands = Math.ceil(f.feet / MINI_FEET); h = "set"; }
      else if (f.part === "pillars" && f.count) { strands = f.count * 2; h = "about"; }
      else if (share(f) && rates!.miniStrand) strands = Math.max(1, Math.round(share(f) / rates!.miniStrand));
      out.push({ key: `mini:${color}:${wire}`, label: `Mini lights, ${color}, ${wire}`, qty: strands, unit: "strands", how: strands ? h : "check",
        note: strands ? undefined : f.part === "pillars" ? "2 strands per 9-10 ft pillar" : "count from the photo" });
      continue;
    }
    // C9 or C7 on a stringer: roofline, windows, stakes, or a C7 tree.
    const perFoot = f.part === "stakes" ? rates?.stakeFoot : rates?.c9Foot;
    const ft = f.feet ?? (share(f) && perFoot ? up5(share(f) / perFoot) : undefined);
    const h: BringHow = f.feet ? "set" : ft ? how : "check";
    const bulb = light === "c7" ? "C7" : "C9";
    const amount = ft;
    // C7 tree wraps have no rate of their own: the roofline rate gives a rough figure.
    const hh: BringHow = !amount ? "check" : light === "c7" && f.part === "tree" && !f.feet ? "rough" : h;
    out.push({ key: `${light}:stringer`, label: `${bulb} stringer`, qty: amount, unit: "ft", how: hh, note: amount ? undefined : "feet from the photo" });
    out.push({ key: `${light}:bulb:${color}`, label: `${bulb} bulbs, ${color}`, qty: amount, how: hh });
    if (f.part === "stakes") out.push({ key: "stake", label: "Ground stakes", qty: amount, how: hh });
    else if (f.part === "windows") out.push({ key: "staples", label: "Staples (windows and doors)", how: "set" });
    else if (f.part === "roofline") out.push({ key: "clip", label: "Clips", qty: amount, how: hh });
  }
  return out;
}

/** Same material on several lines (or jobs) becomes one row; "about" and "check" carry over. */
export function mergeBring(lists: BringItem[][]): BringItem[] {
  const rank: Record<BringHow, number> = { set: 0, about: 1, rough: 2, check: 3 };
  const by = new Map<string, BringItem & { checks: number }>();
  for (const it of lists.flat()) {
    const had = by.get(it.key);
    if (!had) { by.set(it.key, { ...it, checks: it.qty == null ? 1 : 0 }); continue; }
    if (it.qty != null) had.qty = (had.qty ?? 0) + it.qty;
    else had.checks++;
    const worse = rank[it.how] > rank[had.how] && it.qty != null ? it.how : had.how;
    had.how = had.qty != null && worse === "check" ? "rough" : worse;
    if (it.note && had.note !== it.note && had.qty == null) had.note = it.note;
  }
  return [...by.values()].map(({ checks, ...it }) => {
    if (it.qty != null && checks) return { ...it, note: `plus ${checks} more to count from the photo${checks > 1 ? "s" : ""}` };
    if (it.qty != null) it.how = it.how === "check" ? "rough" : it.how;
    return it;
  }).sort((a, b) => ORDER.indexOf(a.key.split(":")[0]) - ORDER.indexOf(b.key.split(":")[0]));
}
const ORDER = ["c9", "c7", "clip", "stake", "staples", "mini", "icicle", "wreath", "bow", "garland", "own", "timer", "cord"];

/** Everything to load for one install job. */
export function bringFor(lines: BringLine[], rates?: Rates): Bring {
  const items = mergeBring(lines.map((l) => lineBring(l, rates)));
  if (!items.length) return { items: [], notes: [] };
  const lit = items.some((i) => /^(c9|c7|mini|icicle|wreath|garland|own)/.test(i.key));
  if (lit) items.push({ key: "timer", label: "Timer", qty: 1, how: "set" }, { key: "cord", label: "Extension cords (and a GFCI cord)", how: "check", note: "for the run to the outlet" });
  return { items, notes: [] };
}

/** "about 120 ft", "12 strands", "2", "check" */
export function bringAmount(i: BringItem): string {
  if (i.qty == null) return i.note ? i.note : "check the quote";
  const n = `${i.qty}${i.unit ? ` ${i.unit === "strands" && i.qty === 1 ? "strand" : i.unit}` : ""}`;
  return i.how === "about" || i.how === "rough" ? `about ${n}` : n;
}
