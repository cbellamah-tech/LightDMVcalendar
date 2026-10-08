"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Calculator, CheckCircle2, ChevronRight, Circle, CircleDot, Images } from "lucide-react";
import { api, GREEN, Me, NAVY } from "@/components/ui";
import { Card, H1, Spinner } from "./parts";
import { PackUpload } from "./PackUpload";
import { CourseView } from "@/components/course/CourseView";
import { QuotePractice } from "./QuotePractice";

type Mod = { id: string; title: string; goal: string; status: "not started" | "in progress" | "passed"; detail: string };
type Home = { loaded: boolean; builtAt?: string; modules?: Mod[]; practiceCount?: number };

export default function TrainingHome() {
  const [d, setD] = useState<Home | null>(null);
  const [course, setCourse] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const load = () => api<Home>("/api/training").then(setD).catch((e) => setErr(e.message));
  useEffect(() => {
    load(); api<Me>("/api/me").then(setMe).catch(() => {});
    api<{ loaded: boolean }>("/api/training/course").then((r) => setCourse(r.loaded)).catch(() => setCourse(false));
  }, []);

  if (!d || course === null) return err ? <div className="p-6 text-red-600">{err}</div> : <Spinner />;
  const office = me?.role === "owner" || me?.role === "manager";

  // Training files from the rebuild carry the quote course in the same engine as the installer course.
  if (course) {
    return (
      <CourseView id="quote" base="/api/training/course" title="Quote training" teamHref="/training/team" teamRoles={["owner", "manager"]}
        sub="How to build a Light DMV quote the way we really do it: read the request, size up the house, measure, choose the lines, price them."
        signoffNote="An owner signs you off once they've watched you quote a real house."
        practice={(m, onProgress, prog) => <QuotePractice m={m} onProgress={onProgress} prog={prog} />}
        extra={
          <div className="grid grid-cols-2 gap-2">
            <Tile href="/training/jobs" icon={<Images size={18} />} label="Photo library" sub="Every real job, every line, every price" />
            <Tile href="/training/helper" icon={<Calculator size={18} />} label="Price helper" sub="How would we price this?" />
          </div>
        } />
    );
  }

  if (!d.loaded) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <H1 sub="How to build a Light DMV holiday lighting quote, practiced on real jobs.">Quote training</H1>
        <Card>
          {office ? <PackUpload onDone={load} /> : <p className="text-slate-600">The course isn't loaded yet. Ask Chris or Liam.</p>}
        </Card>
      </div>
    );
  }

  const passed = d.modules!.filter((m) => m.status === "passed").length;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <H1 sub={`${passed} of ${d.modules!.length} modules passed. How to build a Light DMV quote, from the house to the price of every line. You're ready when 5 real jobs in a row land within 10% of what we charged.`}>Quote training</H1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile href="/training/jobs" icon={<Images size={18} />} label="Photo library" sub="Every real job, every line, every price" />
        <Tile href="/training/helper" icon={<Calculator size={18} />} label="Price helper" sub="How would we price this?" />
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
      <p className="text-xs text-slate-400">Practice uses {d.practiceCount?.toLocaleString()} real jobs we sold and installed in 2025, with their finished-install photos. Prices are from Jobber; customer names removed.</p>
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
