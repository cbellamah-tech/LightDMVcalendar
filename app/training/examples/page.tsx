"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card, H1, money, Spinner } from "../parts";
import { LineMockups, useMockups } from "../Mockups";

type Ex = { id: string; season: string; priority: boolean; photos: string[]; total: number; lines: { name: string; desc: string; qty: number; total: number; optional: boolean; textOnly: boolean; cat: string }[] };
const thumb = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
const open = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** Mockup on the quote next to the finished install, with what each line cost. */
export default function Examples() {
  const [d, setD] = useState<Ex[] | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(8);
  useEffect(() => { api<{ examples: Ex[] }>("/api/training/examples").then((r) => setD(r.examples)).catch((e) => setErr(e.message)); }, []);
  if (!d) return err ? <div className="p-6 text-red-600">{err}</div> : <Spinner />;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> Training</Link>
      <H1 sub="Sold 2025 jobs: what we drew on the quote, what it cost, and what the finished install looked like. Install photos open from Google Drive (sign in with the Light DMV Google account).">Real jobs: mockup to finished</H1>
      {d.slice(0, n).map((e) => <Job key={e.id} e={e} />)}
      {n < d.length && <button className="w-full rounded-lg border border-slate-300 py-2 font-semibold text-sm" style={{ color: NAVY }} onClick={() => setN(n + 8)}>Show more ({d.length - n} left)</button>}
    </div>
  );
}

function Job({ e }: { e: Ex }) {
  const counts = useMockups(`ex:${e.id}`);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const priced = e.lines.filter((l) => !l.textOnly && l.total > 0);
  return (
    <Card className="space-y-3">
      <div className="flex justify-between items-baseline">
        <div className="font-bold">{e.season} job · {priced.length} line{priced.length === 1 ? "" : "s"}</div>
        <div className="font-extrabold" style={{ color: NAVY }}>{money(e.total)} sold</div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Finished install</div>
        <div className="flex gap-2 overflow-x-auto">
          {e.photos.map((p) => bad[p] ? (
            <a key={p} href={open(p)} target="_blank" rel="noreferrer" className="text-sm font-semibold underline" style={{ color: NAVY }}>Open the install photo in Drive</a>
          ) : (
            <a key={p} href={open(p)} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb(p)} alt="Finished install" loading="lazy" onError={() => setBad({ ...bad, [p]: true })} className="h-64 rounded-lg border border-slate-200 object-cover bg-slate-100" />
            </a>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">On the quote</div>
        {e.lines.map((l, i) => l.textOnly || (l.total === 0 && !(counts?.[i])) ? null : (
          <div key={i} className="space-y-1 border-t border-slate-100 pt-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-semibold">{l.name}{l.optional && <span className="ml-2 text-[11px] text-slate-500 font-normal">OPTIONAL</span>}</span>
              <span className="font-bold whitespace-nowrap">{l.total ? money(l.total) : ""}</span>
            </div>
            {counts === null ? <div className="h-28 rounded-lg bg-slate-100 animate-pulse" /> : counts[i] ? <LineMockups refId={`ex:${e.id}`} line={i} count={counts[i]} /> : null}
          </div>
        ))}
        {counts && counts.every((c) => !c) && <p className="text-xs text-slate-400">No mockups came back from Jobber for this quote.</p>}
      </div>
    </Card>
  );
}
