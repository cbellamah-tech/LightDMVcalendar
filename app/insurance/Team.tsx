"use client";

import { useEffect, useState } from "react";
import { FileText, Phone } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import type { InsuranceData, Policy, Sub, WorkerClass } from "@/lib/insurance";
import { checksFor, LOOK, SubForm, worst, type Check, type Level, type OurLimits } from "./Subs";

/* The simple view: every person, how they're classed, and whether they're covered and by what.
   1099s are checked against our subcontractor rules instead of our own policies. */

type Person = { id: string; name: string; role: string; crew?: string; phone?: string };
type Row = { key: string; name: string; info: string[]; phone?: string; cls: WorkerClass; userId?: string; sub?: Sub; lines: Check[]; level: Level; headline: string };

const CLASS_LABEL: Record<WorkerClass, string> = { owner: "Owner", w2: "W-2 employee", "1099": "1099 sub", unset: "Not set" };
const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", lead: "Crew lead", crew: "Crew" };
const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();

function coverage(d: InsuranceData, ours: OurLimits, cls: WorkerClass, name: string, sub: Sub | undefined): { lines: Check[]; headline: string; level: Level } {
  const active = (kind: string) => d.policies.find((p) => p.kind === kind && p.status === "active");
  const wc = active("wc"), auto = active("auto");
  const gl = d.policies.find((p) => p.status === "active" && p.limits.some((l) => l.label === "Each occurrence"));
  const listed = !!auto?.drivers?.some((x) => first(x) === first(name));
  // Short name people use: the broker for the BOP (biBERK), else the carrier's first word (Progressive).
  const carrier = (p: Policy) => (p.kind === "bop" ? p.broker?.name : null) ?? (p.carrier ?? "").split(" ")[0];

  const drive: Check = !auto ? { label: "Driving a van", level: "bad", text: "No auto policy on file" }
    : listed ? { label: "Driving a van", level: "ok", text: `Listed driver on ${carrier(auto)} auto` }
      : { label: "Driving a van", level: "soon", text: `Not a listed driver on ${carrier(auto)}: keep off the vans or add them` };

  if (cls === "1099") {
    if (!sub) {
      const missing: Check = { label: "Our 1099 rules", level: "bad", text: "No papers on file: hold harmless, workers' comp, liability certificate" };
      return { lines: [missing, drive], headline: "Not following our 1099 rules", level: "bad" };
    }
    const checks = checksFor(sub, ours);
    const met = checks.filter((c) => c.level === "ok").length;
    const level = worst(checks.map((c) => c.level));
    const hurt = checks[1], damage = checks[2];
    const rules: Check = {
      label: "Our 1099 rules", level,
      text: met === checks.length ? "All 6 met" : `${met} of ${checks.length} met. Missing: ${checks.filter((c) => c.level !== "ok").map((c) => c.label.toLowerCase()).join(", ")}`,
    };
    return {
      lines: [
        { label: "If they get hurt", level: hurt.level, text: hurt.level === "ok" ? `Their own workers' comp${sub.workersComp.carrier ? ` (${sub.workersComp.carrier})` : ""}` : hurt.text },
        { label: "If they damage a home", level: damage.level, text: damage.level === "ok" ? `Their own liability${sub.gl.carrier ? ` (${sub.gl.carrier})` : ""}, then ours` : damage.text },
        rules,
        drive,
      ],
      headline: level === "ok" ? "Following our 1099 rules" : "Not following our 1099 rules yet",
      level,
    };
  }

  const hurt: Check = wc ? { label: "If they get hurt", level: "ok", text: `Workers' comp (${carrier(wc)})` }
    : cls === "owner" ? { label: "If they get hurt", level: "soon", text: "Not covered (owners aren't on workers' comp)" }
      : { label: "If they get hurt", level: "bad", text: "Not covered. No workers' comp yet" };
  const glRisk = d.coverage.find((r) => r.id === "customer-property")?.status;
  const damage: Check = !gl ? { label: "If they damage a home", level: "bad", text: "No liability policy on file" }
    : { label: "If they damage a home", level: glRisk === "partial" ? "soon" : "ok", text: `Our liability (${carrier(gl)})${glRisk === "partial" ? ". Roof work may be refused (classed as landscaping)" : ""}` };
  const lines = [hurt, damage, drive];
  if (cls === "unset") lines.unshift({ label: "Classification", level: "unknown", text: "Pick W-2 or 1099 so we know which rules apply" });
  const level = worst(lines.map((c) => c.level));
  const headline = hurt.level === "bad" ? "Not covered if hurt" : level === "ok" ? "Covered" : "Partly covered";
  return { lines, headline, level };
}

