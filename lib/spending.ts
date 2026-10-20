import { kvGet, kvGetMany, kvSet, kvUpdate } from "./store";
import { getJobs } from "./jobs";
import type { JobDetail } from "./jobDetails";
import { getPayOverrides, payFor } from "./crewPay";
import { getAllExpenses } from "./expenses";
import { bonusesByJob } from "./reviews";
import { getOrders } from "./costs";
import { allAdDays } from "./ads";
import { getDeals } from "./deals";
import { loadInsurance } from "./insurance";
import { getPay } from "./signs";
import { gapi, googleStatus } from "./google";
import { addDays, etDay } from "./marketing";
import { parseCsv } from "./csv";

/* Owners' Expenses: every dollar going out, in one list, sorted into plain buckets.
   Most of it fills in by itself from what the app already keeps (crew pay, crew receipts, review bonuses,
   sign pay, supplier orders, ads, radio and email deals, insurance) plus receipts and invoices found in the
   info@ inbox. Owners add the rest by hand or upload a bank or card export (CSV).
   Every amount lives in the database only: the repo is public. */

export const CATS = {
  materials: "Lights and supplies",
  crew: "Crew pay",
  payroll: "Payroll (ADP)",
  marketing: "Marketing and ads",
  insurance: "Insurance",
  vans: "Vans, gas and tolls",
  software: "Software and apps",
  rent: "Warehouse and rent",
  other: "Other",
} as const;
export type Cat = keyof typeof CATS;
const isCat = (c: unknown): c is Cat => typeof c === "string" && c in CATS;

export type Source = "crew-pay" | "review" | "signs" | "receipt" | "order" | "ads" | "deal" | "insurance" | "email" | "bank" | "manual";
export const SOURCE_LABEL: Record<Source, string> = {
  "crew-pay": "Crew pay on the job", review: "Review bonus", signs: "Yard sign pay", receipt: "Crew receipt",
  order: "Supplier order (Costs)", ads: "Ad account", deal: "Marketing deal", insurance: "Insurance policy",
  email: "Found in email", bank: "Bank or card file", manual: "Added by hand",
};

export type Spend = {
  id: string; day: string; amount: number; cat: Cat; vendor: string; what: string; source: Source;
  link?: string; photo?: string; skipped?: boolean; why?: string; auto?: Cat; // auto = the bucket it would get on its own
};

/* ---------- Sorting into buckets ---------- */

const RULES: [Cat, RegExp][] = [
  ["payroll", /\b(adp|gusto|paychex|payroll)\b/i],
  ["insurance", /insurance|progressive|bi ?berk|geico|state farm|hiscox|next insurance|the hartford|liberty mutual|nationwide|travelers/i],
  ["marketing", /iheart|google ?ads|facebook|meta ?ads|smartlead|headline theory|goohoo|vistaprint|yard ?sign|signs?\b|ooshirts|rush ?order ?tees|custom ink|zappy|nextdoor|craigslist|yelp|angi|thumbtack|print|flyer|door ?hanger|postcard/i],
  ["vans", /\b(gas|fuel|shell|exxon|mobil|chevron|sunoco|wawa|sheetz|bp|citgo|valero|7-eleven|royal farms|toll|e-?z ?pass|parking|jiffy|tire|auto ?parts|autozone|advance auto|o'?reilly|ford|transit|u-?haul|enterprise|hertz|penske|car ?wash|dmv|mva)\b/i],
  ["software", /highlevel|gohighlevel|jobber|zapier|vercel|supabase|google ?(workspace|one|cloud)|g ?suite|openai|anthropic|claude|quickbooks|intuit|canva|adobe|microsoft|apple\.com|icloud|notion|dropbox|squarespace|godaddy|wix|clarity|subscription|software/i],
  ["rent", /\b(rent|lease|storage|warehouse|public storage|extra space|cubesmart)\b/i],
  ["materials", /1000 ?bulbs|minleon|wintergreen|christmas|holiday|bulb|lights?\b|wreath|garland|home ?depot|lowe'?s|menards|ace hardware|true value|amazon|harbor freight|grainger|supply|wire|cord|clips?|stakes?|ladder|extension/i],
];

export const guessCat = (text: string): Cat => RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
const vendorKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 3).join(" ");

/* ---------- Owner edits: move a line to another bucket, or say it isn't a business expense ---------- */

type Edit = { cat?: Cat; skip?: boolean; by: string; at: number };
const EDITS = "ldmv:spend:edits";
const VENDOR_RULES = "ldmv:spend:vendors"; // a vendor an owner moved once goes to that bucket from then on

const monthlyBase = (id: string) => id.replace(/^(m[0-9a-z]+)_\d{4}-\d{2}$/, "$1"); // one month of a monthly line -> the line

export async function editLine(rawId: string, vendor: string, change: { cat?: string; skip?: boolean }, by: string) {
  const id = monthlyBase(rawId);
  const cat = isCat(change.cat) ? change.cat : undefined;
  await kvUpdate<Record<string, Edit>>(EDITS, {}, (all) => {
    const cur = all[id] ?? { by, at: Date.now() };
    if (cat) cur.cat = cat;
    if (change.skip !== undefined) cur.skip = change.skip || undefined;
    all[id] = { ...cur, by, at: Date.now() };
  });
  if (cat && vendor) await kvUpdate<Record<string, Cat>>(VENDOR_RULES, {}, (all) => { all[vendorKey(vendor)] = cat; });
}

/* ---------- Added by hand (one-off or every month) ---------- */

export type Manual = { id: string; day: string; amount: number; cat: Cat; vendor: string; what: string; monthly?: boolean; endDay?: string; photo?: string; by: string; at: number };
const MANUAL = "ldmv:spend:manual";
export const getManual = async () => (await kvGet<Manual[]>(MANUAL)) ?? [];

const money = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
};
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);

