"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card, H1, imgSrc, money, Photo, Spinner } from "../parts";
import { LineMockups, useMockups } from "../Mockups";

type Line = { name: string; desc: string; qty: number; unit: number; total: number; cat: string; how: string; design?: string | null };
type Job = { id: string; season: string; photos: string[]; lines: Line[]; included: string[]; total: number; featured: boolean };

// A photo shows the whole finished house, so a tile never pairs it with part of a price: each line gets one type
// (from its Jobber category and size), and every line of that type on one house is one tile priced at their sum.
// "Roofline" therefore includes that house's side, back, garage and dormer lines, listed on the tile.
const isRoof = (l: Line) => l.cat.startsWith("roofline");
const text = (l: Line) => `${l.name} ${l.desc}`;
const isBow = (l: Line) => /\bbows?\b/i.test(l.name);
function typeOf(l: Line) {
  if (isRoof(l)) return "roofline";
  if (l.cat === "wreath") {
    if (isBow(l)) return "bows";
    const m = text(l).match(/(\d{2})\s*(?:"|”|''|-?\s*inch)/i);
    return `wreath:${m ? m[1] : "other"}`;
  }
  if (/garland/i.test(text(l))) return "garland";
  if (l.cat === "trees+bushes") return "tree";
  if (l.cat === "other" && /fenc|rail/i.test(l.name)) return "railing";
  return l.cat === "stakes/pathway" ? "stakes" : l.cat;
}
const LABEL: Record<string, string> = {
  roofline: "Roofline", "roof:full": "Full roofline", "roof:multi": "Multicolor roofline", pillars: "Pillars", tree: "Trees", bushes: "Bushes",
  railing: "Railing and fencing", garland: "Garland", stakes: "Stakes and pathway", bows: "Bows", other: "Other",
};
const typeLabel = (k: string) => LABEL[k] ?? (k === "wreath:other" ? "Wreaths, other size" : `${k.slice(7)}" wreath`);
// Roofline houses can also be picked out by what their main roofline line says.
const SUB: Record<string, (t: string) => boolean> = { "roof:full": (t) => /full|ridge/i.test(t), "roof:multi": (t) => /multi|red and|green and/i.test(t) };
const ORDER = ["roofline", "roof:full", "roof:multi", "wreath:", "pillars", "tree", "bushes", "railing", "garland", "stakes", "bows", "other"];

type Tile = { j: Job; k: string; lines: { l: Line; i: number }[]; total: number; also: string[] };
/** A photo used by more than one quote can't be tied to either price, so those houses stay out of the type view. */
function usable(jobs: Job[]) {
  const n = new Map<string, number>();
  for (const j of jobs) n.set(j.photos[0], (n.get(j.photos[0]) ?? 0) + 1);
  return jobs.filter((j) => j.photos[0] && n.get(j.photos[0]) === 1);
}
function tilesOf(jobs: Job[], k: string): Tile[] {
  const base = k.startsWith("roof:") ? "roofline" : k;
  return usable(jobs).flatMap((j) => {
    const lines = j.lines.map((l, i) => ({ l, i })).filter((x) => typeOf(x.l) === base);
    if (!lines.length) return [];
    if (SUB[k] && !lines.some((x) => SUB[k](text(x.l)))) return [];
    // Combined lines ("Roofline & Pillars") price other work too; say so on the tile.
    const also = [...new Set(lines.flatMap((x) => [x.l.cat.includes("pillars") && base !== "pillars" ? "pillars" : "", /bush|shrub/i.test(x.l.name) && base !== "bushes" ? "bushes" : "",
      /stake|pathway/i.test(x.l.name) && base !== "stakes" ? "stake lights" : ""]).filter(Boolean))];
    return [{ j, k, lines, total: lines.reduce((t, x) => t + x.l.total, 0), also }];
  }).sort((a, b) => a.total - b.total);
}
function typesIn(jobs: Job[]) {
  const keys = new Set(usable(jobs).flatMap((j) => j.lines.map(typeOf)));
  keys.add("roof:full"); keys.add("roof:multi");
  const rank = (k: string) => { const i = ORDER.findIndex((o) => (o.endsWith(":") ? k.startsWith(o) : k === o)); return i * 1000 + (k.startsWith("wreath:") ? parseInt(k.slice(7)) || 999 : 0); };
  return [...keys].sort((a, b) => rank(a) - rank(b)).map((k) => ({ key: k, label: typeLabel(k), n: tilesOf(jobs, k).length })).filter((t) => t.n > 0);
}
const mid = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** Every real job in the course: the finished install, each line we sold and its price. */
export default function PhotoLibrary() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [cat, setCat] = useState("");
  useEffect(() => { api<{ jobs: Job[] }>("/api/training/jobs").then((r) => setJobs(r.jobs)).catch(() => setJobs([])); }, []);
  if (!jobs) return <Spinner />;
  const types = [{ key: "", label: "Whole houses", n: jobs.length }, ...typesIn(jobs)];
  const tiles = cat ? tilesOf(jobs, cat) : [];
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Quote Creation Training</Link>
      <H1 sub="Houses we lit in 2025. Tap a type to see every house that bought it: the finished photo and what we charged for that part of the house.">Photo library</H1>
      <div className="flex flex-wrap gap-2">
        {types.map(({ key: k, label, n }) => (
          <button key={k} onClick={() => setCat(k)} className="rounded-full px-3 py-1 text-sm font-semibold border"
            style={cat === k ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#CBD5E1", color: NAVY }}>{label} <span className="opacity-60">{n}</span></button>
        ))}
      </div>
      {cat ? <TypeView label={typeLabel(cat)} tiles={tiles} /> : jobs.map((j) => <JobCard key={j.id} j={j} />)}
    </div>
  );
}

/** Every sold line of one type: the finished house, the line, its price; tap for our mockup and the rest of the quote. */
function TypeView({ label, tiles }: { label: string; tiles: Tile[] }) {
  const [open, setOpen] = useState<Tile | null>(null);
  const prices = tiles.map((t) => t.total);
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><b>{tiles.length}</b> houses: {label.toLowerCase()}</span>
        <span>Lowest <b>{money(Math.min(...prices))}</b></span>
        <span>Middle <b>{money(mid(prices))}</b></span>
        <span>Highest <b>{money(Math.max(...prices))}</b></span>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <button key={t.j.id} onClick={() => setOpen(t)} className="text-left rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.lines.every((x) => x.l.design) ? (
              // Each line's own design: the picture matches exactly what the price buys.
              <div className={`grid ${t.lines.length > 1 ? "grid-cols-2" : ""} gap-px bg-slate-200`}>
                {t.lines.map((x) => <img key={x.i} src={x.l.design!} alt={x.l.name} loading="lazy" className="w-full aspect-[4/3] object-cover bg-slate-900" />)}
              </div>
            ) : <img src={imgSrc(t.j.photos[0])} alt={label} loading="lazy" className="w-full aspect-[4/3] object-cover bg-slate-900" />}
            {t.lines.every((x) => x.l.design) ? <div className="px-2 pt-1 text-[10px] font-semibold text-green-700">Our design for this line</div>
              : <div className="px-2 pt-1 text-[10px] text-slate-500">Finished house (no design picture yet)</div>}
            <div className="p-2">
              <div className="text-lg font-extrabold" style={{ color: NAVY }}>{money(t.total)}</div>
              {t.lines.length === 1 ? <div className="text-xs font-semibold text-slate-700 line-clamp-2">{t.lines[0].l.name}{t.lines[0].l.qty > 1 ? ` × ${t.lines[0].l.qty}` : ""}</div>
                : <div className="text-[11px] text-slate-600">{t.lines.map((x) => `${x.l.name} ${money(x.l.total)}`).join(" + ")}</div>}
              {t.also.length > 0 && <div className="text-[11px] text-slate-500">Price includes {t.also.join(" and ")}</div>}
            </div>
          </button>
        ))}
      </div>
      {open && <LineSheet t={open} label={label} onClose={() => setOpen(null)} />}
    </div>
  );
}

