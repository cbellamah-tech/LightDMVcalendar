// Practice in the quote course, run like a real quote: read the request, size up the house on Street View and the
// overhead view, measure the roofline, choose what to offer, price each line, then see what we really sent.
// Line choice, footage and price are graded separately so the trainee sees which skill they missed.
import type { PracticeTry } from "./installCourse";
import { pctOff, PQuote, Pack, QJob } from "./training";

/** Line types the trainee can offer. Combined Jobber categories count as both of their parts. */
export const OFFER = ["roofline", "pillars", "tree", "bushes", "wreath", "railing", "stakes/pathway", "garland", "other"] as const;
const split = (cat: string) => (cat === "roofline+pillars" ? ["roofline", "pillars"] : cat === "trees+bushes" ? ["tree", "bushes"] : [cat]);
const offerOf = (cat: string) => split(cat)[0];
export const realOffer = (q: PQuote) => [...new Set(q.lines.filter((l) => l.graded !== false).flatMap((l) => split(l.cat)))];

export type PJob = { q: PQuote; j: QJob };
export function practiceJobs(pack: Pack): PJob[] {
  const by = new Map(pack.quotes.map((q) => [q.id, q]));
  return (pack.quote?.jobs ?? []).flatMap((j) => (by.has(j.id) ? [{ q: by.get(j.id)!, j }] : []));
}

const peaky = (p: PJob) => (p.j.peaks ?? 0) > 0 || p.q.lines.some((l) => l.cat.startsWith("roofline") && /peak|gable|dormer/i.test(`${l.name} ${l.desc}`));
const trees = (p: PJob) => p.q.lines.filter((l) => l.cat === "tree" || l.cat === "trees+bushes").reduce((t, l) => t + Math.max(1, l.qty), 0) >= 2;
const addOns = (p: PJob) => p.q.lines.filter((l) => !l.cat.startsWith("roofline")).length >= 3;

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** The final: one roofline with peaks, one job with several trees, one heavy on add-ons, the rest random. */
export function finalMix(every: PJob[], n: number): PJob[] {
  const ok = every.filter((p) => p.j.finalOk);
  const all = ok.length >= n ? ok : every; // the answer key marks jobs with enough graded lines for the final
  const out: PJob[] = [];
  for (const want of [peaky, trees, addOns]) {
    const c = all.filter((p) => want(p) && !out.includes(p));
    if (c.length) out.push(rnd(c));
  }
  const rest = all.filter((p) => !out.includes(p));
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
  return out.sort(() => Math.random() - 0.5);
}

/** What the trainee starts from: never prices, never the finished photo, never the real line list (unless a drill names the lines). */
export function forQuoter(p: PJob, cats?: string[]) {
  const ask = cats ? p.q.lines.map((l, i) => (cats.includes(l.cat) ? i : -1)).filter((i) => i >= 0) : [];
  return {
    id: p.j.id, address: p.j.address, lat: p.j.lat ?? null, lng: p.j.lng ?? null, request: p.j.request, returning: p.j.returning, commercial: p.j.commercial,
    hasRoofline: p.q.lines.some((l) => l.cat.startsWith("roofline")), measured: !!p.j.feet,
    lines: cats ? ask.map((i) => ({ i, name: p.q.lines[i].name, desc: p.q.lines[i].desc, qty: p.q.lines[i].qty, cat: p.q.lines[i].cat })) : null,
  };
}

export type Answer = { offer?: string[]; feet?: number; lines?: { cat: string; price: number; qty?: number }[]; prices?: Record<number, number> };

export function gradeJob(p: PJob, a: Answer, pricePct: number, cats?: string[]) {
  const lines = p.q.lines.map((l, i) => ({ i, name: l.name, desc: l.desc, qty: l.qty, unit: l.unit, total: l.total, cat: l.cat, charged: l.charged ?? l.total, note: l.note ?? "", graded: l.graded !== false }));
  const real = lines.filter((l) => l.graded); // lines the photo doesn't show aren't graded
  // Line choice: did they offer every kind of line we sold, and what did they add that we didn't?
  const want = realOffer(p.q), got = [...new Set((a.offer ?? []).filter((x) => (OFFER as readonly string[]).includes(x)))];
  const choice = cats ? null : { missed: want.filter((c) => !got.includes(c)), extra: got.filter((c) => !want.includes(c)), ok: want.every((c) => got.includes(c)) };
  // Footage, when someone has measured this house.
  const feet = p.j.feet && Number(a.feet) > 0 ? { mine: Number(a.feet), real: p.j.feet, pctOff: pctOff(Number(a.feet), p.j.feet), ok: pctOff(Number(a.feet), p.j.feet) <= 10 } : null;
  // Price: each kind of line, and the total.
  let rows: { key: string; label: string; mine: number; real: number; pctOff: number }[];
  if (cats) {
    rows = real.filter((l) => cats.includes(l.cat)).map((l) => ({ key: String(l.i), label: l.name, mine: Number(a.prices?.[l.i]) || 0, real: l.total, pctOff: 0 }));
  } else {
    const sum = (xs: { cat: string; total: number }[], c: string) => xs.filter((x) => offerOf(x.cat) === c).reduce((t, x) => t + x.total, 0);
    const mine = (a.lines ?? []).map((l) => ({ cat: String(l.cat), total: Math.max(0, Number(l.price) || 0) }));
    const keys = [...new Set([...real.map((l) => offerOf(l.cat)), ...mine.map((l) => l.cat)])];
    rows = keys.map((c) => ({ key: c, label: c, mine: sum(mine, c), real: sum(real, c), pctOff: 0 }));
  }
  rows.forEach((r) => (r.pctOff = pctOff(r.mine, r.real)));
  const myTotal = rows.reduce((t, r) => t + r.mine, 0), realTotal = rows.reduce((t, r) => t + r.real, 0);
  const off = pctOff(myTotal, realTotal);
  const worst = rows.filter((r) => r.real > 0).reduce((w, r) => Math.max(w, r.pctOff), 0);
  return {
    route: null, choice, feet, rows, myTotal, realTotal, pctOff: off, worst, ok: off <= pricePct,
    reveal: { lines, photos: p.q.photos, included: p.q.included, total: p.q.total, feet: p.j.feet ?? null, note: p.j.note ?? "", notPicked: p.j.notPicked ?? [], mockups: `pq:${p.q.id}` },
  };
}

export const passLines = (tries: number, good: number) => (t: PracticeTry[]) => t.length >= tries && t.filter((x) => x.ok).length >= good;