export async function addManual(raw: any, by: string) {
  const amount = money(raw?.amount);
  if (!amount) throw new Error("Type the amount, like 120 or 89.50.");
  const what = str(raw?.what) || str(raw?.vendor);
  if (!what) throw new Error("Say what it was for.");
  const m: Manual = {
    id: `m${Date.now().toString(36)}`, day: isDay(raw?.day) ? raw.day : etDay(Date.now()), amount,
    vendor: str(raw?.vendor) || what, what, cat: isCat(raw?.cat) ? raw.cat : guessCat(`${raw?.vendor} ${what}`),
    monthly: !!raw?.monthly, photo: str(raw?.photo, 500) || undefined, by, at: Date.now(),
  };
  await kvUpdate<Manual[]>(MANUAL, [], (all) => { all.push(m); });
  return m;
}

/** Remove a hand-added line; a monthly one just stops repeating from this month on. */
export async function removeManual(id: string) {
  const month = etDay(Date.now()).slice(0, 7);
  await kvUpdate<Manual[]>(MANUAL, [], (all) => {
    const i = all.findIndex((m) => m.id === id);
    if (i < 0) return;
    if (all[i].monthly && all[i].day.slice(0, 7) < month) all[i].endDay = `${month}-01`;
    else all.splice(i, 1);
  });
}

/* ---------- Bank or card export (CSV) ---------- */

type BankRow = { id: string; day: string; amount: number; desc: string };
type BankStore = { rows: BankRow[]; files: { name: string; at: number; added: number; by: string }[] };
const BANK = "ldmv:spend:bank";

function csvDay(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}
const pick = (r: Record<string, string>, ...names: RegExp[]) => {
  for (const re of names) { const k = Object.keys(r).find((h) => re.test(h)); if (k && r[k]) return r[k]; }
  return "";
};
const signed = (s: string) => {
  const t = s.replace(/[$,\s]/g, "");
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()\-]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
};
// Money moving between our own accounts, card payments and money coming in are not spending.
const NOT_SPENDING = /payment.{0,12}thank|autopay|online payment|transfer|xfer|deposit|refund|credit adj|interest paid|cash back|reversal|jobber pay|payout|stripe transfer/i;