function LineSheet({ t, label, onClose }: { t: Tile; label: string; onClose: () => void }) {
  const counts = useMockups(`pq:${t.j.id}`);
  const { j } = t;
  const mine = new Set(t.lines.map((x) => x.i));
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: NAVY }}>{money(t.total)}</div>
            <div className="font-semibold">{label} on this house</div>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 inline-flex items-center gap-1"><X size={16} /> Close</button>
        </div>
        <Photo id={j.photos[0]} big />
        {t.lines.map(({ l, i }) => (
          <div key={i} className="border-b border-slate-100 pb-2">
            <div className="flex justify-between gap-3"><span className="font-semibold">{l.name}{l.qty > 1 ? ` × ${l.qty} at ${money(l.unit)}` : ""}</span><span className="font-bold">{money(l.total)}</span></div>
            {l.desc && <p className="text-sm text-slate-600 whitespace-pre-line">{l.desc}</p>}
            {l.how && <p className="text-xs text-slate-500">{l.how}</p>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.design ? <img src={l.design} alt={`Design for ${l.name}`} className="w-full max-h-[28rem] object-contain rounded-lg border border-slate-200 bg-slate-900" />
              : counts && counts[i] > 0 ? <LineMockups refId={`pq:${j.id}`} line={i} count={counts[i]} big /> : null}
          </div>
        ))}
        <div className="text-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1">The whole quote</div>
          {j.lines.map((x, k) => (
            <div key={k} className={`flex justify-between gap-3 ${mine.has(k) ? "font-bold" : "text-slate-500"}`}><span>{x.name}{x.qty > 1 ? ` × ${x.qty}` : ""}</span><span>{money(x.total)}</span></div>
          ))}
          <div className="flex justify-between font-extrabold mt-1" style={{ color: NAVY }}><span>Total before tax</span><span>{money(j.total)}</span></div>
        </div>
      </div>
    </div>
  );
}

