"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ExternalLink, MapPin, Plus, Trash2, X } from "lucide-react";
import { api, GREEN, NAVY, RED } from "@/components/ui";
import { Band, Btn, Card, GRADE, Grade, money, Rates, useBusy } from "./parts";
import { LineMockups, useMockups } from "./Mockups";

export type Product = { key: string; name: string; desc: string; cat: string; price: number; textOnly?: boolean };
export type SimCase = {
  id: string; season: string;
  request: { title: string; source: string; note: string; street: string; town: string; state: string; zip: string; attachments: number };
  repeat: { prior: number; lastSeason: string | null; last?: { season: string; status: string; lines: { name: string; total: number; optional: boolean }[] } | null };
  links: { streetView: string; earth: string; listing: string };
};
type Line = { id: number; key: string; name: string; desc: string; cat: string; price: string; optional: boolean; mockup: boolean; textOnly?: boolean };
type Row = { real: { name: string; cat: string; total: number; qty: number; unit: number; optional: boolean }; mine: { name: string; price: number; optional: boolean } | null; pctOff: number; grade: Grade | "missed" };
export type SimResult = {
  realTotal: number; myTotal: number; pctOff: number; grade: Grade; rows: Row[]; extra: { name: string; price: number }[];
  checks: { label: string; ok: boolean }[];
  realQuote: { title: string; lines: { name: string; desc: string; total: number; optional: boolean; textOnly: boolean; qty: number }[]; subtotal: number; total: number };
  jobberUrl: string | null; bands: Band[]; passPct: number; final: { within: number; of: number } | null;
};

const TITLES = [
  "All-Inclusive Holiday Lighting: Installation, Maintenance, Takedown, and Storage- CLICK LINE ITEM PHOTOS TO VIEW",
  "CASH - All-Inclusive Holiday Lighting: Installation, Maintenance, Takedown, and Storage- CLICK LINE ITEM PHOTOS TO VIEW",
  "Professional Installation, Maintenance & Takedown of your Lights",
];
const STEPS = ["The request", "See the house", "Measure", "Build the quote", "Compare"];
const CAT_LABEL: Record<string, string> = {
  roofline: "Roofline", "roofline+pillars": "Roofline + pillars", pillars: "Pillars", tree: "Trees", bushes: "Bushes", "stakes/pathway": "Walkway / stakes",
  railing: "Railing", wreath: "Wreaths", garland: "Garland", windows: "Windows / doors", other: "Other", included: "Every quote",
};
const num = (s: string) => Number(s) || 0;

export type RealPhotos = Record<string, { fileId: string; caption: string; price: number | null }[]>;

