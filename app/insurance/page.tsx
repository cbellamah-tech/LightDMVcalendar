"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2, CalendarClock, Check, CircleCheck, CircleHelp, CirclePause, Copy, ExternalLink, Eye, EyeOff,
  FileText, Flame, HardHat, Home, KeyRound, Mail, PenLine, Phone, ShieldCheck, TriangleAlert, Truck,
  Umbrella, Upload, User, Users, Warehouse, Wrench,
} from "lucide-react";
import { api, NAVY } from "@/components/ui";
import type { CoverageStatus, InsuranceData, InsuranceView, Limit, Policy, Risk } from "@/lib/insurance";

/* ---------- look ---------- */
const STATUS: Record<CoverageStatus, { label: string; fg: string; bg: string; ring: string; icon: typeof CircleCheck }> = {
  gap: { label: "Not covered", fg: "#B42318", bg: "#FEF3F2", ring: "#FDA29B", icon: TriangleAlert },
  unknown: { label: "Can't confirm", fg: "#475467", bg: "#F2F4F7", ring: "#D0D5DD", icon: CircleHelp },
  partial: { label: "Partly covered", fg: "#B54708", bg: "#FFFAEB", ring: "#FEC84B", icon: CirclePause },
  covered: { label: "Covered", fg: "#067647", bg: "#ECFDF3", ring: "#75E0A7", icon: CircleCheck },
};
const ORDER: CoverageStatus[] = ["gap", "unknown", "partial", "covered"];
const POLICY_STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  active: { label: "Active", fg: "#067647", bg: "#ECFDF3" },
  check: { label: "Check if cancelled", fg: "#B54708", bg: "#FFFAEB" },
  expired: { label: "Expired", fg: "#475467", bg: "#F2F4F7" },
  missing: { label: "Not on file", fg: "#B42318", bg: "#FEF3F2" },
};
const ICONS: Record<string, typeof Home> = {
  ladder: HardHat, home: Home, user: User, flame: Flame, truck: Truck, wrench: Wrench, warehouse: Warehouse,
  pause: CirclePause, key: KeyRound, umbrella: Umbrella, users: Users, pen: PenLine,
};
const KIND_LABEL: Record<string, string> = {
  bop: "Business owner's", auto: "Commercial auto", wc: "Workers' comp", umbrella: "Umbrella", equipment: "Equipment",
};

