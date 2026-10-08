import type { GhlLead, GhlOpp } from "./ghl";
import type { AdDay } from "./ads";
import { addDays, etDay } from "./marketing";

/* Organic vs paid, per source, from GoHighLevel's contacts and deals.
   chris's split (2026-10-08): Google Business, the website, phone calls and inbound email are organic;
   Google ads, Meta ads and cold email are paid. Everything else free (yard signs, referrals, listings...) is organic too. */

export type Kind = "organic" | "paid";
export type SourceId =
  | "google_ads" | "google_lsa" | "meta_ads" | "cold_email"
  | "gmb" | "website" | "calls" | "email" | "facebook" | "instagram" | "yard_signs" | "referral" | "returning"
  | "listings" | "direct_mail" | "reengaged" | "other";

export const SOURCES: { id: SourceId; label: string; kind: Kind; spend?: AdDay["source"]; test: RegExp }[] = [
  // Paid first: a click id or "ad"/"cpc" wins over the platform name.
  { id: "google_lsa", label: "Google Local Services", kind: "paid", spend: "lsa", test: /\blsa\b|local service/ },
  { id: "google_ads", label: "Google ads", kind: "paid", spend: "google", test: /gclid|google ?ads|adwords|paid search|\bcpc\b|\bppc\b/ },
  { id: "meta_ads", label: "Meta ads", kind: "paid", spend: "facebook", test: /fbclid|lead ?form|facebook ads?\b|fb ads?\b|meta ads?\b|instagram ads?\b|paid social/ },
  // GoHighLevel's "Cold Leads" pipelines and tags are old leads texted again, not cold email: organic, and checked first.
  { id: "reengaged", label: "Old leads texted again", kind: "organic", test: /cold (permanent |bistro )?(lighting )?leads?|re-?engage|old leads?|first sms|second sms/ },
  { id: "cold_email", label: "Cold email", kind: "paid", test: /cold ?email|cold outreach|smartlead|headline theory|instantly|new lead:/ },
  { id: "gmb", label: "Google Business", kind: "organic", test: /gmb|gbp|google business|google my business|business profile|google maps/ },
  { id: "calls", label: "Phone calls", kind: "organic", test: /call|phone|inbound voice/ },
  { id: "website", label: "Website", kind: "organic", test: /website|web form|form|organic search|lightdmv\.com|chat widget|direct traffic|\bsite\b|google/ },
  { id: "email", label: "Email", kind: "organic", test: /e-?mail|gmail|outlook/ },
  { id: "instagram", label: "Instagram", kind: "organic", test: /instagram|\big\b/ },
  { id: "facebook", label: "Facebook", kind: "organic", test: /facebook|messenger|\bfb\b|meta|social/ },
  { id: "yard_signs", label: "Yard signs", kind: "organic", test: /yard|sign/ },
  { id: "referral", label: "Referrals", kind: "organic", test: /referr|word of mouth|friend/ },
  { id: "returning", label: "Returning customers", kind: "organic", test: /repeat|return|previous|existing customer/ },
  { id: "listings", label: "Craigslist, Marketplace, Nextdoor", kind: "organic", test: /craigslist|marketplace|nextdoor/ },
  { id: "direct_mail", label: "Direct mail", kind: "organic", test: /eddm|direct mail|postcard|door hanger/ },
];
const OTHER = { id: "other" as const, label: "Not tagged", kind: "organic" as Kind };

export function classify(text: string) {
  const t = text.toLowerCase();
  return SOURCES.find((s) => s.test.test(t)) ?? OTHER;
}

const QUOTED = /quote|estimate|proposal|accepted|invoice|job|won|closed|paid/i;
const SOLD = /accepted|invoice|job|won|paid/i;

export type Row = { id: SourceId; label: string; kind: Kind; leads: number; quotes: number; sales: number; revenue: number; spend: number };
export type Attribution = {
  from: string; to: string;
  totals: Record<Kind, Omit<Row, "id" | "label" | "kind">>;
  rows: Row[];
  weeks: { week: string; organic: number; paid: number }[];
  untagged: string[]; // the raw source text of untagged leads, so the rules can be tightened
  items: Item[];       // who's behind each number, for tapping into it
};
export type Item = { type: "lead" | "quote" | "sale"; kind: Kind; source: SourceId; name: string; day: string; value?: number; stage?: string; why: string };

