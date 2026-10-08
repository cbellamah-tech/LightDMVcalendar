"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import type { CourseModule, InstallProgress } from "@/lib/installCourse";
import { Btn, Card, money, Photo, Spinner, useBusy } from "./parts";
import { LineMockups, useMockups } from "./Mockups";

const API = "/api/training/course/job";
const LABEL: Record<string, string> = {
  roofline: "Roofline (C9)", pillars: "Pillars and columns", tree: "Trees", bushes: "Bushes", wreath: "Wreaths", railing: "Railings",
  "stakes/pathway": "Stakes and walkway", garland: "Garland", other: "Something else",
  "roofline+pillars": "Roofline and pillars", "trees+bushes": "Trees and bushes",
};
const OFFER = ["roofline", "pillars", "tree", "bushes", "wreath", "railing", "stakes/pathway", "garland", "other"];

type House = {
  id: string; address: string; lat: number | null; lng: number | null; request: string; returning: boolean | null; commercial: boolean | null;
  hasRoofline: boolean; measured: boolean; lines: { i: number; name: string; desc: string; qty: number; cat: string }[] | null;
};
type Got = { kind: "intake"; routes: string[]; item?: { id: string; text: string } } | { kind: "lines" | "job" | "final"; routes: string[]; jobs: House[]; run?: string };
type Graded = {
  route: { mine: number; real: number; ok: boolean } | null; choice: { missed: string[]; extra: string[]; ok: boolean } | null;
  feet: { mine: number; real: number; pctOff: number; ok: boolean } | null;
  rows: { key: string; label: string; mine: number; real: number; pctOff: number }[]; myTotal: number; realTotal: number; pctOff: number; worst: number; ok: boolean; pricePct: number;
  reveal: { lines: { i: number; name: string; desc: string; qty: number; unit: number; total: number; cat: string; charged: number; note: string; graded: boolean }[]; photos: string[]; included: string[]; total: number; feet: number | null; note: string; notPicked: string[]; mockups: string };
  final: { within: number; of: number; worst: number; ok: boolean; need: number; linePct: number } | null; progress: InstallProgress;
};

/** The practice page of a quote-course module. */
export function QuotePractice({ m, onProgress, prog }: { m: CourseModule; onProgress: (p: InstallProgress) => void; prog?: InstallProgress }) {
  const [got, setGot] = useState<Got | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => { setGot(null); api<Got>(`${API}?module=${m.key}`).then(setGot).catch((e) => setErr(e.message)); }, [m.key, n]);
  const p = prog?.modules[m.key]?.practice;
  const spec = m.practice!;
  const goal = spec.kind === "intake" ? `Get ${spec.need} requests right.` : spec.kind === "final" ? `${spec.jobs} houses: at least ${spec.within} totals within 10%, and no kind of line off by more than ${spec.linePct}%.` : `At least ${spec.tries} houses, ${spec.good} of them within 10%.`;
  if (err) return <Card><p className="text-red-600">{err}</p></Card>;
  return (
    <div className="space-y-3">
      <Card className="text-sm space-y-1">
        <div className="font-bold" style={{ color: NAVY }}>{p?.passed ? "Practice passed." : "To pass:"} {goal}</div>
        {p && p.tries > 0 && <div className="text-slate-500">So far: {p.good} of {p.tries} good{p.finals?.length ? ` · final runs ${p.finals.map((f) => `${f.within}/${f.of}`).join(", ")}` : ""}.</div>}
      </Card>
      {!got ? <Spinner /> : got.kind === "intake"
        ? <Intake routes={got.routes} item={got.item} module={m.key} onDone={onProgress} onNext={() => setN(n + 1)} />
        : <Houses key={n} kind={got.kind} routes={got.routes} jobs={got.jobs} run={got.run} module={m.key} onDone={onProgress} onNext={() => setN(n + 1)} />}
    </div>
  );
}