/* ---------- helpers ---------- */
const DAY = 86_400_000;
const parse = (d: string) => new Date(`${d}T12:00:00`);
const fmtDate = (d: string | null | undefined) =>
  d ? parse(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—";
const daysUntil = (d: string) => Math.round((parse(d).getTime() - Date.now()) / DAY);
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const limitText = (l: Limit) => (l.amount != null ? money(l.amount) : l.text ?? "—");
const mask = (n: string) => `•••• ${n.slice(-4)}`;
const inDays = (n: number) => (n === 0 ? "today" : n > 0 ? `in ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} ago`);

type Dated = { date: string; title: string; sub: string; tone: "red" | "amber" | "navy" };

function upcoming(d: InsuranceData): Dated[] {
  const out: Dated[] = [];
  for (const p of d.policies) {
    if (p.expires && (p.status === "active" || p.status === "check")) {
      out.push({ date: p.expires, title: `${p.title} ${p.status === "check" ? "runs to" : "renews"}`, sub: p.carrier ?? "", tone: "navy" });
    }
  }
  for (const r of d.requirements) for (const i of r.items) {
    if (i.due && i.met !== "yes") out.push({ date: i.due, title: `${r.who.split(/[:(]/)[0].trim()}: ${i.text}`, sub: r.who, tone: "amber" });
  }
  for (const a of d.actions) if (a.due) out.push({ date: a.due, title: a.title, sub: "To-do", tone: "red" });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- page ---------- */
export default function InsurancePage() {
  const [view, setView] = useState<InsuranceView | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<InsuranceView>("/api/insurance").then(setView).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="max-w-5xl mx-auto p-4 text-red-700">{err}</div>;
  if (!view) return <div className="max-w-5xl mx-auto p-4 text-slate-500">Loading…</div>;
  if (!view.data) return <Empty onLoaded={setView} />;
  return <Dashboard view={view} setView={setView} />;
}

function Empty({ onLoaded }: { onLoaded: (v: InsuranceView) => void }) {
  return (
    <div className="max-w-2xl mx-auto p-4 pt-10 text-center space-y-4">
      <ShieldCheck size={48} className="mx-auto" style={{ color: NAVY }} />
      <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Insurance</h1>
      <p className="text-slate-600">
        Every policy, what is and isn&apos;t covered, renewals and certificates in one place. Policy details stay in the
        database, not the app code, so load them once from <b>insurance.json</b>.
      </p>
      <UploadButton onLoaded={onLoaded} primary />
    </div>
  );
}

function Dashboard({ view, setView }: { view: InsuranceView; setView: (v: InsuranceView) => void }) {
  const d = view.data!;
  const policyById = useMemo(() => Object.fromEntries(d.policies.map((p) => [p.id, p])), [d]);
  const counts = useMemo(() => {
    const c: Record<CoverageStatus, number> = { gap: 0, unknown: 0, partial: 0, covered: 0 };
    for (const r of d.coverage) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [d]);
  const score = d.coverage.length ? Math.round(((counts.covered + counts.partial * 0.5) / d.coverage.length) * 100) : 0;
  const dates = useMemo(() => upcoming(d), [d]);
  const next = dates.find((x) => daysUntil(x.date) >= 0);
  const active = d.policies.filter((p) => p.status === "active").length;
  const openTodos = d.actions.filter((a) => !view.done[a.id]).length;

  return (
    <div className="pb-10">
      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1E4A8A 100%)` }} className="text-white">
        <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 flex flex-col md:flex-row md:items-center gap-6">
          <ScoreRing score={score} />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest opacity-70 font-semibold">Owners only</div>
            <h1 className="text-2xl md:text-3xl font-extrabold">Insurance &amp; coverage</h1>
            <p className="opacity-80 text-sm mt-1">{d.company.name} · {d.company.address}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Stat n={active} label="active policies" />
              <Stat n={counts.gap} label="gaps" warn={counts.gap > 0} />
              <Stat n={openTodos} label="to-dos open" />
              <Stat n={next ? daysUntil(next.date) : "—"} label={next ? `days to ${next.tone === "navy" ? "renewal" : "deadline"}` : "no dates"} />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 space-y-8 mt-6">
        <DueSoon dates={dates} />

        {/* Coverage map */}
        <section>
          <SectionHead title="Coverage map" sub="What happens if… and whether a policy pays." />
          <div className="flex flex-wrap gap-2 mb-3">
            {ORDER.map((s) => <Pill key={s} status={s} n={counts[s]} />)}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...d.coverage].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map((r) => (
              <RiskCard key={r.id} r={r} policyById={policyById} />
            ))}
          </div>
        </section>

        <Todos d={d} done={view.done} onChange={(done) => setView({ ...view, done })} />

        <Timeline d={d} dates={dates} />

        {/* Policies */}
        <section>
          <SectionHead title="Policies" sub="Policy numbers are hidden until you tap the eye." />
          <div className="grid lg:grid-cols-2 gap-3">
            {[...d.policies].sort((a, b) => ["active", "check", "missing", "expired"].indexOf(a.status) - ["active", "check", "missing", "expired"].indexOf(b.status))
              .map((p) => <PolicyCard key={p.id} p={p} />)}
          </div>
        </section>

        {d.requirements.length > 0 && (
          <section>
            <SectionHead title="What others require of us" sub="Lease, lender and subcontractor rules, checked against our policies." />
            <div className="grid lg:grid-cols-3 gap-3">
              {d.requirements.map((r) => (
                <div key={r.who} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="font-bold text-sm">{r.who}</div>
                  <ul className="mt-2 space-y-1.5">
                    {r.items.map((i) => (
                      <li key={i.text} className="flex gap-2 text-sm">
                        <MetDot met={i.met} />
                        <span className={i.met === "yes" ? "text-slate-500" : ""}>{i.text}</span>
                      </li>
                    ))}
                  </ul>
                  {r.source && <SourceLink doc={r.source} />}
                </div>
              ))}
            </div>
          </section>
        )}

        {d.vehicles.length > 0 && (
          <section>
            <SectionHead title="Vans" sub="Each van should be listed on the auto policy for business use." />
            <div className="grid sm:grid-cols-2 gap-3">
              {d.vehicles.map((v) => {
                const p = v.policyId ? policyById[v.policyId] : null;
                const ok = p?.status === "active";
                return (
                  <div key={v.label} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3">
                    <div className="rounded-lg p-2 h-fit" style={{ background: ok ? STATUS.covered.bg : STATUS.unknown.bg }}>
                      <Truck size={22} style={{ color: ok ? STATUS.covered.fg : STATUS.unknown.fg }} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold">{v.label}</div>
                      {v.vinLast6 && <div className="text-xs text-slate-500">VIN ending {v.vinLast6}</div>}
                      {v.note && <div className="text-sm text-slate-600 mt-1">{v.note}</div>}
                      <div className="text-xs font-semibold mt-1" style={{ color: ok ? STATUS.covered.fg : STATUS.gap.fg }}>
                        {ok ? `Insured: ${p!.carrier}` : "Auto policy not on file yet"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <Certificates d={d} policyById={policyById} />

        {/* Data */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600 space-y-2">
          <div className="font-bold text-slate-900">Where this comes from</div>
          {d.sourcesNote && <p>{d.sourcesNote}</p>}
          <p>Built {fmtDate(d.generatedAt.slice(0, 10))}{view.updatedAt ? `, loaded ${fmtDate(view.updatedAt.slice(0, 10))}` : ""}. Upload a newer insurance.json to refresh; ticked to-dos are kept.</p>
          <UploadButton onLoaded={setView} />
        </section>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */
function ScoreRing({ score }: { score: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const color = score >= 80 ? "#75E0A7" : score >= 50 ? "#FEC84B" : "#FDA29B";
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-extrabold leading-none">{score}%</div>
        <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">covered</div>
      </div>
    </div>
  );
}

function Stat({ n, label, warn }: { n: number | string; label: string; warn?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: warn ? "rgba(253,162,155,0.25)" : "rgba(255,255,255,0.1)" }}>
      <div className="text-xl font-extrabold">{n}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>{title}</h2>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

function Pill({ status, n }: { status: CoverageStatus; n: number }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: s.bg, color: s.fg }}>
      <s.icon size={14} /> {n} {s.label.toLowerCase()}
    </span>
  );
}

function RiskCard({ r, policyById }: { r: Risk; policyById: Record<string, Policy> }) {
  const s = STATUS[r.status];
  const Icon = ICONS[r.icon] ?? ShieldCheck;
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-2" style={{ borderColor: s.ring, borderLeftWidth: 5 }}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2 shrink-0" style={{ background: s.bg }}><Icon size={20} style={{ color: s.fg }} /></div>
        <div className="min-w-0">
          <div className="font-bold leading-snug">{r.risk}</div>
          <div className="text-xs font-semibold mt-0.5 inline-flex items-center gap-1" style={{ color: s.fg }}>
            <s.icon size={12} /> {s.label}
          </div>
        </div>
      </div>
      <p className="text-sm text-slate-600">{r.detail}</p>
      {r.action && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: s.bg, color: s.fg }}>
          <b>Next step:</b> {r.action}
        </p>
      )}
      {r.policyIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {r.policyIds.map((id) => policyById[id] && (
            <a key={id} href={`#policy-${id}`} className="text-[11px] font-semibold rounded-md px-2 py-0.5 bg-slate-100 text-slate-600 hover:bg-slate-200">
              {policyById[id].title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DueSoon({ dates }: { dates: Dated[] }) {
  const soon = dates.filter((x) => daysUntil(x.date) <= 60);
  if (!soon.length) return null;
  return (
    <section className="rounded-xl border p-4 flex gap-3" style={{ borderColor: STATUS.partial.ring, background: STATUS.partial.bg }}>
      <CalendarClock className="shrink-0" style={{ color: STATUS.partial.fg }} />
      <div className="space-y-1">
        <div className="font-bold" style={{ color: STATUS.partial.fg }}>Due in the next 60 days</div>
        {soon.map((x) => (
          <div key={x.title + x.date} className="text-sm">
            <b>{x.title}</b> · {fmtDate(x.date)} ({inDays(daysUntil(x.date))})
          </div>
        ))}
      </div>
    </section>
  );
}

function Todos({ d, done, onChange }: { d: InsuranceData; done: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  const [busy, setBusy] = useState("");
  if (!d.actions.length) return null;
  const tone = { high: STATUS.gap, medium: STATUS.partial, low: STATUS.unknown };
  async function toggle(id: string) {
    setBusy(id);
    try { onChange((await api<{ done: Record<string, string> }>("/api/insurance", { method: "PATCH", json: { id, done: !done[id] } })).done); }
    finally { setBusy(""); }
  }
  const sorted = [...d.actions].sort((a, b) => (+!!done[a.id] - +!!done[b.id]) || ["high", "medium", "low"].indexOf(a.priority) - ["high", "medium", "low"].indexOf(b.priority));
  return (
    <section>
      <SectionHead title="Fix list" sub="Tick each one off when it's done. Liam sees the same list." />
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {sorted.map((a) => {
          const isDone = !!done[a.id];
          return (
            <button key={a.id} onClick={() => toggle(a.id)} disabled={busy === a.id}
              className="w-full text-left flex gap-3 p-3 hover:bg-slate-50 disabled:opacity-60">
              <span className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                style={{ borderColor: isDone ? STATUS.covered.fg : "#CBD5E1", background: isDone ? STATUS.covered.fg : "white" }}>
                {isDone && <Check size={14} color="white" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`font-semibold ${isDone ? "line-through text-slate-400" : ""}`}>{a.title}</span>
                {!isDone && (
                  <span className="ml-2 text-[10px] uppercase font-bold rounded px-1.5 py-0.5 align-middle" style={{ background: tone[a.priority].bg, color: tone[a.priority].fg }}>
                    {a.priority}
                  </span>
                )}
                <span className="block text-sm text-slate-500">
                  {isDone ? `Done by ${done[a.id].split(" · ")[0]}` : a.detail}
                  {!isDone && a.due ? ` Due ${fmtDate(a.due)}.` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Timeline({ d, dates }: { d: InsuranceData; dates: Dated[] }) {
  const start = Date.now() - 30 * DAY, span = 395 * DAY;
  const items = dates.filter((x) => { const t = parse(x.date).getTime(); return t >= start && t <= start + span; });
  if (!items.length) return null;
  const months = Array.from({ length: 13 }, (_, i) => { const m = new Date(start); m.setDate(1); m.setMonth(m.getMonth() + i + 1); return m; })
    .filter((m) => m.getTime() < start + span);
  const pos = (t: number) => `${((t - start) / span) * 100}%`;
  const color = { red: STATUS.gap.fg, amber: "#DC6803", navy: NAVY };
  return (
    <section>
      <SectionHead title="Next 12 months" sub="Renewals and deadlines." />
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="relative h-10 mx-2">
          <div className="absolute inset-x-0 top-5 h-1 rounded bg-slate-200" />
          <div className="absolute top-3 w-0.5 h-5 bg-slate-900" style={{ left: pos(Date.now()) }} title="Today" />
          {months.map((m) => (
            <div key={m.toISOString()} className="absolute top-7 text-[10px] text-slate-400 -translate-x-1/2" style={{ left: pos(m.getTime()) }}>
              {m.toLocaleDateString([], { month: "short" })}
            </div>
          ))}
          {items.map((x) => (
            <div key={x.title + x.date} className="absolute top-3.5 w-4 h-4 rounded-full border-2 border-white -translate-x-1/2 shadow"
              style={{ left: pos(parse(x.date).getTime()), background: color[x.tone] }} title={`${x.title} · ${fmtDate(x.date)}`} />
          ))}
        </div>
        <ul className="mt-6 grid sm:grid-cols-2 gap-2">
          {items.map((x) => (
            <li key={x.title + x.date} className="flex gap-2 text-sm items-start">
              <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: color[x.tone] }} />
              <span><b>{fmtDate(x.date)}</b> · {x.title} <span className="text-slate-400">({inDays(daysUntil(x.date))})</span></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PolicyCard({ p }: { p: Policy }) {
  const [show, setShow] = useState(false);
  const st = POLICY_STATUS[p.status] ?? POLICY_STATUS.missing;
  const pct = p.effective && p.expires
    ? Math.min(100, Math.max(0, ((Date.now() - parse(p.effective).getTime()) / (parse(p.expires).getTime() - parse(p.effective).getTime())) * 100))
    : null;
  const left = p.expires ? daysUntil(p.expires) : null;
  return (
    <div id={`policy-${p.id}`} className={`bg-white rounded-xl border border-slate-200 p-4 space-y-3 scroll-mt-20 ${p.status === "expired" ? "opacity-75" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2 shrink-0" style={{ background: "#EEF2F8" }}><ShieldCheck size={20} style={{ color: NAVY }} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{KIND_LABEL[p.kind] ?? p.kind}</div>
          <div className="font-bold leading-snug">{p.title}</div>
          <div className="text-sm text-slate-500">{p.carrier ?? "No carrier on file"}{p.broker?.name && p.broker.name !== p.carrier ? ` · via ${p.broker.name}` : ""}</div>
        </div>
        <span className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      </div>

      {p.policyNumber && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Policy</span>
          <span className="font-mono font-semibold">{show ? p.policyNumber : mask(p.policyNumber)}</span>
          <button aria-label={show ? "Hide policy number" : "Show policy number"} onClick={() => setShow(!show)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {show && (
            <button aria-label="Copy policy number" onClick={() => navigator.clipboard?.writeText(p.policyNumber!)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
              <Copy size={16} />
            </button>
          )}
        </div>
      )}

      {pct != null && (
        <div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{fmtDate(p.effective)}</span>
            <span className="font-semibold" style={{ color: left != null && left < 0 ? STATUS.gap.fg : left != null && left <= 60 ? STATUS.partial.fg : undefined }}>
              {left != null && (left < 0 ? `Ended ${fmtDate(p.expires)}` : `${p.status === "check" ? "Runs to" : "Renews"} ${fmtDate(p.expires)} (${inDays(left)})`)}
            </span>
          </div>
          <div className="h-1.5 rounded bg-slate-100 mt-1 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${pct}%`, background: left != null && left < 0 ? "#98A2B3" : NAVY }} />
          </div>
        </div>
      )}

      {p.limits.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {p.limits.map((l) => (
            <div key={l.label} className="contents">
              <dt className="text-slate-500">{l.label}</dt>
              <dd className="text-right font-semibold tabular-nums">{limitText(l)}</dd>
            </div>
          ))}
          {p.deductibles.map((l) => (
            <div key={`d-${l.label}`} className="contents">
              <dt className="text-slate-500">{l.label} deductible</dt>
              <dd className="text-right font-semibold tabular-nums">{limitText(l)}</dd>
            </div>
          ))}
          {p.premium && (
            <div className="contents">
              <dt className="text-slate-500">Premium</dt>
              <dd className="text-right font-semibold tabular-nums">{money(p.premium.annual)}/yr</dd>
            </div>
          )}
        </dl>
      )}

      {(p.location || p.classification) && (
        <div className="text-xs text-slate-500 space-y-0.5">
          {p.location && <div className="flex gap-1"><Building2 size={13} className="shrink-0 mt-0.5" /> {p.location}</div>}
          {p.classification && <div>Classed as: <b className="text-slate-700">{p.classification}</b></div>}
        </div>
      )}

      {p.notes.length > 0 && (
        <ul className="text-sm text-slate-600 list-disc pl-5 space-y-0.5">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {p.broker?.phone && <Chip href={`tel:${p.broker.phone.replace(/\D/g, "")}`} icon={Phone} text={p.broker.phone} />}
        {p.broker?.email && <Chip href={`mailto:${p.broker.email}`} icon={Mail} text={p.broker.email} />}
        {p.sources.map((s) => <Chip key={s.url} href={s.url} icon={FileText} text={s.title.replace(/ \(.*\)$/, "")} external />)}
      </div>
    </div>
  );
}

function Certificates({ d, policyById }: { d: InsuranceData; policyById: Record<string, Policy> }) {
  const [holder, setHolder] = useState("");
  const [addr, setAddr] = useState("");
  const [ai, setAi] = useState(true);
  const req = d.coiRequest;
  const pol = req?.policyId ? policyById[req.policyId] : undefined;
  const mailto = useMemo(() => {
    if (!req) return "";
    const body = [
      "Hello,",
      "",
      `Please issue a certificate of liability insurance for ${d.company.name}${pol?.policyNumber ? `, policy ${pol.policyNumber}` : ""}.`,
      "",
      "Certificate holder:",
      holder || "[name]",
      addr || "[address]",
      "",
      ai ? "Please name the certificate holder as additional insured." : "",
      "",
      "Thank you,",
      d.company.name,
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
    return `mailto:${req.to}?subject=${encodeURIComponent(`Certificate request: ${d.company.name}${holder ? ` for ${holder}` : ""}`)}&body=${encodeURIComponent(body)}`;
  }, [req, pol, holder, addr, ai, d.company.name]);

  return (
    <section>
      <SectionHead title="Certificates" sub="Proof of insurance for customers, HOAs, property managers and the landlord." />
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {d.certificates.map((c) => (
            <a key={c.title + c.date} href={c.url} target="_blank" rel="noreferrer" className="flex gap-3 p-3 hover:bg-slate-50">
              <FileText size={20} className="shrink-0 mt-0.5" style={{ color: NAVY }} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold block">{c.title}</span>
                <span className="text-sm text-slate-500">For {c.holder} · {fmtDate(c.date)}</span>
              </span>
              <ExternalLink size={16} className="text-slate-400 shrink-0 mt-1" />
            </a>
          ))}
          {!d.certificates.length && <div className="p-3 text-sm text-slate-500">No certificates on file.</div>}
        </div>
        {req && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="font-bold">Request a new certificate</div>
            <p className="text-sm text-slate-500">Fills in an email to {req.to}. A commercial customer or HOA usually wants to be additional insured.</p>
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Who it's for (customer, HOA, company)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Their mailing address" rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Add them as additional insured
            </label>
            <div className="flex flex-wrap gap-2">
              <a href={mailto} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white text-sm" style={{ background: NAVY }}>
                <Mail size={16} /> Email the request
              </a>
              {req.phone && <Chip href={`tel:${req.phone.replace(/\D/g, "")}`} icon={Phone} text={req.phone} />}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MetDot({ met }: { met: string }) {
  const s = met === "yes" ? STATUS.covered : met === "no" ? STATUS.gap : met === "pending" ? STATUS.partial : STATUS.unknown;
  return <s.icon size={16} className="shrink-0 mt-0.5" style={{ color: s.fg }} />;
}

function SourceLink({ doc }: { doc: { title: string; url: string } }) {
  return (
    <a href={doc.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: NAVY }}>
      <FileText size={13} /> {doc.title}
    </a>
  );
}

function Chip({ href, icon: Icon, text, external }: { href: string; icon: typeof Mail; text: string; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 max-w-full">
      <Icon size={14} className="shrink-0" /> <span className="truncate">{text}</span>
    </a>
  );
}

function UploadButton({ onLoaded, primary }: { onLoaded: (v: InsuranceView) => void; primary?: boolean }) {
  const [msg, setMsg] = useState("");
  async function upload(f: File) {
    setMsg("Loading…");
    try {
      onLoaded(await api<InsuranceView>("/api/insurance", { method: "POST", json: JSON.parse(await f.text()) }));
      setMsg("");
    } catch (e: any) { setMsg(e instanceof SyntaxError ? "That file isn't insurance.json." : e.message); }
  }
  return (
    <div className="space-y-1">
      <label className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold cursor-pointer text-sm ${primary ? "text-white" : "border border-slate-300 text-slate-700"}`}
        style={primary ? { background: NAVY } : undefined}>
        <Upload size={16} /> Upload insurance.json
        <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </label>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