/** Reads any bank or card CSV: date, description, and either one amount column or debit/credit columns. */
export async function importBank(text: string, name: string, by: string) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("That file has no rows.");
  const parsed = rows.map((r) => {
    const day = csvDay(pick(r, /^(transaction |trans\.? |posted |post(ing)? )?date$/i, /date/i));
    const desc = pick(r, /^description$/i, /merchant|payee|name|memo|description|details/i);
    const debit = pick(r, /debit|withdrawal|charge/i);
    const amt = pick(r, /^amount$/i, /amount/i);
    return { day, desc, debit: debit ? Math.abs(signed(debit)) : NaN, amt: amt ? signed(amt) : NaN };
  }).filter((r) => r.day && r.desc);
  if (!parsed.length) throw new Error("Couldn't find the date and description columns in that file.");
  // One amount column: banks show spending as negative, most card exports as positive. The side with more rows is spending.
  const withAmt = parsed.filter((r) => Number.isFinite(r.amt));
  const negSpend = withAmt.filter((r) => r.amt < 0).length >= withAmt.filter((r) => r.amt > 0).length;
  const out: BankRow[] = [];
  for (const r of parsed) {
    const n = Number.isFinite(r.debit) && r.debit > 0 ? r.debit : Number.isFinite(r.amt) ? (negSpend ? -r.amt : r.amt) : NaN;
    if (!(n > 0) || NOT_SPENDING.test(r.desc)) continue;
    const desc = r.desc.replace(/\s+/g, " ").slice(0, 120);
    out.push({ id: `b_${r.day}_${Math.round(n * 100)}_${vendorKey(desc).replace(/ /g, "-")}`, day: r.day!, amount: Math.round(n * 100) / 100, desc });
  }
  if (!out.length) throw new Error("No spending found in that file (only payments, deposits or transfers).");
  let added = 0;
  await kvUpdate<BankStore>(BANK, { rows: [], files: [] }, (s) => {
    const have = new Set(s.rows.map((x) => x.id));
    for (const r of out) if (!have.has(r.id)) { s.rows.push(r); have.add(r.id); added++; }
    s.files.unshift({ name: str(name, 80) || "bank.csv", at: Date.now(), added, by });
    s.files = s.files.slice(0, 50);
  });
  return { added, read: out.length };
}