function Intake({ routes, item, module, onDone, onNext }: { routes: string[]; item?: { id: string; text: string }; module: string; onDone: (p: InstallProgress) => void; onNext: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [res, setRes] = useState<{ ok: boolean; answer: number; why: string } | null>(null);
  const { busy, err, run } = useBusy();
  if (!item) return <Card><p className="text-slate-600">No requests in the training file yet.</p></Card>;
  return (
    <Card className="space-y-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">A request just came in</div>
      <p className="text-slate-800 whitespace-pre-line">{item.text}</p>
      <div className="font-semibold">What do you do first?</div>
      {routes.map((r, i) => {
        const tone = res ? (i === res.answer ? "border-emerald-500 bg-emerald-50" : i === pick ? "border-red-400 bg-red-50" : "border-slate-200") : i === pick ? "border-slate-800 bg-slate-50" : "border-slate-200";
        return <button key={i} disabled={!!res} onClick={() => setPick(i)} className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${tone}`}>{r}</button>;
      })}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!res
        ? <Btn disabled={pick === null || busy} onClick={() => run(async () => { const r = await api<{ ok: boolean; answer: number; why: string; progress: InstallProgress }>(API, { method: "POST", json: { module, item: item.id, route: pick } }); setRes(r); onDone(r.progress); })}>Check</Btn>
        : <div className={`rounded-lg p-3 text-sm space-y-2 ${res.ok ? "bg-emerald-50" : "bg-amber-50"}`}><div><b>{res.ok ? "Right." : "Not quite."}</b> {res.why}</div><Btn ghost onClick={onNext}>Next request</Btn></div>}
    </Card>
  );
}

function Houses({ kind, routes, jobs, run, module, onDone, onNext }: { kind: "lines" | "job" | "final"; routes: string[]; jobs: House[]; run?: string; module: string; onDone: (p: InstallProgress) => void; onNext: () => void }) {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Graded[]>([]);
  const last = results[results.length - 1];
  const finished = kind === "final" ? results.length === jobs.length : results.length > 0;
  return (
    <div className="space-y-3">
      {kind === "final" && <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Final · house {Math.min(i + 1, jobs.length)} of {jobs.length}</div>}
      <HouseSteps key={jobs[i].id} kind={kind} routes={routes} h={jobs[i]} module={module} run={run} hideReveal={kind === "final" && !finished}
        onGraded={(g) => { setResults([...results, g]); onDone(g.progress); }} />
      {last?.final && (
        <Card className={last.final.ok ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}>
          <div className="font-extrabold text-lg">{last.final.ok ? "Final passed." : "Not this time."} {last.final.within} of {last.final.of} houses within 10%.</div>
          <p className="text-sm text-slate-600">You need {last.final.need} of {last.final.of}, with no kind of line off by more than {last.final.linePct}%. Your worst line was {last.final.worst}% off.</p>
        </Card>
      )}
      {kind === "final" && results.length > i && i + 1 < jobs.length && <Btn onClick={() => { setI(i + 1); window.scrollTo(0, 0); }}>Next house</Btn>}
      {finished && <Btn ghost onClick={onNext}>{kind === "final" ? "Start another final" : "Another house"}</Btn>}
    </div>
  );
}

/** One house, worked like a real quote. */
function HouseSteps({ kind, routes, h, module, run, hideReveal, onGraded }: { kind: "lines" | "job" | "final"; routes: string[]; h: House; module: string; run?: string; hideReveal: boolean; onGraded: (g: Graded) => void }) {
  const whole = kind !== "lines";
  const [offer, setOffer] = useState<string[]>([]);
  const [feet, setFeet] = useState("");
  const [price, setPrice] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Graded | null>(null);
  const { busy, err, run: go } = useBusy();
  const priced = whole ? offer : (h.lines ?? []).map((l) => String(l.i));
  const ready = priced.length > 0 && priced.every((k) => Number(price[k]) > 0) && (!h.hasRoofline || !whole || !offer.includes("roofline") || Number(feet) > 0);

  async function check() {
    await go(async () => {
      const body = whole
        ? { module, job: h.id, run, offer, feet: Number(feet) || undefined, lines: offer.map((c) => ({ cat: c, price: Number(price[c]) })) }
        : { module, job: h.id, feet: Number(feet) || undefined, prices: Object.fromEntries(priced.map((k) => [k, Number(price[k])])) };
      const r = await api<Graded>(API, { method: "POST", json: body });
      setRes(r); onGraded(r);
    });
  }
  const step = (n: number, t: string) => <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Step {n} · {t}</div>;
  let s = 0;

  return (
    <div className="space-y-3">
      {whole && (
        <Card className="space-y-2">
          {step(++s, "Read the request and the Jobber history")}
          <p className="text-slate-800 whitespace-pre-line">{h.request || "The customer filled in the website form for a holiday lighting quote. No notes came through."}</p>
          <div className="text-sm text-slate-600">Jobber: {h.returning === true ? "they had a quote or job with us before." : h.returning === false ? "no earlier quotes or jobs." : "history not checked."}{h.commercial ? " It's a business." : ""}</div>
        </Card>
      )}

      <Card className="space-y-2">
        {step(++s, "Size up the house")}
        <HouseViews h={h} />
        {whole && (
          <>
            <div className="font-semibold text-sm pt-1">What would you offer on this house?</div>
            <div className="grid grid-cols-2 gap-1.5">
              {OFFER.map((c) => (
                <label key={c} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${offer.includes(c) ? "border-slate-800 bg-slate-50" : "border-slate-200"}`}>
                  <input type="checkbox" disabled={!!res} checked={offer.includes(c)} onChange={(e) => setOffer(e.target.checked ? [...offer, c] : offer.filter((x) => x !== c))} />
                  {LABEL[c]}
                </label>
              ))}
            </div>
          </>
        )}
      </Card>

      {h.hasRoofline && (!whole || offer.includes("roofline")) && (
        <Card className="space-y-2">
          {step(++s, "Measure the roofline")}
          <p className="text-sm text-slate-600">Open the overhead view in Google Maps, right-click the roof edge, pick <b>Measure distance</b>, and click along every edge you'd light. Add up the feet.</p>
          <label className="flex items-center gap-2">
            <input inputMode="decimal" disabled={!!res} value={feet} onChange={(e) => setFeet(e.target.value.replace(/[^\d.]/g, ""))} placeholder="feet" className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right" />
            <span className="text-sm text-slate-500">ft of roofline</span>
          </label>
          {!h.measured && <p className="text-xs text-slate-400">Nobody has measured this house for the answer key yet, so your feet aren't graded here. Price from what you measured.</p>}
        </Card>
      )}

      <Card className="space-y-2">
        {step(++s, whole ? "Build the lines" : "Price the lines")}
        {whole && !offer.length && <p className="text-sm text-slate-500">Pick what you'd offer above first.</p>}
        {(whole ? offer.map((c) => ({ k: c, name: LABEL[c], desc: "" })) : (h.lines ?? []).map((l) => ({ k: String(l.i), name: `${l.name}${l.qty > 1 ? ` × ${l.qty}` : ""}`, desc: l.desc }))).map((l) => (
          <div key={l.k} className="flex items-start gap-3 rounded-lg border border-slate-200 p-2">
            <div className="flex-1 min-w-0"><div className="font-semibold text-sm">{l.name}</div>{l.desc && <div className="text-xs text-slate-500 whitespace-pre-line line-clamp-3">{l.desc}</div>}</div>
            <label className="flex items-center gap-1 shrink-0"><span className="text-slate-500">$</span>
              <input inputMode="decimal" disabled={!!res} value={price[l.k] ?? ""} placeholder="line total" onChange={(e) => setPrice({ ...price, [l.k]: e.target.value.replace(/[^\d.]/g, "") })}
                className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right" />
            </label>
          </div>
        ))}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!res && <Btn disabled={busy || !ready} onClick={check}>{ready ? "Send the quote" : whole ? "Answer each step first" : "Price every line"}</Btn>}
      </Card>

      {res && <Grades r={res} whole={whole} />}
      {res && !hideReveal && <Reveal r={res} />}
      {res && hideReveal && <p className="text-xs text-slate-400 text-center">You'll see our real quotes after the last house.</p>}
    </div>
  );
}

