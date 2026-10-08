"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card, H1, imgSrc, money, Photo, Spinner } from "../parts";
import { LineMockups, useMockups } from "../Mockups";

type Line = { name: string; desc: string; qty: number; unit: number; total: number; cat: string; how: string };
type Job = { id: string; season: string; photos: string[]; lines: Line[]; included: string[]; total: number; featured: boolean };

// Line types come from what the line says, so one line can show under several buttons ("Roofline & Pillars" is both).
const MAIN: [string, string, (l: Line, t: string) => boolean][] = [
  ["roofline", "All rooflines", (l) => l.cat.startsWith("roofline")],
  ["roof:front", "Front roofline", (l) => l.cat.startsWith("roofline") && !/side|back|garage|dormer|portico/i.test(l.name)],
  ["roof:full", "Full roofline", (l, t) => l.cat.startsWith("roofline") && /full|ridge/i.test(t)],
  ["roof:side", "Side, back and garage", (l) => l.cat.startsWith("roofline") && /side|back|garage/i.test(l.name)],
  ["roof:dormer", "Dormers and peaks", (l) => /dormer|peak|gable/i.test(l.name)],
  ["roof:multi", "Multicolor roofline", (l, t) => l.cat.startsWith("roofline") && /multi|red and|green and/i.test(t)],
  ["pillars", "Pillars", (l) => l.cat.includes("pillars") || /pillar|column/i.test(l.name)],
  ["tree", "Trees", (l) => l.cat === "tree" || l.cat === "trees+bushes"],
  ["bushes", "Bushes", (l) => l.cat.includes("bushes") || /bush|shrub/i.test(l.name)],
  ["railing", "Railing and fencing", (l) => l.cat === "railing" || /rail|fenc/i.test(l.name)],
  ["garland", "Garland", (l, t) => /garland/i.test(t)],
  ["stakes", "Stakes and pathway", (l) => l.cat === "stakes/pathway" || /stake|pathway/i.test(l.name)],
  ["bows", "Bows", (l) => /\bbows?\b/i.test(l.name)],
];
const text = (l: Line) => `${l.name} ${l.desc}`;
/** Wreath size in inches from the line text (36", 60'', 48 INCH ...), or null. */
const wreathSize = (l: Line) => {
  if (l.cat !== "wreath" || /\bbows?\b/i.test(l.name)) return null;
  const m = text(l).match(/(\d{2})\s*(?:"|”|''|-?\s*inch)/i);
  return m ? m[1] : "other";
};
function tagsOf(l: Line) {
  const t = text(l);
  const out = MAIN.filter(([, , f]) => f(l, t)).map(([k]) => k);
  const w = wreathSize(l);
  if (w) out.push(`wreath:${w}`);
  if (!out.length) out.push("other");
  return out;
}
const typeLabel = (k: string) => MAIN.find(([x]) => x === k)?.[1] ?? (k.startsWith("wreath:") ? (k === "wreath:other" ? "Wreaths, other" : `${k.slice(7)}" wreath`) : "Other");
/** The buttons: every type the uploaded quotes actually have, in a fixed order, wreaths by size. */
function typesIn(jobs: Job[]) {
  const n = new Map<string, number>();
  for (const j of jobs) for (const l of j.lines) for (const k of tagsOf(l)) n.set(k, (n.get(k) ?? 0) + 1);
  const order = [...MAIN.map(([k]) => k).slice(0, 6), ...[...n.keys()].filter((k) => k.startsWith("wreath:")).sort((a, b) => (parseInt(a.slice(7)) || 999) - (parseInt(b.slice(7)) || 999)), ...MAIN.map(([k]) => k).slice(6), "other"];
  return order.filter((k) => n.get(k)).map((k) => ({ key: k, label: typeLabel(k), n: n.get(k)! }));
}
const MAINKIND: Record<string, string> = { roofline: "roofline", pillars: "pillars", tree: "trees", bushes: "bushes", railing: "railing", stakes: "stakes", garland: "garland" };
/** Other kinds of work priced inside the same line ("Roofline & Pillars"), so its price isn't read as one item's. */
const pricedWith = (l: Line, k: string) => { const base = k.startsWith("roof:") ? "roofline" : k; return tagsOf(l).filter((x) => MAINKIND[x] && x !== base).map((x) => MAINKIND[x]); };
/** One tile per sold line of a type, cheapest first so the prices read as a range. */
const linesOf = (jobs: Job[], c: string) => jobs.flatMap((j) => j.lines.map((l, i) => ({ j, l, i })).filter((x) => tagsOf(x.l).includes(c))).sort((a, b) => a.l.total - b.l.total);
const mid = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** Every real job in the course: the finished install, each line we sold and its price. */
export default function PhotoLibrary() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [cat, setCat] = useState("");
  useEffect(() => { api<{ jobs: Job[] }>("/api/training/jobs").then((r) => setJobs(r.jobs)).catch(() => setJobs([])); }, []);
  if (!jobs) return <Spinner />;
  const types = [{ key: "", label: "Whole houses", n: jobs.length }, ...typesIn(jobs)];
  const tiles = cat ? linesOf(jobs, cat) : [];
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Quote Creation Training</Link>
      <H1 sub="Houses we lit in 2025. Tap a line type to see every one we sold, with the photo and what we charged for that line.">Photo library</H1>
      <div className="flex flex-wrap gap-2">
        {types.map(({ key: k, label, n }) => (
          <button key={k} onClick={() => setCat(k)} className="rounded-full px-3 py-1 text-sm font-semibold border"
            style={cat === k ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#CBD5E1", color: NAVY }}>{label} <span className="opacity-60">{n}</span></button>
        ))}
      </div>
      {cat ? <TypeView k={cat} label={typeLabel(cat)} tiles={tiles} /> : jobs.map((j) => <JobCard key={j.id} j={j} />)}
    </div>
  );
}

type Tile = { j: Job; l: Line; i: number };

/** Every sold line of one type: the finished house, the line, its price; tap for our mockup and the rest of the quote. */
function TypeView({ k, label, tiles }: { k: string; label: string; tiles: Tile[] }) {
  const [open, setOpen] = useState<Tile | null>(null);
  const prices = tiles.map((t) => t.l.total);
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><b>{tiles.length}</b> sold: {label.toLowerCase()}</span>
        <span>Lowest <b>{money(Math.min(...prices))}</b></span>
        <span>Middle <b>{money(mid(prices))}</b></span>
        <span>Highest <b>{money(Math.max(...prices))}</b></span>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <button key={`${t.j.id}:${t.i}`} onClick={() => setOpen(t)} className="text-left rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc(t.j.photos[0])} alt={t.l.name} loading="lazy" className="w-full aspect-[4/3] object-cover bg-slate-900" />
            <div className="p-2">
              <div className="text-lg font-extrabold" style={{ color: NAVY }}>{money(t.l.total)}</div>
              <div className="text-xs font-semibold text-slate-700 line-clamp-2">{t.l.name}{t.l.qty > 1 ? ` × ${t.l.qty}` : ""}</div>
              {pricedWith(t.l, k).length > 0 && <div className="text-[11px] text-slate-500">Price includes {pricedWith(t.l, k).join(" and ")}</div>}
            </div>
          </button>
        ))}
      </div>
      {open && <LineSheet t={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function LineSheet({ t, onClose }: { t: Tile; onClose: () => void }) {
  const counts = useMockups(`pq:${t.j.id}`);
  const { j, l, i } = t;
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: NAVY }}>{money(l.total)}</div>
            <div className="font-semibold">{l.name}{l.qty > 1 ? ` × ${l.qty} at ${money(l.unit)}` : ""}</div>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 inline-flex items-center gap-1"><X size={16} /> Close</button>
        </div>
        {l.desc && <p className="text-sm text-slate-600 whitespace-pre-line">{l.desc}</p>}
        {l.how && <p className="text-xs text-slate-500">{l.how}</p>}
        <Photo id={j.photos[0]} big />
        {counts === null ? <p className="text-xs text-slate-500">Loading our mockup from Jobber…</p>
          : counts[i] > 0 ? <div><div className="text-xs font-semibold text-slate-500 mb-1">Our mockup for this line</div><LineMockups refId={`pq:${j.id}`} line={i} count={counts[i]} big /></div>
          : <p className="text-xs text-slate-500">Jobber has no mockup on this line.</p>}
        <div className="border-t border-slate-100 pt-2 text-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1">The whole quote</div>
          {j.lines.map((x, k) => (
            <div key={k} className={`flex justify-between gap-3 ${k === i ? "font-bold" : ""}`}><span>{x.name}{x.qty > 1 ? ` × ${x.qty}` : ""}</span><span>{money(x.total)}</span></div>
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