/** Cleans a store merchant line ("SQ *SHELL OIL 1234 BETHESDA MD") into something readable ("Shell Oil"). */
function merchant(desc: string) {
  const t = desc.replace(/^(sq|tst|pp|paypal|sp|pos|dbt|debit card purchase|purchase|recurring)\s*\*?\s*/i, "")
    .replace(/[#*]\s*\d+.*$/, "").replace(/\s\d{3,}.*$/, "").replace(/\s{2,}.*/, "").trim();
  return (t || desc).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}

/* ---------- Receipts and invoices in the info@ inbox ---------- */

type EmailLine = { id: string; day: string; amount: number; vendor: string; what: string; link: string; key?: string };
type EmailStore = { seen: Record<string, 1>; items: EmailLine[]; lastAt: number; error?: string };
const EMAIL = "ldmv:spend:email";

// Money coming in, our own mail, and things that already have their own exact source here (ad accounts, the
// marketing deals sheet, insurance.json) are left out so nothing counts twice.
const SKIP_FROM = /getjobber\.com|lightdmv\.com|iheart|ads-noreply@google\.com|adwords|facebookmail|meta\.com|progressive|biberk|insurance|zelle|venmo|cash\.app|paypal\.com.*(received|sent you)/i;
const SKIP_SUBJECT = /refund|return|quote|estimate|proposal|abandon|left in your cart|review your|how'?d we do|rate your|survey|welcome|save \d+%|% off|sale\b|deal\b|webinar|newsletter|password|verify|security alert|sign.?in|problem sending|was paid towards|you received|payment received from|has paid|proof|on hold|artwork|shipped|on its way|out for delivery|has been delivered|delivered your|ready for pick ?up|pick it up|reminder/i;
const QUERY = "newer_than:400d -from:me -from:getjobber.com (subject:(receipt OR invoice OR order OR purchase OR payment OR bill OR subscription OR renewal OR charged OR confirmation) OR \"order total\" OR \"amount paid\" OR \"total charged\")";

const AMOUNT_RES = [
  /(?:order total|grand total|total charged|amount charged|charged to your|total paid|amount paid|payment amount|invoice total|total amount|amount due|total due|balance due)[^$\d]{0,40}\$\s?([\d,]+\.\d{2})/i,
  /your payment of \$\s?([\d,]+\.\d{2})/i,
  /you (?:paid|were charged) \$\s?([\d,]+\.\d{2})/i,
];

function amountIn(text: string): number | null {
  for (const re of AMOUNT_RES) { const m = text.match(re); if (m) return money(m[1]); }
  const all = [...text.matchAll(/\btotal\b[\s:|]{0,25}\$\s?([\d,]+\.\d{2})/gi)];
  return all.length ? money(all[all.length - 1][1]) : null;
}

const header = (m: any, name: string) => m?.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function bodyText(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return b64(part.body.data);
  const kids: any[] = part.parts ?? [];
  const plain = kids.map(bodyText).find((t) => t);
  if (plain) return plain;
  if (part.mimeType === "text/html" && part.body?.data) {
    return b64(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#36;/g, "$").replace(/\s+/g, " ");
  }
  return "";
}

/** Reads up to `max` receipt-looking emails not read before, newest first. Re-running picks up older ones. */
export async function scanEmail(max = 60) {
  if (!(await googleStatus()).connected) return { read: 0, found: 0, error: "Google isn't connected" };
  const st = (await kvGet<EmailStore>(EMAIL)) ?? { seen: {}, items: [], lastAt: 0 };
  const me = "info@lightdmv.com";
  const todo: string[] = [];
  let pageToken = "";
  try {
    for (let page = 0; page < 5 && todo.length < max; page++) {
      const list = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(QUERY)}${pageToken ? `&pageToken=${pageToken}` : ""}`);
      for (const m of list.messages ?? []) if (!st.seen[m.id] && todo.length < max) todo.push(m.id);
      if (!list.nextPageToken) break;
      pageToken = list.nextPageToken;
    }
    let found = 0;
    const keys = new Set(st.items.map((i) => i.key).filter(Boolean));
    for (const id of todo) {
      st.seen[id] = 1;
      const m = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
      const from = header(m, "From"), subject = header(m, "Subject");
      if (SKIP_FROM.test(from) || SKIP_SUBJECT.test(subject)) continue;
      const text = `${subject}\n${bodyText(m.payload)}`.slice(0, 200_000);
      const amount = amountIn(text);
      if (!amount) continue;
      const vendor = (from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || from).replace(/^(the )?(no-?reply|do-?not-?reply|orders?|info|sales|help|support)\s*/i, "").slice(0, 40)
        || (from.match(/@([^.>]+)/)?.[1] ?? "Email");
      const ref = text.match(/(?:order|invoice|receipt)\s*(?:#|number|no\.?)\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1];
      const key = ref ? `${vendorKey(vendor)}|${ref.toUpperCase()}` : undefined;
      if (key && keys.has(key)) continue; // the same order's "received", "shipped" and "delivered" emails count once
      if (key) keys.add(key);
      const day = etDay(Number(m.internalDate) || Date.now());
      st.items.push({ id: `e_${id}`, day, amount, vendor, what: subject.slice(0, 100) || "Receipt", key, link: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(me)}#all/${m.threadId ?? id}` });
      found++;
    }
    st.lastAt = Date.now(); st.error = undefined;
    await kvSet(EMAIL, st);
    return { read: todo.length, found, left: todo.length >= max };
  } catch (e: any) {
    st.error = e.message;
    await kvSet(EMAIL, st);
    return { read: todo.length, found: 0, error: e.message };
  }
}
export const emailStatus = async () => {
  const st = await kvGet<EmailStore>(EMAIL);
  return { lastAt: st?.lastAt ?? 0, found: st?.items.length ?? 0, read: Object.keys(st?.seen ?? {}).length, error: st?.error };
};

/* ---------- Everything together ---------- */

