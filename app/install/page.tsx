"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api, Me, NAVY } from "@/components/ui";
import { Block, Blocks, Card, H1, Spinner } from "../training/parts";
import { PackUpload } from "../training/PackUpload";

type Mod = { title: string; blocks: Block[] };
type Guide = { loaded: boolean; intro?: Block[]; modules?: Mod[]; ownerTodo?: Mod | null };

/** Install tab: the installer course, one module per card, photos and videos first. */
export default function InstallGuide() {
  const [g, setG] = useState<Guide | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const load = () => api<Guide>("/api/install").then(setG).catch(() => setG({ loaded: false }));
  useEffect(() => { load(); api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  if (!g) return <Spinner />;
  const office = me?.role === "owner" || me?.role === "manager";
  if (!g.loaded || !g.modules) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <H1 sub="Every step of an install and a takedown.">Installer course</H1>
        <Card>{office ? <PackUpload onDone={load} /> : <p className="text-slate-600">The course isn't loaded yet. Ask Chris or Liam.</p>}</Card>
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <H1>Installer course</H1>
      {g.intro && g.intro.length > 0 && <Card><Blocks blocks={g.intro} /></Card>}
      {g.modules.map((m, i) => <ModuleCard key={i} m={m} />)}
      {office && g.ownerTodo && <Card className="border-amber-300 bg-amber-50"><div className="font-bold mb-2">{g.ownerTodo.title} (only owners see this)</div><Blocks blocks={g.ownerTodo.blocks} /></Card>}
    </div>
  );
}

function ModuleCard({ m }: { m: Mod }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3">
      <button className="w-full flex items-center justify-between text-left gap-3" onClick={() => setOpen(!open)}>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>{m.title}</h2>
        {open ? <ChevronUp className="text-slate-400 shrink-0" /> : <ChevronDown className="text-slate-400 shrink-0" />}
      </button>
      {open && <Blocks blocks={m.blocks} />}
    </Card>
  );
}
