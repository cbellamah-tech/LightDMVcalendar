"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card, H1, imgSrc, money, Photo, Spinner } from "../parts";
import { LineMockups, useMockups } from "../Mockups";

type Line = { name: string; desc: string; qty: number; unit: number; total: number; cat: string; how: string };
type Job = { id: string; season: string; photos: string[]; lines: Line[]; included: string[]; total: number; featured: boolean };

const CATS: [string, string][] = [["", "Whole houses"], ["roofline", "Roofline"], ["pillars", "Pillars"], ["tree", "Trees"], ["bushes", "Bushes"], ["wreath", "Wreaths"], ["railing", "Railing"], ["stakes/pathway", "Stakes"], ["other", "Other"]];
const parts = (cat: string) => (cat === "roofline+pillars" ? ["roofline", "pillars"] : cat === "trees+bushes" ? ["tree", "bushes"] : [cat]);
const inCat = (l: Line, c: string) => parts(l.cat).includes(c);
/** One tile per sold line of a type, priciest last so the cheap ones are first to compare. */
const linesOf = (jobs: Job[], c: string) => jobs.flatMap((j) => j.lines.map((l, i) => ({ j, l, i })).filter((x) => inCat(x.l, c))).sort((a, b) => a.l.total - b.l.total);
const mid = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** Every real job in the course: the finished install, each line we sold and its price. */
export default function PhotoLibrary() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [cat, setCat] = useState("");
  useEffect(() => { api<{ jobs: Job[] }>("/api/training/jobs").then((r) => setJobs(r.jobs)).catch(() => setJobs([])); }, []);
  if (!jobs) return <Spinner />;
  const count = (c: string) => (c ? linesOf(jobs, c).length : jobs.length);
  const tiles = cat ? linesOf(jobs, cat) : [];
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Quote Creation Training</Link>
      <H1 sub="Houses we lit in 2025. Tap a line type to see every one we sold, with the photo and what we charged for that line.">Photo library</H1>
      <div className="flex flex-wrap gap-2">
        {CATS.filter(([k]) => count(k) > 0).map(([k, label]) => (
          <button key={k} onClick={() => setCat(k)} className="rounded-full px-3 py-1 text-sm font-semibold border"
            style={cat === k ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#CBD5E1", color: NAVY }}>{label} <span className="opacity-60">{count(k)}</span></button>
        ))}
      </div>
      {cat ? <TypeView label={CATS.find(([k]) => k === cat)![1]} tiles={tiles} /> : jobs.map((j) => <JobCard key={j.id} j={j} />)}
    </div>
  );
}

type Tile = { j: Job; l: Line; i: number };

/** Every sold line of one type: the finished house, the line, its price; tap for our mockup and the rest of the quote. */
function TypeView({ label, tiles }: { label: string; tiles: Tile[] }) {
  const [open, setOpen] = useState<Tile | null>(null);
  const prices = tiles.map((t) => t.l.total);
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><b>{tiles.length}</b> {label.toLowerCase()} lines sold</span>
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
              {t.l.cat.includes("+") && <div className="text-[11px] text-slate-500">Priced together with {t.l.cat === "roofline+pillars" ? "pillars" : "bushes"}</div>}
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