const monthEnd = (ym: string) => addDays(`${nextMonth(ym)}-01`, -1);
function nextMonth(ym: string) { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
const MONTH_NAME = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export async function allSpending(): Promise<Spend[]> {
  const today = etDay(Date.now());
  const thisMonth = today.slice(0, 7);
  const [jobs, overrides, receipts, bonuses, orders, adDays, deals, ins, signPay, manual, bank, email, edits, vendorRules] = await Promise.all([
    getJobs(), getPayOverrides(), getAllExpenses(), bonusesByJob(), getOrders(), allAdDays(), getDeals(), loadInsurance(), getPay(),
    getManual(), kvGet<BankStore>(BANK), kvGet<EmailStore>(EMAIL), kvGet<Record<string, Edit>>(EDITS), kvGet<Record<string, Cat>>(VENDOR_RULES),
  ]);
  const out: Spend[] = [];
  const add = (s: Omit<Spend, "auto">) => out.push({ ...s, amount: Math.round(s.amount * 100) / 100 });

  // Crew pay: every install and takedown visit up to today, at the 15% / 5% rule or the amount set on the job.
  const visits = Object.values(jobs).filter((j) => (j.kind === "install" || j.kind === "takedown") && j.start.slice(0, 10) <= today && j.source === "jobber");
  const details = await kvGetMany<JobDetail>(visits.map((j) => (j.jobberJobId ? `ldmv:jobdetail:${j.jobberJobId}` : "ldmv:none")));
  visits.forEach((j, i) => {
    const pay = payFor(j, details[i], overrides);
    if (!pay.amount) return;
    add({ id: `cp_${j.id}`, day: etDay(new Date(j.start)), amount: pay.amount, cat: "crew", vendor: j.crew ? j.crew.replace("crew", "Crew ") : "Crew",
      what: `${j.kind === "install" ? "Install" : "Takedown"} ${j.jobNumber ? `#${j.jobNumber} ` : ""}${j.client || j.title}`, source: "crew-pay", link: `/jobs/${j.id}` });
  });
  for (const [jobId, list] of Object.entries(bonuses)) for (const b of list) {
    add({ id: `rv_${b.reviewId}`, day: etDay(b.at), amount: b.amount, cat: "crew", vendor: b.person, what: `Google review bonus (${b.reviewer})`, source: "review", link: `/jobs/${jobId}` });
  }
  for (const [uid, list] of Object.entries(signPay)) {
    const byMonth = new Map<string, { amount: number; signs: number; name: string }>();
    for (const e of list) { const k = etDay(e.at).slice(0, 7), v = byMonth.get(k) ?? { amount: 0, signs: 0, name: e.name }; v.amount += e.amount; v.signs += e.signs; byMonth.set(k, v); }
    for (const [ym, v] of byMonth) add({ id: `sg_${uid}_${ym}`, day: ym === thisMonth ? today : monthEnd(ym), amount: v.amount, cat: "marketing", vendor: v.name, what: `Yard sign pay, ${MONTH_NAME(ym)} (${v.signs} signs)`, source: "signs", link: "/costs" });
  }
  // Crew receipts at close-out.
  for (const [jobId, e] of Object.entries(receipts)) for (const x of e.items) {
    const job = jobs[jobId];
    add({ id: `rc_${x.id}`, day: etDay(x.at), amount: x.amount, cat: guessCat(x.note ?? "") === "vans" ? "vans" : "materials", vendor: x.byName,
      what: `${x.note || "Receipt"}${job ? ` · ${job.jobNumber ? `#${job.jobNumber} ` : ""}${job.client || job.title}` : ""}`, source: "receipt", link: `/jobs/${jobId}`, photo: x.photo });
  }
  // Supplier orders on the Costs tab (landed cost).
  for (const o of orders) {
    const landed = o.lines.reduce((t, l) => t + l.landed, 0);
    add({ id: `or_${o.id}`, day: (o.date && csvDay(o.date)) || etDay(o.addedAt), amount: landed, cat: "materials", vendor: "Light supplier", what: o.label, source: "order", link: "/costs" });
  }
  // Ads, one line per account per month.
  const ads = new Map<string, { amount: number; last: string }>();
  for (const d of adDays) { const k = `${d.source}|${d.day.slice(0, 7)}`, v = ads.get(k) ?? { amount: 0, last: d.day }; v.amount += d.spend; if (d.day > v.last) v.last = d.day; ads.set(k, v); }
  const AD_NAME = { facebook: "Facebook ads", google: "Google Ads", lsa: "Google Local Services" } as Record<string, string>;
  for (const [k, v] of ads) { const [src, ym] = k.split("|"); if (v.amount > 0) add({ id: `ad_${k}`, day: v.last, amount: v.amount, cat: "marketing", vendor: AD_NAME[src] ?? src, what: `${AD_NAME[src] ?? src}, ${MONTH_NAME(ym)}`, source: "ads", link: "/marketing" }); }
  // Deals bought for a run (radio, email blasts): their cost spread over the days they run, counted up to today.
  for (const d of deals.deals) {
    if (/cancel|declin|lost|no\b/i.test(d.status) || !d.cost) continue;
    const days = Math.round((Date.parse(d.end) - Date.parse(d.start)) / 86400_000) + 1;
    for (let ym = d.start.slice(0, 7); ym <= d.end.slice(0, 7) && ym <= thisMonth; ym = nextMonth(ym)) {
      const from = ym === d.start.slice(0, 7) ? d.start : `${ym}-01`;
      const to = [d.end, monthEnd(ym), today].sort()[0];
      if (to < from) continue;
      const n = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;
      add({ id: `dl_${vendorKey(d.name)}_${ym}`, day: to, amount: (d.cost * n) / days, cat: "marketing", vendor: d.vendor || d.name,
        what: `${d.name}, ${MONTH_NAME(ym)} share (${n} of ${days} days)`, source: "deal", link: deals.url ?? "/marketing" });
    }
  }
  // Insurance: each policy's yearly premium as a monthly share while it's in force.
  for (const p of ins.data?.policies ?? []) {
    if (!p.premium?.annual || p.status === "missing" || p.status === "expired") continue;
    const start = (p.effective && csvDay(p.effective)) || addDays(today, -365);
    const end = (p.expires && csvDay(p.expires)) || addDays(start, 365);
    for (let ym = start.slice(0, 7); ym <= thisMonth && ym <= end.slice(0, 7); ym = nextMonth(ym)) {
      add({ id: `in_${p.id}_${ym}`, day: `${ym}-01`, amount: p.premium.annual / 12, cat: "insurance", vendor: p.carrier || p.title, what: `${p.title}, ${MONTH_NAME(ym)} (1/12 of the year)`, source: "insurance", link: "/insurance" });
    }
  }
  // Receipts and invoices from email.
  for (const e of email?.items ?? []) add({ id: e.id, day: e.day, amount: e.amount, cat: guessCat(`${e.vendor} ${e.what}`), vendor: e.vendor, what: e.what, source: "email", link: e.link });
  // Added by hand; a monthly one repeats on the same day each month.
  for (const m of manual) {
    if (!m.monthly) { add({ id: m.id, day: m.day, amount: m.amount, cat: m.cat, vendor: m.vendor, what: m.what, source: "manual", photo: m.photo }); continue; }
    for (let ym = m.day.slice(0, 7); ym <= thisMonth && (!m.endDay || ym < m.endDay.slice(0, 7)); ym = nextMonth(ym)) {
      const day = [`${ym}-${m.day.slice(8, 10)}`, monthEnd(ym)].sort()[0];
      if (day > today) break;
      add({ id: `${m.id}_${ym}`, day, amount: m.amount, cat: m.cat, vendor: m.vendor, what: `${m.what} (every month)`, source: "manual", photo: m.photo });
    }
  }

  // Bank and card lines last: one that matches something already counted (same amount within 4 days) or a bill
  // that already has its own source (ads, radio, insurance, payroll by ADP from email) shows as already counted.
  const counted = out.map((s) => ({ amount: s.amount, t: Date.parse(s.day) }));
  for (const b of bank?.rows ?? []) {
    const vendor = merchant(b.desc);
    const cat = guessCat(b.desc);
    const t = Date.parse(b.day);
    const dup = counted.some((c) => Math.abs(c.amount - b.amount) < 0.01 && Math.abs(c.t - t) <= 4 * 86400_000);
    const own = /iheart|google ?ads|facebk|facebook|meta ?ads/i.test(b.desc) && adDays.length + deals.deals.length > 0
      || cat === "insurance" && !!ins.data?.policies.length;
    add({ id: b.id, day: b.day, amount: b.amount, cat, vendor, what: b.desc, source: "bank", skipped: dup || own || undefined,
      why: dup ? "Same amount already counted from another place" : own ? "Already counted from its own account" : undefined });
  }

  // Owner choices win: a vendor moved once stays moved, and any single line can be moved or left out.
  for (const s of out) {
    s.auto = s.cat;
    const rule = s.source === "email" || s.source === "bank" || s.source === "manual" ? vendorRules?.[vendorKey(s.vendor)] : undefined;
    if (rule) s.cat = rule;
    const e = edits?.[monthlyBase(s.id)]; // a monthly line's edit covers every month
    if (e?.cat) s.cat = e.cat;
    if (e?.skip !== undefined) { s.skipped = e.skip || undefined; s.why = e.skip ? "Marked not a business expense" : undefined; }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || b.amount - a.amount);
}

/* ---------- Seasons and the Google Sheet ---------- */

/** A season runs August 1 to July 31: sales and installs in the fall, takedowns in January. */
export const seasonStart = (day: string) => (+day.slice(5, 7) >= 8 ? `${day.slice(0, 4)}-08-01` : `${+day.slice(0, 4) - 1}-08-01`);

export const SHEET_TITLE = "Light DMV expenses";
const SHEET = "ldmv:spend:sheet";
type SheetState = { id: string; url: string; syncedAt: number; error?: string };
export const sheetState = () => kvGet<SheetState>(SHEET);

/** Writes "Light DMV expenses" in the info@ Drive: a summary by bucket and month, and every line. Makes the sheet the first time. */
export async function syncSheet(lines?: Spend[]) {
  if (!(await googleStatus()).connected) throw new Error("Google isn't connected (Marketing tab, Connect Google).");
  const items = (lines ?? (await allSpending())).filter((s) => !s.skipped);
  let st = await sheetState();
  if (st?.id) {
    try { await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${st.id}?fields=spreadsheetId`); }
    catch { st = null; } // deleted or moved out of reach: make a new one
  }
  if (!st?.id) {
    const made = await gapi(`https://sheets.googleapis.com/v4/spreadsheets`, { method: "POST", body: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: "Summary", gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } } }, { properties: { title: "All expenses", gridProperties: { frozenRowCount: 1 } } }],
    } });
    st = { id: made.spreadsheetId, url: made.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${made.spreadsheetId}/edit`, syncedAt: 0 };
  }
  const today = etDay(Date.now());
  const months: string[] = [];
  for (let ym = seasonStart(addDays(seasonStart(today), -1)).slice(0, 7); ym <= today.slice(0, 7); ym = nextMonth(ym)) months.push(ym);
  const cats = Object.keys(CATS) as Cat[];
  const sumOf = (f: (s: Spend) => boolean) => Math.round(items.filter(f).reduce((t, s) => t + s.amount, 0) * 100) / 100;
  const ss = seasonStart(today), lastSs = seasonStart(addDays(ss, -1));
  const head = ["Bucket", "This season", "Last season", ...months.map((ym) => MONTH_NAME(ym))];
  const row = (label: string, f: (s: Spend) => boolean) => [label, sumOf((s) => f(s) && s.day >= ss), sumOf((s) => f(s) && s.day >= lastSs && s.day < ss), ...months.map((ym) => sumOf((s) => f(s) && s.day.startsWith(ym)))];
  const summary = [head, ...cats.map((c) => row(CATS[c], (s) => s.cat === c)), row("Total", () => true), [], [`Updated by the Light DMV app ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Edit expenses in the app (Money and papers, Expenses); this sheet is rewritten each time.`]];
  const all = [["Date", "Bucket", "Who / where", "What", "Amount", "From"], ...items.map((s) => [s.day, CATS[s.cat], s.vendor, s.what, s.amount, SOURCE_LABEL[s.source]])];
  await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${st.id}/values:batchClear`, { method: "POST", body: { ranges: ["Summary", "All expenses"] } });
  await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${st.id}/values:batchUpdate`, { method: "POST", body: {
    valueInputOption: "USER_ENTERED",
    data: [{ range: "Summary!A1", values: summary }, { range: "All expenses!A1", values: all }],
  } });
  const next: SheetState = { ...st, syncedAt: Date.now() };
  await kvSet(SHEET, next);
  return next;
}
