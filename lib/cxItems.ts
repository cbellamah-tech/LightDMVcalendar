import type { CxLine } from "./cxJobber";

/* Plain tags for what a customer had, read from their Jobber line items: the colors, wreath sizes, trees and so on. */

const COLORS: [RegExp, string][] = [
  [/warm[\s-]*white|\bww\b/i, "Warm white"],
  [/(cool|pure|bright|cold|true)[\s-]*white|\bcw\b/i, "Cool white"],
  [/multi[\s-]*colou?r|\bmulti\b|\brgb\b/i, "Multicolor"],
  [/red\s*(and|&|\/|-)\s*white|candy\s*cane/i, "Red and white"],
  [/red\s*(and|&|\/|-)\s*green/i, "Red and green"],
  [/\bred\b/i, "Red"], [/\bgreen\b/i, "Green"], [/\bblue\b/i, "Blue"], [/\bpurple\b/i, "Purple"], [/\borange\b/i, "Orange"], [/\bgold\b/i, "Gold"],
];

const ITEMS: [RegExp, string][] = [
  [/roof\s*line|roofline|gutter|eave|\bridge|peaks?\b/i, "Roofline"],
  [/wreath/i, "Wreath"], [/garland/i, "Garland"], [/\bbows?\b/i, "Bows"],
  [/\btrees?\b|trunk|canopy|crepe|evergreen/i, "Trees"], [/bush|shrub|hedge|boxwood/i, "Bushes"],
  [/pillar|column|post\b/i, "Pillars"], [/stake|pathway|walkway|driveway/i, "Pathway stakes"], [/railing|banister|fence/i, "Railings"],
  [/window/i, "Windows"], [/icicle/i, "Icicles"], [/arch(way)?\b/i, "Arch"], [/permanent/i, "Permanent lights"], [/timer/i, "Timer"],
];

/** Lines that are paperwork, not lights. */
export const isAdminLine = (l: CxLine) => /deposit|discount|tax|credit|fee\b|agreement|terms/i.test(l.name) && !/wreath|garland|tree|roof|light/i.test(l.name);

const SIZE = /(\d{2,3})\s*(?:"|''|”|″|-?\s*in(?:ch(?:es)?)?\b)/i;

/** "Warm white", "Roofline", "Wreath 36 in ×2", "Trees ×3"... in a steady order. */
export function lineTags(lines: CxLine[]): string[] {
  const colors = new Set<string>();
  const items = new Map<string, number>();
  for (const l of lines) {
    if (isAdminLine(l)) continue;
    const text = `${l.name} ${l.description ?? ""}`;
    for (const [re, c] of COLORS) if (re.test(text)) { colors.add(c); if (/and/.test(c)) break; }
    const qty = l.qty && l.qty > 0 && l.qty < 50 ? Math.round(l.qty) : 1;
    // What the line is: from its name, else from its description.
    const item = (ITEMS.find(([re]) => re.test(l.name)) ?? ITEMS.find(([re]) => re.test(l.description ?? "")))?.[1];
    if (item) {
      const size = item === "Wreath" ? text.match(SIZE)?.[1] : undefined;
      const label = size ? `Wreath ${size} in` : item;
      items.set(label, (items.get(label) ?? 0) + (item === "Roofline" ? 1 : qty));
    }
  }
  // "Red" next to "Red and white" says nothing new.
  for (const c of [...colors]) if (c.includes(" and ")) for (const part of c.split(" and ")) colors.delete(part[0].toUpperCase() + part.slice(1));
  const out = [...colors];
  for (const [label, n] of items) out.push(label === "Roofline" || n <= 1 ? label : `${label} ×${n}`);
  return out;
}
