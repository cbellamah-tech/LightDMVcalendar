"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api, Me, NAVY } from "@/components/ui";
import { Block, Blocks, Card, H1, Spinner } from "../training/parts";
import { PackUpload } from "../training/PackUpload";

type Step = { title: string; blocks: Block[] };
type Guide = { loaded: boolean; intro?: Block[]; parts?: { title: string; intro: Block[]; steps: Step[] }[]; ownerTodo?: { title: string; intro: Block[] } | null };

/** Install tab: every step of an install and a takedown, photos first. */
export default function InstallGuide() {
  const [g, setG] = useState<Guide | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [part, setPart] = useState(0);
  const load = () => api<Guide>("/api/install").then(setG).catch(() => setG({ loaded: false }));
  useEffect(() => { load(); api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  if (!g) return <Spinner />;
  const office = me?.role === "owner" || me?.role === "manager";
  if (!g.loaded) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <H1 sub="Every step of an install and a takedown.">Install guide</H1>
        <Card>{office ? <PackUpload onDone={load} /> : <p className="text-slate-600">The guide isn't loaded yet. Ask Chris or Liam.</p>}</Card>
      </div>
    );
  }
  const p = g.parts![part];
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <H1>Install guide</H1>
      <div className="flex gap-2">
        {g.parts!.map((x, i) => (
          <button key={i} onClick={() => setPart(i)} className="flex-1 rounded-lg py-2 font-bold text-sm border"
            style={i === part ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#CBD5E1", color: NAVY }}>{x.title}</button>
        ))}
      </div>
      {g.intro && g.intro.length > 0 && part === 0 && <Card><Blocks blocks={g.intro} /></Card>}
      {p.intro.length > 0 && <Card><Blocks blocks={p.intro} /></Card>}
      {p.steps.map((s, i) => <StepCard key={`${part}-${i}`} s={s} first={i === 0} />)}
      {office && g.ownerTodo && <Card className="border-amber-300 bg-amber-50"><div className="font-bold mb-2">{g.ownerTodo.title} (only owners see this)</div><Blocks blocks={g.ownerTodo.intro} /></Card>}
    </div>
  );
}

function StepCard({ s, first }: { s: Step; first: boolean }) {
  const [open, setOpen] = useState(first);
  return (
    <Card className="space-y-3">
      <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>{s.title}</h2>
        {open ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
      </button>
      {open && <Blocks blocks={s.blocks} />}
    </Card>
  );
}