function JobCard({ j }: { j: Job }) {
  const [mock, setMock] = useState(false);
  const counts = useMockups(mock ? `pq:${j.id}` : null);
  return (
    <Card className="space-y-3">
      <Photo id={j.photos[0]} big />
      {j.photos.length > 1 && <div className="grid grid-cols-3 gap-2">{j.photos.slice(1).map((p) => <Photo key={p} id={p} />)}</div>}
      <div className="space-y-2">
        {j.lines.map((l, i) => (
          <div key={i} className="border-b border-slate-100 pb-2">
            <div className="flex justify-between gap-3">
              <span className="font-semibold">{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</span>
              <span className="font-bold whitespace-nowrap">{money(l.total)}</span>
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-line">{l.desc}</p>
            {l.how && <p className="text-xs text-slate-500">{l.how}</p>}
            {mock && counts && counts[i] > 0 && <LineMockups refId={`pq:${j.id}`} line={i} count={counts[i]} />}
          </div>
        ))}
        {j.included.length > 0 && <div className="text-xs text-slate-500">Also on the quote at $0: {j.included.join(" · ")}</div>}
        <div className="flex justify-between font-extrabold" style={{ color: NAVY }}><span>Total before tax</span><span>{money(j.total)}</span></div>
      </div>
      {!mock ? <button className="text-sm font-semibold" style={{ color: NAVY }} onClick={() => setMock(true)}>Show our mockups from Jobber</button>
        : counts && !counts.some((n) => n > 0) ? <p className="text-xs text-slate-500">Jobber didn't return mockups for this quote.</p> : null}
    </Card>
  );
}
