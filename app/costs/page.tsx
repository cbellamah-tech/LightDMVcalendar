"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Package, Trash2, Upload } from "lucide-react";
import { api, fmtDay, GREEN, NAVY, RED } from "@/components/ui";

/* Owners' Costs: what our materials cost, what each job used and made, and what's left in the warehouse. */

type Key = "c9" | "c7" | "clip" | "male" | "female" | "wire" | "ext" | "mini";
type Line = { key: Key; description: string; qty: number; perQty: number; price: number; landed: number };
type Order = { id: string; label: string; date?: string; discountPct?: number; lines: Line[]; addedAt: number; addedBy?: string };
type Settings = { bulbsPerFt: number; clipsPerBulb: number; runFt: number; extFtPerJob: number; crewPct: number; repeatNewPct: number; chargePerFt: number; chargePerStrand: number };
type Unit = { perUnit: number; bought: number; landed: number; cf: number };
type Row = {
  id: string; jobNumber?: number; title: string; client: string; start: string; kind: string; crew?: string; repeat?: boolean;
  logged: { rooflineFt: number; c7Bulbs: number; miniStrands: number } | null;
  materials: number; fromBin: boolean; missing: Key[]; sold?: { amount: number; source: string }; crewPay: number; left?: number; marginPct?: number;
};
type Stock = { key: Key; name: string; unit: string; bought: number; used: number; onHand: number; value: number };
type Data = { orders: Order[]; settings: Settings; unitCosts: Partial<Record<Key, Unit>>; rows: Row[]; stock: Stock[] };

const NAMES: Record<Key, string> = {
  c9: "C9 LED bulb", c7: "C7 bulb", clip: "Tulip clip", male: "Male plug", female: "Female plug",
  wire: "C9 socket wire", ext: "Extension cord", mini: "Mini light strand",
};
const UNIT: Record<Key, string> = { c9: "bulb", c7: "bulb", clip: "clip", male: "plug", female: "plug", wire: "ft", ext: "ft", mini: "strand" };

const $ = (n: number, cents = false) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const $u = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: n < 1 ? 3 : 2 });
const n0 = (n: number) => Math.round(n).toLocaleString();
const card = "bg-white rounded-xl border border-slate-200 p-4";
const h2 = "text-lg font-extrabold mb-2";

/** Material cost of a foot of C9 roofline: bulb + clip + a foot of socket wire + a share of the plugs. */
function perFoot(uc: Data["unitCosts"], s: Settings) {
  const p = (k: Key) => uc[k]?.perUnit ?? 0;
  return s.bulbsPerFt * p("c9") + s.bulbsPerFt * s.clipsPerBulb * p("clip") + p("wire") + (p("male") + p("female")) / s.runFt;
}