export function QuoteSim({ c, catalog, real, rates, bands, mode, run, label, onDone }: {
  c: SimCase; catalog: Product[]; real?: RealPhotos; rates: Rates; bands: Band[]; mode: "case" | "final"; run?: string; label?: string;
  onDone: (r: SimResult) => void;
}) {
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [scope, setScope] = useState<number | null>(null);
  const [seen, setSeen] = useState(false);
  const [m, setM] = useState({ roof: "", pillars: "", bushStrands: "", railStrands: "", walk: "", trees: [""] as string[] });
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [res, setRes] = useState<SimResult | null>(null);
  const { busy, err, run: go } = useBusy();
  const band = (cat: string) => bands.find((b) => b.cat === cat) ?? null;
  const repeat = c.repeat.prior > 0;

  // What the owners' rates say a line should cost, from what the trainee measured.
  const rule = (l: Line, idx: number): { price: number; how: string } | null => {
    const treeNo = lines.slice(0, idx + 1).filter((x) => x.cat === "tree").length - 1;
    if (l.cat === "roofline" && num(m.roof)) return { price: num(m.roof) * rates.rooflinePerFt, how: `${m.roof} ft × ${money(rates.rooflinePerFt)}` };
    if (l.cat === "roofline+pillars" && num(m.roof)) return { price: num(m.roof) * rates.rooflinePerFt + num(m.pillars) * rates.pillar, how: `${m.roof} ft × ${money(rates.rooflinePerFt)} + ${num(m.pillars)} pillars × ${money(rates.pillar)}` };
    if (l.cat === "pillars" && num(m.pillars)) return { price: num(m.pillars) * rates.pillar, how: `${m.pillars} × ${money(rates.pillar)}` };
    if (l.cat === "tree" && num(m.trees[treeNo] ?? "")) return { price: num(m.trees[treeNo]) * rates.perStrand, how: `${m.trees[treeNo]} strands × ${money(rates.perStrand)}` };
    if (l.cat === "bushes" && num(m.bushStrands)) return { price: num(m.bushStrands) * rates.perStrand, how: `${m.bushStrands} strands × ${money(rates.perStrand)}` };
    if (l.cat === "railing" && num(m.railStrands)) return { price: num(m.railStrands) * rates.perStrand, how: `${m.railStrands} strands × ${money(rates.perStrand)}` };
    if (l.cat === "wreath") { const size = l.name.match(/(36|48|60|72)/)?.[1]; if (size && rates.wreath[size] != null) return { price: rates.wreath[size], how: `${size}" wreath` }; }
    return null;
  };

  const groups = useMemo(() => {
    const g = new Map<string, Product[]>();
    for (const p of catalog) g.set(p.cat, [...(g.get(p.cat) ?? []), p]);
    return [...g];
  }, [catalog]);

  let nextId = lines.reduce((x, l) => Math.max(x, l.id), 0) + 1;
  const add = (p: Product) => setLines([...lines, { id: nextId++, key: p.key, name: p.name, desc: p.desc, cat: p.cat, price: p.textOnly ? "0" : p.price ? String(p.price) : "", optional: lines.some((l) => !l.textOnly), mockup: false, textOnly: p.textOnly }]);
  const upd = (id: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => { const n = [...lines]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setLines(n); };
  const priced = lines.filter((l) => !l.textOnly);
  const required = priced.filter((l) => !l.optional).reduce((t, l) => t + num(l.price), 0);
  const all = priced.reduce((t, l) => t + num(l.price), 0);

  async function send() {
    await go(async () => {
      const r = await api<SimResult>("/api/training/practice", {
        method: "POST",
        json: {
          mode, run, case: c.id,
          built: { title, answers: { repeat: start === 1 }, lines: lines.map((l) => ({ key: l.key, name: l.name, cat: l.cat, price: num(l.price), optional: l.optional, mockup: l.mockup, textOnly: l.textOnly })) },
        },
      });
      setRes(r); setStep(4); onDone(r);
    });
  }

  const field = (k: "roof" | "pillars" | "bushStrands" | "railStrands" | "walk", lab: string, help: string) => (
    <label className="block">
      <span className="text-sm font-semibold">{lab}</span>
      <input inputMode="decimal" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value.replace(/[^\d.]/g, "") })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
      <span className="text-xs text-slate-500">{help}</span>
    </label>
  );

  return (
    <div className="space-y-3">
      {/* Step bar */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button key={s} disabled={i > step || (i === 4 && !res) || (!!res && i < 4)} onClick={() => setStep(i)}
            className="flex-1 text-[11px] font-semibold rounded-md py-1.5 px-1 leading-tight"
            style={{ background: i === step ? NAVY : i < step ? "#E6ECF5" : "#F1F5F9", color: i === step ? "white" : i < step ? NAVY : "#94A3B8" }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>
      {label && <div className="text-sm font-bold" style={{ color: NAVY }}>{label}</div>}

      {step === 0 && (
        <Card className="space-y-4">
          <div>
            <div className="text-xs text-slate-500">Jobber request · {c.request.source || "website form"} · {c.season} season</div>
            <div className="text-lg font-bold">{c.request.title || "Holiday Lighting"}</div>
            <div className="text-sm text-slate-600 flex items-center gap-1"><MapPin size={14} /> {c.request.town}, {c.request.state}</div>
          </div>
          <blockquote className="border-l-4 pl-3 py-1 text-[15px] italic text-slate-700" style={{ borderColor: NAVY }}>
            {c.request.note || "(The customer left no note. Quote what fits the house.)"}
          </blockquote>
          {c.request.attachments > 0 && <p className="text-sm text-slate-600">The customer attached {c.request.attachments} photo{c.request.attachments > 1 ? "s" : ""} (open the request in Jobber to see them).</p>}
          <Ask q="Is this a request we quote with the holiday price list?" options={["Yes, holiday lighting at a house", "No, hand it to Chris or Liam"]} answer={0} picked={scope} onPick={setScope}
            why="It's holiday lighting on a home, so it's ours. Permanent, bistro and commercial work go to Chris or Liam." />
          {scope != null && (
            <Ask q={`You search the client in Jobber and find ${repeat ? `${c.repeat.prior} earlier quote${c.repeat.prior > 1 ? "s" : ""}${c.repeat.lastSeason ? ` (last one in ${c.repeat.lastSeason})` : ""}` : "no earlier quotes"}. Where do you start?`}
              options={["Design it fresh from the house", "Open last year's quote and mockups and start from that"]} answer={repeat ? 1 : 0} picked={start} onPick={setStart}
              why={repeat ? `Returning customer: same design and price as last year, plus ${rates.returningDiscountPct}% off if they book before ${rates.returningBefore}.` : "New customer, so you design it from the house and the note."} />
          )}
          {start != null && <LastYear c={c} />}
          <Btn disabled={start == null} onClick={() => setStep(1)}>Next: see the house</Btn>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-3">
          <p className="text-[15px]">Open the house and look at it the way the customer sees it from the street. Check the photo date, count the peaks, pillars, trees and bushes in front, and decide what would look best.</p>
          <div className="text-sm font-semibold">{c.request.street}, {c.request.town}, {c.request.state} {c.request.zip}</div>
          <div className="flex flex-wrap gap-2">
            <LinkBtn href={c.links.streetView}>Street View (Google Maps)</LinkBtn>
            <LinkBtn href={c.links.earth}>Google Earth (to measure)</LinkBtn>
            <LinkBtn href={c.links.listing}>Listing photos (Zillow)</LinkBtn>
          </div>
          <p className="text-xs text-slate-500">Lights and landscaping may have changed since we quoted it. Quote what you see.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} /> I found the house and can see the front clearly</label>
          <Btn disabled={!seen} onClick={() => setStep(2)}>Next: measure</Btn>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-3">
          <p className="text-[15px]">In Google Earth, use the ruler along every gutter run you'll light, and both sides of each peak. Fill in what you'll quote. These feed the price hints on the next step.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {field("roof", "Roofline feet", `Rule: ${money(rates.rooflinePerFt)} a foot`)}
            {field("pillars", "Pillars / columns", `Rule: ${money(rates.pillar)} each (9 to 10 ft, 2 strands)`)}
            {field("bushStrands", "Bushes: strands of minis", `Rule: ${money(rates.perStrand)} a strand`)}
            {field("railStrands", "Railing: strands", `Rule: ${money(rates.perStrand)} a strand`)}
            {field("walk", "Walkway / driveway feet", "Stakes every 12 inches")}
            <div className="space-y-1">
              <span className="text-sm font-semibold block">Trees: strands each</span>
              <div className="flex flex-wrap gap-2">
                {m.trees.map((t, i) => (
                  <input key={i} inputMode="decimal" placeholder={`Tree ${i + 1}`} value={t} className="w-20 rounded-md border border-slate-300 px-2 py-1.5"
                    onChange={(e) => { const n = [...m.trees]; n[i] = e.target.value.replace(/[^\d.]/g, ""); setM({ ...m, trees: n }); }} />
                ))}
                <button className="text-sm font-semibold" style={{ color: NAVY }} onClick={() => setM({ ...m, trees: [...m.trees, ""] })}>+ tree</button>
              </div>
              <span className="text-xs text-slate-500">One story is about 10 ft. 10 strands ($350) is the most common tree.</span>
            </div>
          </div>
          <Btn onClick={() => setStep(3)}>Next: build the quote</Btn>
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Card className="space-y-2">
            <div className="font-bold">Quote title</div>
            <select value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
              <option value="">Pick the title...</option>
              {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Card>

          <LastYear c={c} />
          <Card className="space-y-3">
            <div className="flex justify-between items-baseline">
              <div className="font-bold">Line items</div>
              <div className="text-xs text-slate-500">The customer's note: <i>{c.request.note || "none"}</i></div>
            </div>
            {!lines.length && <p className="text-sm text-slate-500">Add lines from the product list below, starting with what they asked for.</p>}
            {lines.map((l, i) => {
              const r = l.textOnly ? null : rule(l, i);
              const b = band(l.cat);
              return (
                <div key={l.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 font-semibold text-sm">{l.name}</div>
                    <div className="flex gap-1 text-slate-400">
                      <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                      <button aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
                      <button aria-label="Remove" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {l.textOnly ? <div className="text-xs text-slate-500">Text line, no price</div> : (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1">$<input inputMode="decimal" value={l.price} onChange={(e) => upd(l.id, { price: e.target.value.replace(/[^\d.]/g, "") })} className="w-24 rounded-md border border-slate-300 px-2 py-1" /></span>
                        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={l.optional} onChange={(e) => upd(l.id, { optional: e.target.checked })} /> Optional</label>
                        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={l.mockup} onChange={(e) => upd(l.id, { mockup: e.target.checked })} /> Mockup attached</label>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                        {r && <button className="font-semibold underline" style={{ color: NAVY }} onClick={() => upd(l.id, { price: String(Math.round(r.price)) })}>Rule: {money(r.price)} ({r.how})</button>}
                        {b && <span>2025-27 average {money(b.avg ?? b.median)}, most {money(b.p25)} to {money(b.p75)}</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {priced.length > 0 && (
              <div className="text-sm font-semibold flex flex-wrap gap-x-4" style={{ color: NAVY }}>
                <span>Required lines: {money(required)}</span><span>With every option: {money(all)}</span>
                <span className="text-slate-500 font-normal">+{rates.taxPct}% tax · {rates.depositPct}% deposit</span>
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="font-bold">Products & Services</div>
            <p className="text-xs text-slate-500">These are Light DMV's saved line items in Jobber, word for word. Tap one to add it.</p>
            {groups.map(([cat, ps]) => (
              <div key={cat}>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{CAT_LABEL[cat] ?? cat}</div>
                {!!real?.[cat]?.length && <Installs photos={real[cat]} />}
                <div className="flex flex-col gap-1 mt-1">
                  {ps.map((p) => (
                    <button key={p.key} onClick={() => add(p)} className="text-left text-sm rounded-md border border-slate-200 px-2 py-1.5 hover:border-slate-400 flex gap-2 items-start">
                      <Plus size={14} className="mt-0.5 shrink-0" style={{ color: NAVY }} /><span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Btn disabled={busy || !title || !priced.length || priced.some((l) => !num(l.price))} onClick={send}>Send quote and compare</Btn>
          {priced.some((l) => !num(l.price)) && <p className="text-xs text-slate-500">Every priced line needs a price.</p>}
        </div>
      )}

      {step === 4 && res && <Compare res={res} refId={`case:${c.id}`} />}
    </div>
  );
}

/** Finished installs of this kind of line, from Light DMV's Google Drive, with what that line sold for. */
function Installs({ photos }: { photos: RealPhotos[string] }) {
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  return (
    <div className="my-1">
      <button className="text-xs font-semibold underline" style={{ color: NAVY }} onClick={() => setOpen(!open)}>{open ? "Hide" : "See"} {photos.length} finished install{photos.length > 1 ? "s" : ""}</button>
      {open && (
        <div className="flex gap-2 overflow-x-auto mt-1">
          {photos.map((p, i) => (
            <a key={i} href={`https://drive.google.com/file/d/${p.fileId}/view`} target="_blank" rel="noreferrer" className="shrink-0 text-center">
              {bad[p.fileId] ? <div className="h-28 w-36 rounded-lg bg-slate-100 text-xs flex items-center justify-center p-2">Open in Drive</div> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`https://drive.google.com/thumbnail?id=${p.fileId}&sz=w800`} alt={p.caption} loading="lazy" onError={() => setBad({ ...bad, [p.fileId]: true })} className="h-28 rounded-lg border border-slate-200 object-cover" />
              )}
              {p.price != null && <div className="text-[11px] text-slate-600">sold {money(p.price)}</div>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** A returning customer's previous quote, as you'd find it in Jobber. */
function LastYear({ c }: { c: SimCase }) {
  const l = c.repeat.last;
  if (!l || !l.lines.length) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
      <div className="text-sm font-bold">Their {l.season} quote in Jobber{l.status === "converted" || l.status === "approved" ? " (they bought it)" : ""}</div>
      {l.lines.map((x, i) => (
        <div key={i} className="flex justify-between gap-3 text-sm"><span>{x.name}{x.optional && <span className="ml-1 text-[11px] text-slate-500">OPTIONAL</span>}</span><span className="font-semibold">{money(x.total)}</span></div>
      ))}
    </div>
  );
}

function Ask({ q, options, answer, picked, onPick, why }: { q: string; options: string[]; answer: number; picked: number | null; onPick: (i: number) => void; why: string }) {
  return (
    <div className="space-y-2">
      <div className="font-semibold text-sm">{q}</div>
      <div className="flex flex-col gap-1.5">
        {options.map((o, i) => {
          const done = picked != null, right = i === answer, mine = picked === i;
          return (
            <button key={i} disabled={done} onClick={() => onPick(i)} className="text-left text-sm rounded-lg border px-3 py-2"
              style={{ borderColor: done && right ? GREEN : done && mine ? RED : "#CBD5E1", background: done && right ? "#E8F6EE" : done && mine ? "#FDECEC" : "white" }}>
              {o}
            </button>
          );
        })}
      </div>
      {picked != null && <p className="text-sm" style={{ color: picked === answer ? GREEN : RED }}>{picked === answer ? "Right. " : "Not quite. "}<span className="text-slate-600">{why}</span></p>}
    </div>
  );
}

const LinkBtn = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold border border-slate-300" style={{ color: NAVY }}>
    {children} <ExternalLink size={14} />
  </a>
);

function Compare({ res, refId }: { res: SimResult; refId: string }) {
  const g = GRADE[res.grade];
  const counts = useMockups(refId);
  return (
    <div className="space-y-3">
      <Card className="space-y-1" >
        <div className="text-lg font-extrabold" style={{ color: g.color }}>{g.label}: you {money(res.myTotal)}, we sent {money(res.realTotal)} ({res.pctOff}% off)</div>
        <p className="text-sm text-slate-600">Totals include every optional line. Within {res.passPct}% passes.</p>
      </Card>

      <Card className="space-y-2">
        <div className="font-bold">Line by line</div>
        {res.rows.map((r, i) => {
          const st = r.grade === "missed" ? { label: "You left this out", color: RED, bg: "#FDECEC" } : GRADE[r.grade];
          return (
            <div key={i} className="rounded-lg p-2.5 text-sm" style={{ background: st.bg }}>
              <div className="font-semibold">{r.real.name}{r.real.optional && <span className="ml-2 text-[11px] text-slate-500">OPTIONAL</span>}</div>
              <div><b style={{ color: st.color }}>{st.label}</b>{r.mine ? `: you ${money(r.mine.price)}` : ""}, we charged <b>{money(r.real.total)}</b>{r.real.qty !== 1 ? ` (${r.real.qty} × ${money(r.real.unit)})` : ""}{r.mine ? `, ${r.pctOff}% off` : ""}</div>
            </div>
          );
        })}
        {res.extra.map((x, i) => (
          <div key={`x${i}`} className="rounded-lg p-2.5 text-sm bg-slate-50">
            <div className="font-semibold">{x.name}</div>
            <div className="text-slate-600">You added this at {money(x.price)}; our quote didn't have it. Fine as an optional upsell if it fits the house.</div>
          </div>
        ))}
      </Card>

      <Card className="space-y-1.5">
        <div className="font-bold">Quote checklist</div>
        {res.checks.map((ch) => (
          <div key={ch.label} className="flex items-center gap-2 text-sm">
            {ch.ok ? <Check size={16} color={GREEN} /> : <X size={16} color={RED} />}<span>{ch.label}</span>
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <div className="font-bold">What we actually sent</div>
        <div className="text-xs text-slate-500">{res.realQuote.title}</div>
        {res.realQuote.lines.map((l, i) => (
          <div key={i} className="text-sm border-b border-slate-100 pb-2 space-y-1">
            <div className="flex justify-between gap-3">
              <span>{l.name}{l.optional && <span className="ml-2 text-[11px] text-slate-500">OPTIONAL</span>}</span>
              <span className="font-semibold whitespace-nowrap">{l.textOnly ? "text" : money(l.total)}</span>
            </div>
            {counts && <LineMockups refId={refId} line={i} count={counts[i] ?? 0} />}
          </div>
        ))}
        {counts === null && <p className="text-xs text-slate-500">Loading the mockups from Jobber...</p>}
        <div className="text-sm font-semibold">Total with tax: {money(res.realQuote.total)}</div>
        {res.jobberUrl && <a href={res.jobberUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: NAVY }}>Open it in Jobber to see the mockups <ExternalLink size={14} /></a>}
      </Card>
    </div>
  );
}

