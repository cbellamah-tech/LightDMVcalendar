"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card, H1, money, Photo, Spinner } from "../parts";
import { LineMockups, useMockups } from "../Mockups";

type Line = { name: string; desc: string; qty: number; unit: number; total: number; cat: string; how: string };
type Job = { id: string; season: string; photos: string[]; lines: Line[]; included: string[]; total: number; featured: boolean };

const CATS: [string, string][] = [["", "All"], ["roofline", "Roofline"], ["pillars", "Pillars"], ["tree", "Trees"], ["bushes", "Bushes"], ["wreath", "Wreaths"], ["railing", "Railing"], ["stakes/pathway", "Stakes"]];
const has = (j: Job, c: string) => !c || j.lines.some((l) => l.cat === c || (c === "roofline" && l.cat === "roofline+pillars") || (c === "pillars" && l.cat === "roofline+pillars"));

/** Every real job in the course: the finished install, each line we sold and its price. */
export default function PhotoLibrary() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [cat, setCat] = useState("");
  useEffect(() => { api<{ jobs: Job[] }>("/api/training/jobs").then((r) => setJobs(r.jobs)).catch(() => setJobs([])); }, []);
  if (!jobs) return <Spinner />;
  const shown = jobs.filter((j) => has(j, cat));
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Training</Link>
      <H1 sub="Houses we lit in 2025: what it looks like finished, each line on the quote and what we charged.">Photo library</H1>
      <div className="flex flex-wrap gap-2">
        {CATS.map(([k, label]) => (
          <button key={k} onClick={() => setCat(k)} className="rounded-full px-3 py-1 text-sm font-semibold border"
            style={cat === k ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#CBD5E1", color: NAVY }}>{label}</button>
        ))}
      </div>
      {shown.map((j) => <JobCard key={j.id} j={j} />)}
      {!shown.length && <p className="text-slate-500">No jobs with that line type.</p>}
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