/** Daytime Street View and the overhead view of the house, plus links to open both in Google. */
function HouseViews({ h }: { h: House }) {
  const [street, setStreet] = useState(true);
  const q = h.lat && h.lng ? `${h.lat},${h.lng}` : h.address;
  const pano = h.lat && h.lng ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${h.lat},${h.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}`;
  const over = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}`;
  return (
    <div className="space-y-2">
      <div className="font-semibold">{h.address}</div>
      {street && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/training/course/view?job=${h.id}&kind=street`} alt="Street View" onError={() => setStreet(false)} className="w-full rounded-lg border border-slate-200 bg-slate-100" />
      )}
      <iframe title="Overhead view" src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=k&z=20&output=embed`} className="w-full aspect-[4/3] rounded-lg border border-slate-200" loading="lazy" />
      <div className="flex flex-wrap gap-3 text-sm font-semibold" style={{ color: NAVY }}>
        <a href={pano} target="_blank" rel="noreferrer" className="flex items-center gap-1"><ExternalLink size={14} /> Street View</a>
        <a href={over} target="_blank" rel="noreferrer" className="flex items-center gap-1"><ExternalLink size={14} /> Google Maps (to measure)</a>
        <a href={`https://earth.google.com/web/search/${encodeURIComponent(h.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1"><ExternalLink size={14} /> Google Earth</a>
      </div>
    </div>
  );
}

const Mark = ({ ok }: { ok: boolean }) => (ok ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <XCircle size={18} className="text-red-500 shrink-0" />);

/** Each skill graded on its own: first move, what to offer, footage, price. */
function Grades({ r, whole }: { r: Graded; whole: boolean }) {
  return (
    <Card className="space-y-2">
      <div className="font-bold" style={{ color: NAVY }}>How you did</div>
            {r.choice && (
        <div className="flex gap-2 text-sm"><Mark ok={r.choice.ok} /><div><b>What to offer:</b> {r.choice.ok ? "you offered every kind of line we sold." : `you missed ${r.choice.missed.map((c) => LABEL[c] ?? c).join(", ")}.`}
          {r.choice.extra.length ? ` You also offered ${r.choice.extra.map((c) => LABEL[c] ?? c).join(", ")}, which this customer didn't buy (fine as an optional line).` : ""}</div></div>
      )}
      {r.feet && <div className="flex gap-2 text-sm"><Mark ok={r.feet.ok} /><div><b>Footage:</b> you measured {r.feet.mine} ft, the answer key says {r.feet.real} ft ({r.feet.pctOff}% off).</div></div>}
      <div className="flex gap-2 text-sm"><Mark ok={r.ok} /><div><b>Price:</b> you {money(r.myTotal)}, we charged {money(r.realTotal)} ({r.pctOff}% off; within {r.pricePct}% passes).</div></div>
      <div className="text-xs text-slate-600 space-y-0.5 pl-6">
        {r.rows.map((x) => <div key={x.key} className="flex justify-between gap-2"><span>{whole ? LABEL[x.label] ?? x.label : x.label}</span><span>you {money(x.mine)} · we {money(x.real)}{x.real > 0 ? ` · ${x.pctOff}% off` : x.mine > 0 ? " · not sold" : ""}</span></div>)}
      </div>
    </Card>
  );
}