export default function CostsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback((sold = true) => api<Data>(`/api/costs${sold ? "" : "?sold=0"}`).then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function post(json: any) {
    setBusy(true); setErr("");
    try { await api("/api/costs", { method: "POST", json }); await load(false); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function upload(f: File) {
    try {
      const order = JSON.parse(await f.text());
      await post({ action: "addOrder", order });
    } catch (e: any) { setErr(`That file didn't read as a cost sheet: ${e.message}`); }
  }

  if (!d) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;

  const uc = d.unitCosts, s = d.settings;
  const haveCosts = d.orders.length > 0;
  const shown = d.rows.filter((r) => r.kind === "install" || r.logged);
  const logged = shown.filter((r) => r.logged);
  const priced = logged.filter((r) => r.sold);
  const sum = (f: (r: Row) => number) => priced.reduce((a, r) => a + f(r), 0);
  const totSold = sum((r) => r.sold!.amount), totMat = sum((r) => r.materials), totCrew = sum((r) => r.crewPay);
  const totLeft = totSold - totMat - totCrew;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Costs</h1>
          <p className="text-sm text-slate-500">Owners only. What our lights cost us, what each job used and made, and what's left in the warehouse.</p>
        </div>
        <UploadButton onFile={upload} busy={busy} label={haveCosts ? "Add another order" : "Upload cost sheet"} />
      </div>
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{err}</div>}

      {!haveCosts && (
        <div className={card}>
          <p className="font-semibold">Upload the supplier cost sheet to start.</p>
          <p className="text-sm text-slate-600 mt-1">
            Tap <b>Upload cost sheet</b> and pick <b>light_dmv_cost_sheet.json</b> from your Downloads. Prices are kept in the app's database, never in the code.
          </p>
        </div>
      )}

      {haveCosts && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Jobs with counts" value={`${logged.length} of ${shown.length}`} />
            <Tile label="Sold (those jobs)" value={$(totSold)} />
            <Tile label="Materials" value={$(totMat)} />
            <Tile label={`Crew pay (${s.crewPct}%)`} value={$(totCrew)} />
            <Tile label="Left over" value={priced.length ? `${$(totLeft)} · ${Math.round((totLeft / totSold) * 100)}%` : "-"} color={totLeft >= 0 ? GREEN : RED} />
          </div>
          <UnitEconomics uc={uc} s={s} />
          <PriceCheck uc={uc} s={s} />
        </>
      )}

      <div className={card}>
        <h2 className={h2} style={{ color: NAVY }}>Job ledger</h2>
        <p className="text-sm text-slate-500 mb-3">
          Fills in by itself from each job checklist (feet of roofline, C7 bulbs, mini strands). Sold price comes from Jobber; tap it to fix.
          {` Repeat customers reuse the lights in their bin, so only ${s.repeatNewPct}% new material (for breakage) is charged to them.`}
        </p>
        {shown.length === 0 ? <p className="text-slate-500 text-sm">No install jobs synced yet.</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-left text-slate-500 border-b">
                <tr><th className="py-2 pr-2">Date</th><th className="pr-2">Job</th><th className="pr-2 text-right">Roofline ft</th><th className="pr-2 text-right">C7</th>
                  <th className="pr-2 text-right">Strands</th><th className="pr-2 text-right">Materials</th><th className="pr-2 text-right">Sold</th>
                  <th className="pr-2 text-right">Crew pay</th><th className="text-right">Left</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-2 whitespace-nowrap">{fmtDay(r.start)}</td>
                    <td className="pr-2">
                      <div className="font-semibold">{r.jobNumber ? `#${r.jobNumber} ` : ""}{r.client || r.title}</div>
                      <div className="text-xs text-slate-500">
                        {r.crew ? r.crew.replace("crew", "Crew ") : "No crew"}{r.repeat ? " · Repeat (bin)" : r.repeat === false ? " · New" : ""}
                        {r.missing.length > 0 && <span className="text-amber-700"> · no price for {r.missing.map((k) => NAMES[k]).join(", ")}</span>}
                      </div>
                    </td>
                    {r.logged ? (
                      <>
                        <td className="pr-2 text-right">{n0(r.logged.rooflineFt)}</td>
                        <td className="pr-2 text-right">{r.logged.c7Bulbs ? n0(r.logged.c7Bulbs) : ""}</td>
                        <td className="pr-2 text-right">{r.logged.miniStrands ? n0(r.logged.miniStrands) : ""}</td>
                        <td className="pr-2 text-right">{$(r.materials, true)}{r.fromBin && <div className="text-xs text-slate-500">bin + {s.repeatNewPct}% new</div>}</td>
                      </>
                    ) : <td colSpan={4} className="pr-2 text-right text-slate-400">not counted yet</td>}
                    <td className="pr-2 text-right"><SoldCell row={r} onSave={(amount) => post({ action: "sold", jobId: r.id, amount })} /></td>
                    <td className="pr-2 text-right">{r.sold ? $(r.crewPay) : ""}</td>
                    <td className="text-right font-semibold" style={{ color: r.left == null ? undefined : r.left >= 0 ? GREEN : RED }}>
                      {r.left != null && r.logged ? <>{$(r.left)}<div className="text-xs font-normal text-slate-500">{Math.round(r.marginPct!)}%</div></> : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {haveCosts && <StockCard stock={d.stock} uc={uc} s={s} />}
      {haveCosts && d.orders.map((o) => <OrderCard key={o.id} o={o} busy={busy} onSave={(order) => post({ action: "saveOrder", order })} onDelete={() => post({ action: "deleteOrder", id: o.id })} />)}
      <SettingsCard s={s} busy={busy} onSave={(settings) => post({ action: "settings", settings })} />
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className={card}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-extrabold" style={{ color: color ?? NAVY }}>{value}</div>
    </div>
  );
}

function UploadButton({ onFile, busy, label }: { onFile: (f: File) => void; busy: boolean; label: string }) {
  return (
    <label className="rounded-lg px-4 py-2 text-white font-semibold flex items-center gap-2 cursor-pointer" style={{ background: NAVY }}>
      {busy ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} {label}
      <input type="file" accept=".json,application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

function UnitEconomics({ uc, s }: { uc: Data["unitCosts"]; s: Settings }) {
  const ft = perFoot(uc, s), strand = uc.mini?.perUnit ?? 0;
  const items = [
    { what: "1 ft of C9 roofline", cost: ft, charge: s.chargePerFt, note: "bulb, clip, socket wire and plugs" },
    { what: "1 mini light strand", cost: strand, charge: s.chargePerStrand, note: "100 lights, 33 ft" },
    { what: "9-10 ft pillar (2 strands)", cost: strand * 2, charge: s.chargePerStrand * 2, note: "" },
    { what: "100 ft roofline job", cost: ft * 100 + (uc.ext?.perUnit ?? 0) * s.extFtPerJob, charge: s.chargePerFt * 100, note: `plus ${s.extFtPerJob} ft extension cord` },
  ];
  return (
    <div className={card}>
      <h2 className={h2} style={{ color: NAVY }}>What it costs us vs. what we charge</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((i) => (
          <div key={i.what} className="rounded-lg bg-slate-50 p-3">
            <div className="font-semibold">{i.what}</div>
            <div className="text-sm mt-1">Costs us <b>{$u(i.cost)}</b> · we charge <b>{$(i.charge)}</b></div>
            <div className="text-sm" style={{ color: GREEN }}>{i.cost > 0 ? `Materials are ${Math.round((i.cost / i.charge) * 100)}% of the price` : "Add prices to see this"}</div>
            {i.note && <div className="text-xs text-slate-500 mt-1">{i.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PriceCheck({ uc, s }: { uc: Data["unitCosts"]; s: Settings }) {
  const [ft, setFt] = useState("100"), [c7, setC7] = useState("0"), [st, setSt] = useState("4"), [price, setPrice] = useState("");
  const r = useMemo(() => {
    const f = +ft || 0, c = +c7 || 0, m = +st || 0;
    const p = (k: Key) => uc[k]?.perUnit ?? 0;
    const mat = f * perFoot(uc, s) + c * (p("c7") + s.clipsPerBulb * p("clip")) + m * p("mini") + (f || c || m ? s.extFtPerJob * p("ext") : 0);
    const list = f * s.chargePerFt + m * s.chargePerStrand;
    const sold = price === "" ? list : +price || 0;
    const crew = (sold * s.crewPct) / 100;
    return { mat, list, sold, crew, left: sold - mat - crew, noC7: c > 0 && !uc.c7 };
  }, [ft, c7, st, price, uc, s]);
  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2";
  return (
    <div className={card}>
      <h2 className={`${h2} flex items-center gap-2`} style={{ color: NAVY }}><Calculator size={18} /> Price check</h2>
      <p className="text-sm text-slate-500 mb-3">Before sending a quote, see what the job costs us and what's left after crew pay.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-sm">Feet of roofline<input className={inp} inputMode="decimal" value={ft} onChange={(e) => setFt(e.target.value)} /></label>
        <label className="text-sm">C7 bulbs<input className={inp} inputMode="decimal" value={c7} onChange={(e) => setC7(e.target.value)} /></label>
        <label className="text-sm">Mini strands<input className={inp} inputMode="decimal" value={st} onChange={(e) => setSt(e.target.value)} /></label>
        <label className="text-sm">Quote price<input className={inp} inputMode="decimal" placeholder={$(r.list)} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>Materials <b>{$(r.mat, true)}</b></div>
        <div>Crew pay ({s.crewPct}%) <b>{$(r.crew)}</b></div>
        <div>Price <b>{$(r.sold)}</b>{price === "" && <span className="text-slate-500"> at ${s.chargePerFt}/ft, ${s.chargePerStrand}/strand</span>}</div>
        <div style={{ color: r.left >= 0 ? GREEN : RED }}>Left <b>{$(r.left)}</b>{r.sold > 0 && ` (${Math.round((r.left / r.sold) * 100)}%)`}</div>
      </div>
      {r.noC7 && <p className="text-xs text-amber-700 mt-2">No C7 price yet; add a C7 line to an order to count them.</p>}
    </div>
  );
}

function StockCard({ stock, uc, s }: { stock: Stock[]; uc: Data["unitCosts"]; s: Settings }) {
  const get = (k: Key) => stock.find((x) => x.key === k)?.onHand ?? 0;
  // Roofline is limited by whichever runs out first: bulbs, clips, or socket wire.
  const rooflineFt = Math.max(0, Math.min(get("c9") / s.bulbsPerFt, get("clip") / (s.bulbsPerFt * s.clipsPerBulb), get("wire")));
  const total = stock.reduce((a, x) => a + Math.max(0, x.value), 0);
  return (
    <div className={card}>
      <h2 className={`${h2} flex items-center gap-2`} style={{ color: NAVY }}><Package size={18} /> Stock on hand</h2>
      <p className="text-sm text-slate-600 mb-3">
        Enough for about <b>{n0(rooflineFt)} ft</b> of new C9 roofline and <b>{n0(get("mini"))}</b> mini strands. Stock is worth about <b>{$(total)}</b> at our cost.
      </p>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="text-left text-slate-500 border-b">
            <tr><th className="py-2 pr-2">Material</th><th className="pr-2 text-right">Bought</th><th className="pr-2 text-right">Used on jobs</th><th className="pr-2 text-right">On hand</th><th className="text-right">Our cost each</th></tr>
          </thead>
          <tbody>
            {stock.map((x) => (
              <tr key={x.key} className="border-b last:border-0">
                <td className="py-2 pr-2">{NAMES[x.key]}</td>
                <td className="pr-2 text-right">{n0(x.bought)} {x.unit}</td>
                <td className="pr-2 text-right">{n0(x.used)}</td>
                <td className="pr-2 text-right font-semibold" style={{ color: x.onHand < 0 ? RED : undefined }}>{x.bought ? n0(x.onHand) : <span className="font-normal text-slate-400">not on any order</span>}</td>
                <td className="text-right">{uc[x.key] ? `${$u(uc[x.key]!.perUnit)}/${x.unit}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderCard({ o, busy, onSave, onDelete }: { o: Order; busy: boolean; onSave: (o: Order) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState<Order | null>(null);
  const cur = edit ?? o;
  const cf = cur.lines.reduce((a, l) => a + l.qty * l.price, 0), landed = cur.lines.reduce((a, l) => a + l.landed, 0);
  const setLine = (i: number, k: keyof Line, v: string) =>
    setEdit({ ...cur, lines: cur.lines.map((l, j) => (j === i ? { ...l, [k]: k === "description" || k === "key" ? v : Number(v) || 0 } : l)) });
  const cell = "w-24 rounded border border-slate-300 px-2 py-1 text-right";
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: NAVY }}>{o.label}</h2>
          <p className="text-xs text-slate-500">{o.date ? `${o.date} · ` : ""}added by {o.addedBy ?? "an owner"} {fmtDay(o.addedAt)}</p>
        </div>
        <div className="flex gap-2">
          {edit ? (
            <>
              <button disabled={busy} className="rounded-lg px-3 py-1.5 text-white font-semibold text-sm" style={{ background: NAVY }} onClick={() => { onSave(edit); setEdit(null); }}>Save</button>
              <button className="rounded-lg px-3 py-1.5 border text-sm" onClick={() => setEdit(null)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="rounded-lg px-3 py-1.5 border text-sm font-semibold" onClick={() => setEdit(structuredClone(o))}>Edit prices</button>
              <button aria-label="Delete order" className="rounded-lg px-2 py-1.5 border text-sm text-red-600"
                onClick={() => { if (confirm(`Delete "${o.label}"? Unit costs and stock will be recalculated without it.`)) onDelete(); }}><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto -mx-4 px-4 mt-2">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-slate-500 border-b">
            <tr><th className="py-2 pr-2">Item</th><th className="pr-2 text-right">Qty</th><th className="pr-2 text-right">C&F price</th><th className="pr-2 text-right">Amount</th><th className="pr-2 text-right">Landed cost</th><th className="text-right">Our cost each</th></tr>
          </thead>
          <tbody>
            {cur.lines.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 pr-2">{l.description}{l.perQty > 1 && <span className="text-xs text-slate-500"> ({n0(l.perQty)} {UNIT[l.key]} each)</span>}</td>
                <td className="pr-2 text-right">{edit ? <input className={cell} value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} /> : n0(l.qty)}</td>
                <td className="pr-2 text-right">{edit ? <input className={cell} value={l.price} onChange={(e) => setLine(i, "price", e.target.value)} /> : $(l.price, true)}</td>
                <td className="pr-2 text-right">{$(l.qty * l.price, true)}</td>
                <td className="pr-2 text-right">{edit ? <input className={cell} value={l.landed} onChange={(e) => setLine(i, "landed", e.target.value)} /> : $(l.landed, true)}</td>
                <td className="text-right font-semibold">{$(l.landed / l.qty, true)}{l.perQty > 1 && <div className="text-xs font-normal text-slate-500">{$u(l.landed / (l.qty * l.perQty))}/{UNIT[l.key]}</div>}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-2">Total</td><td /><td />
              <td className="pr-2 text-right">{$(cf, true)}</td><td className="pr-2 text-right">{$(landed, true)}</td>
              <td className="text-right text-xs font-normal text-slate-500">landed is {Math.round((landed / cf - 1) * 100)}% over C&F</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!!o.discountPct && (
        <p className="text-sm text-slate-600 mt-2">
          Less {o.discountPct}% discount: {$((cf * o.discountPct) / 100, true)} off C&F. The cost per piece above follows the sheet and doesn't take the discount off.
        </p>
      )}
    </div>
  );
}

function SettingsCard({ s, busy, onSave }: { s: Settings; busy: boolean; onSave: (s: Settings) => void }) {
  const [v, setV] = useState(s);
  useEffect(() => setV(s), [s]);
  const fields: { k: keyof Settings; label: string }[] = [
    { k: "bulbsPerFt", label: "C9 bulbs per foot of roofline" },
    { k: "clipsPerBulb", label: "Clips per bulb" },
    { k: "runFt", label: "Feet per run (one male + one female plug)" },
    { k: "extFtPerJob", label: "Extension cord feet per job" },
    { k: "crewPct", label: "Crew pay, % of sold price" },
    { k: "repeatNewPct", label: "Repeat customers: % new material for breakage" },
    { k: "chargePerFt", label: "We charge per foot of roofline ($)" },
    { k: "chargePerStrand", label: "We charge per mini strand ($)" },
  ];
  const dirty = JSON.stringify(v) !== JSON.stringify(s);
  return (
    <div className={card}>
      <h2 className={h2} style={{ color: NAVY }}>How jobs are counted</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map((f) => (
          <label key={f.k} className="text-sm">{f.label}
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" inputMode="decimal" value={String(v[f.k])}
              onChange={(e) => setV({ ...v, [f.k]: e.target.value as any })} />
          </label>
        ))}
      </div>
      {dirty && <button disabled={busy} className="mt-3 rounded-lg px-4 py-2 text-white font-semibold" style={{ background: NAVY }} onClick={() => onSave(v)}>Save</button>}
    </div>
  );
}

function SoldCell({ row, onSave }: { row: Row; onSave: (amount: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  if (v === null) return (
    <button className="underline decoration-dotted text-right" title={row.sold?.source === "jobber" ? "From Jobber; tap to change" : "Tap to enter"}
      onClick={() => setV(row.sold ? String(row.sold.amount) : "")}>
      {row.sold ? $(row.sold.amount) : <span className="text-slate-400">add</span>}
    </button>
  );
  const save = () => { if (v !== (row.sold ? String(row.sold.amount) : "")) onSave(v); setV(null); };
  return (
    <input autoFocus className="w-24 rounded border border-slate-300 px-2 py-1 text-right" inputMode="decimal" value={v}
      onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setV(null); }} />
  );
}
