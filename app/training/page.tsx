"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Calculator, CheckCircle2, ChevronRight, Circle, CircleDot, TreePine } from "lucide-react";
import { api, GREEN, Me, NAVY } from "@/components/ui";
import { Card, H1, Spinner } from "./parts";
import { PackUpload } from "./PackUpload";

type Mod = { id: string; title: string; goal: string; status: "not started" | "in progress" | "passed"; detail: string };
type Home = { loaded: boolean; builtAt?: string; modules?: Mod[]; practiceCount?: number };

export default function TrainingHome() {
  const [d, setD] = useState<Home | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const load = () => api<Home>("/api/training").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); api<Me>("/api/me").then(setMe).catch(() => {}); }, []);

  if (!d) return err ? <div className="p-6 text-red-600">{err}</div> : <Spinner />;
  const office = me?.role === "owner" || me?.role === "manager";

  if (!d.loaded) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <H1 sub="How Light DMV quotes holiday lighting, practiced on real past jobs.">Quote training</H1>
        <Card>
          {office ? <PackUpload onDone={load} /> : <p className="text-slate-600">The course isn't loaded yet. Ask Chris or Liam.</p>}
        </Card>
      </div>
    );
  }

  const passed = d.modules!.filter((m) => m.status === "passed").length;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <H1 sub={`${passed} of ${d.modules!.length} modules passed. You're ready to quote when you can price 5 past jobs blind within 10%.`}>Quote training</H1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile href="/training/helper" icon={<Calculator size={18} />} label="Price helper" sub="How would we price this?" />
        <Tile href="/training/trees" icon={<TreePine size={18} />} label="Tree trainer" sub="Price past trees" />
        {office && <Tile href="/training/team" icon={<BarChart3 size={18} />} label="Team progress" sub="Scores and rates" />}
      </div>
      <div className="space-y-2">
        {d.modules!.map((m, i) => (
          <Link key={m.id} href={`/training/${m.id}`} className="block">
            <Card className="flex items-center gap-3 hover:border-slate-400">
              {m.status === "passed" ? <CheckCircle2 color={GREEN} /> : m.status === "in progress" ? <CircleDot color={NAVY} /> : <Circle color="#CBD5E1" />}
              <div className="flex-1 min-w-0">
                <div className="font-bold">{i + 1}. {m.title}</div>
                <div className="text-sm text-slate-500">{m.goal}</div>
                {m.detail && <div className="text-xs text-slate-500 mt-0.5">{m.detail}</div>}
              </div>
              <ChevronRight className="text-slate-400" />
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-400">Practice uses {d.practiceCount?.toLocaleString()} sold quotes from Jobber (2024-25 on), customer names removed.</p>
    </div>
  );
}

function Tile({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-slate-200 p-3 hover:border-slate-400">
      <div className="flex items-center gap-2 font-bold" style={{ color: NAVY }}>{icon}{label}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </Link>
  );
}