/** Our real quote, each line's mockup, and the finished house. */
function Reveal({ r }: { r: Graded }) {
  const mock = useMockups(r.reveal.mockups);
  return (
    <Card className="space-y-3">
      <div className="font-bold" style={{ color: NAVY }}>What we really sent</div>
      {r.reveal.feet ? <div className="text-sm text-slate-600">Measured roofline: {r.reveal.feet} ft.</div> : null}
      {r.reveal.lines.map((l) => (
        <div key={l.i} className="rounded-lg border border-slate-200 p-2 space-y-1">
          <div className="flex justify-between gap-2"><span className="font-semibold text-sm">{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</span><span className="text-sm shrink-0">{money(l.charged)}</span></div>
          {l.note && <div className="text-xs text-amber-700">{l.note}</div>}
          {!l.graded && <div className="text-xs text-slate-400">Not graded: the photo doesn't show this line.</div>}
          {l.desc && <div className="text-xs text-slate-500 whitespace-pre-line">{l.desc}</div>}
          {mock && mock[l.i] > 0 && <LineMockups refId={r.reveal.mockups} line={l.i} count={mock[l.i]} />}
        </div>
      ))}
      {r.reveal.included.length > 0 && <div className="text-xs text-slate-500">Also on the quote at $0: {r.reveal.included.join(" · ")}</div>}
      {r.reveal.notPicked.length > 0 && <div className="text-xs text-slate-500">We also offered (the customer passed): {r.reveal.notPicked.join(" · ")}</div>}
      {r.reveal.note && <p className="text-sm text-slate-600">{r.reveal.note}</p>}
      {r.reveal.photos.map((p, i) => <Photo key={p} id={p} big={i === 0} caption={i === 0 ? "The finished install" : undefined} />)}
    </Card>
  );
}