export function Team({ d, ours, subs, setSubs }: { d: InsuranceData; ours: OurLimits; subs: Sub[] | null; setSubs: (s: Sub[]) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [team, setTeam] = useState<Record<string, WorkerClass>>({});
  const [adding, setAdding] = useState<{ name: string; sub: Sub | null } | null>(null);
  useEffect(() => {
    api<{ people: Person[]; team: Record<string, WorkerClass> }>("/api/insurance/team")
      .then((r) => { setPeople(r.people); setTeam(r.team); }).catch(() => setPeople([]));
  }, []);

  async function classify(userId: string, cls: WorkerClass) {
    setTeam({ ...team, [userId]: cls });
    setTeam((await api<{ team: Record<string, WorkerClass> }>("/api/insurance/team", { method: "POST", json: { userId, cls } })).team);
  }

  const activeSubs = (subs ?? []).filter((s) => s.active);
  const used = new Set<string>();
  const rows: Row[] = (people ?? []).map((p) => {
    const cls = team[p.id] ?? (p.role === "owner" ? "owner" : "unset");
    const sub = cls === "1099" ? activeSubs.find((s) => s.name.toLowerCase() === p.name.toLowerCase()) ?? activeSubs.find((s) => first(s.name) === first(p.name)) : undefined;
    if (sub) used.add(sub.id);
    return { key: p.id, userId: p.id, name: p.name, phone: p.phone, cls, sub, info: [ROLE_LABEL[p.role] ?? p.role, p.crew].filter(Boolean) as string[], ...coverage(d, ours, cls, p.name, sub) };
  });
  for (const s of activeSubs) if (!used.has(s.id)) {
    rows.push({ key: `sub-${s.id}`, name: s.name, phone: s.phone, cls: "1099", sub: s, info: [s.company ?? "Subcontractor", "no app login"], ...coverage(d, ours, "1099", s.name, s) });
  }
  const notCovered = rows.filter((r) => r.level === "bad").length;
  const ok = rows.filter((r) => r.level === "ok").length;

  return (
    <section id="team">
      <div className="mb-3">
        <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>Who&apos;s covered</h2>
        <p className="text-sm text-slate-500">Everyone on the team, how they&apos;re classed, and what covers them. Change the classification with the dropdown.</p>
      </div>
      {people === null ? <p className="text-sm text-slate-500">Loading…</p> : (
        <>
          <div className="flex flex-wrap gap-2 mb-3 text-xs font-semibold">
            <span className="rounded-full px-3 py-1 bg-slate-100 text-slate-700">{rows.length} people</span>
            <span className="rounded-full px-3 py-1" style={{ background: LOOK.ok.bg, color: LOOK.ok.fg }}>{ok} fully covered</span>
            {notCovered > 0 && <span className="rounded-full px-3 py-1" style={{ background: LOOK.bad.bg, color: LOOK.bad.fg }}>{notCovered} not covered</span>}
          </div>
          {adding && (
            <SubForm sub={adding.sub} name={adding.name} onClose={() => setAdding(null)} onSaved={(s) => { setSubs(s); setAdding(null); }} />
          )}
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {rows.map((r) => {
              const L = LOOK[r.level];
              return (
                <div key={r.key} className="p-3 md:p-4 grid md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] gap-3 md:items-start">
                  <div className="min-w-0">
                    <div className="font-bold">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.info.join(" · ")}</div>
                    {r.phone && <a href={`tel:${r.phone}`} className="text-xs text-slate-500 inline-flex items-center gap-1 mt-0.5"><Phone size={11} /> {r.phone}</a>}
                    <div className="mt-2">
                      {r.userId ? (
                        <select aria-label={`Classification for ${r.name}`} value={r.cls} onChange={(e) => classify(r.userId!, e.target.value as WorkerClass)}
                          className="text-sm rounded-lg border border-slate-300 px-2 py-1 font-semibold" style={{ color: r.cls === "unset" ? LOOK.unknown.fg : NAVY }}>
                          {(Object.keys(CLASS_LABEL) as WorkerClass[]).map((c) => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}
                        </select>
                      ) : <span className="text-sm font-semibold" style={{ color: NAVY }}>1099 sub</span>}
                    </div>
                  </div>
                  <ul className="space-y-1 min-w-0">
                    {r.lines.map((c) => {
                      const C = LOOK[c.level];
                      return (
                        <li key={c.label} className="flex gap-2 text-sm">
                          <C.icon size={16} className="shrink-0 mt-0.5" style={{ color: C.fg }} />
                          <span className="min-w-0"><b className="font-semibold">{c.label}:</b> <span style={{ color: c.level === "ok" ? "#475467" : C.fg }}>{c.text}</span></span>
                        </li>
                      );
                    })}
                    {r.cls === "1099" && (
                      <li>
                        <button onClick={() => setAdding({ name: r.name, sub: r.sub ?? null })} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1 border border-slate-300 hover:bg-slate-50">
                          <FileText size={13} /> {r.sub ? "Update their papers" : "Add their papers"}
                        </button>
                      </li>
                    )}
                  </ul>
                  <span className="justify-self-start md:justify-self-end text-xs font-bold rounded-full px-3 py-1 whitespace-nowrap" style={{ background: L.bg, color: L.fg }}>
                    {r.headline}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">Add people on the People page; add 1099 subs without a login in Subcontractors below.</p>
        </>
      )}
    </section>
  );
}