/** Leads by the day they came in; quotes and sales by the day the deal was made, credited to the contact's source. */
export function attribution(leads: GhlLead[], opps: GhlOpp[], ads: AdDay[], days: number, today = etDay(Date.now())): Attribution {
  const from = addDays(today, -(days - 1));
  const inRange = (d?: string) => !!d && d >= from && d <= today;
  const blank = () => ({ leads: 0, quotes: 0, sales: 0, revenue: 0, spend: 0 });
  const rows = new Map<SourceId, Row>();
  const row = (s: { id: SourceId; label: string; kind: Kind }) => {
    if (!rows.has(s.id)) rows.set(s.id, { id: s.id, label: s.label, kind: s.kind, ...blank() });
    return rows.get(s.id)!;
  };
  const text = (l: GhlLead) => [l.source, l.attr, ...l.tags].filter(Boolean).join(" ");
  const byContact = new Map(leads.map((l) => [l.id, classify(text(l))]));
  const untagged = new Map<string, number>();
  const items: Item[] = [];
  const names = new Map(leads.map((l) => [l.id, l.name]));
  const whyOf = new Map(leads.map((l) => [l.id, text(l)]));

  // 12 weeks of leads for the trend, whatever the range.
  const weekStart = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
  const firstWeek = weekStart(addDays(today, -7 * 11));
  const weeks = new Map<string, { week: string; organic: number; paid: number }>();
  for (let i = 0; i < 12; i++) { const w = addDays(firstWeek, 7 * i); weeks.set(w, { week: w, organic: 0, paid: 0 }); }

  for (const l of leads) {
    const s = byContact.get(l.id)!;
    const w = weeks.get(weekStart(l.day));
    if (w) w[s.kind]++;
    if (!inRange(l.day)) continue;
    row(s).leads++;
    items.push({ type: "lead", kind: s.kind, source: s.id, name: l.name, day: l.day, why: text(l).slice(0, 120) });
    if (s.id === "other") { const k = text(l).trim() || "(blank)"; untagged.set(k, (untagged.get(k) ?? 0) + 1); }
  }
  for (const o of opps) {
    const s = byContact.get(o.contactId) ?? classify(`${o.pipeline} ${o.source}`);
    const name = names.get(o.contactId) || o.name || "Unnamed";
    const why = (whyOf.get(o.contactId) ?? `${o.pipeline} ${o.source}`).slice(0, 120);
    if (inRange(o.day) && QUOTED.test(o.stage)) {
      row(s).quotes++;
      items.push({ type: "quote", kind: s.kind, source: s.id, name, day: o.day, value: o.value, stage: o.stage, why });
    }
    const sold = o.status === "won" || SOLD.test(o.stage);
    const soldDay = o.closedDay ?? o.day;
    if (sold && o.status !== "lost" && inRange(soldDay)) {
      row(s).sales++; row(s).revenue += o.value;
      items.push({ type: "sale", kind: s.kind, source: s.id, name, day: soldDay, value: o.value, stage: o.stage, why });
    }
  }
  for (const a of ads) {
    if (!inRange(a.day)) continue;
    const s = SOURCES.find((x) => x.spend === a.source);
    if (s) row(s).spend += a.spend;
  }
  const list = [...rows.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue), spend: Math.round(r.spend) }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "organic" ? -1 : 1) || b.leads - a.leads || b.revenue - a.revenue);
  const totals = { organic: blank(), paid: blank() };
  for (const r of list) for (const k of ["leads", "quotes", "sales", "revenue", "spend"] as const) totals[r.kind][k] += r[k];
  return {
    from, to: today, totals, rows: list, weeks: [...weeks.values()],
    items: items.sort((x, y) => y.day.localeCompare(x.day)),
    untagged: [...untagged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} (${n})`),
  };
}
