"use client";

import { useEffect, useState } from "react";
import { Receipt, X } from "lucide-react";
import PhotoButton from "@/components/PhotoButton";
import { ago, api, Me } from "@/components/ui";

type Expense = { id: string; amount: number; note?: string; photo?: string; by: string; byName: string; at: number; editedBy?: string };
type JobExpenses = { items: Expense[]; none?: { byName: string; at: number } };

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Close-out: receipt photo + total for anything the crew paid for themselves. It adds to the crew's day total. */
export default function Expenses({ jobId, done, onView }: { jobId: string; done: boolean; onView: (u: string) => void }) {
  const [x, setX] = useState<JobExpenses | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [photo, setPhoto] = useState<string | null>(null); // receipt taken, waiting for its total
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<{ id: string; v: string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ expenses: JobExpenses }>(`/api/jobs/${jobId}/expenses`).then((r) => setX(r.expenses)).catch(() => {});
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, [jobId]);

  async function send(body: Record<string, unknown>) {
    setErr("");
    try {
      const r = await api<{ expenses: JobExpenses }>(`/api/jobs/${jobId}/expenses`, { method: "POST", json: body });
      setX(r.expenses);
      return true;
    } catch (e: any) { setErr(e.message); return false; }
  }
  async function add() {
    if (await send({ add: { amount, photo, note } })) {
      // The receipt goes to the customer's Drive folder with the job's other photos.
      if (photo) fetch(`/api/jobs/${jobId}/drive`, { method: "POST" }).catch(() => {});
      setPhoto(null); setAmount(""); setNote(""); setAdding(false);
    }
  }

  if (!x || (!done && !x.items.length)) return null;
  const office = me?.role === "owner" || me?.role === "manager";
  const total = x.items.reduce((t, i) => t + i.amount, 0);
  const asking = !x.items.length && !x.none && !photo && !adding; // just closed out, nothing entered yet
  const entering = photo !== null || adding;

  return (
    <div id="expenses" className={`rounded-xl border-2 p-4 space-y-3 ${asking ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold flex items-center gap-2"><Receipt size={18} /> Expenses on this job</h2>
        {total > 0 && <span className="font-bold text-green-700">{money(total)}</span>}
      </div>

      {asking && <p className="text-sm text-amber-900">Pay for anything yourself? Gas, a part, a toll? Snap the receipt and type the total. It's added to your crew's day total.</p>}
      {x.none && !x.items.length && !entering && <p className="text-sm text-slate-500">No expenses ({x.none.byName}, {ago(x.none.at)}).</p>}

      {x.items.map((i) => (
        <div key={i.id} className="flex items-center gap-3">
          {i.photo
            ? <img src={i.photo} alt="Receipt" onClick={() => onView(i.photo!)} className="w-14 h-14 object-cover rounded-md cursor-pointer border border-slate-200 shrink-0" />
            : <div className="w-14 h-14 rounded-md bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center text-center shrink-0">No receipt</div>}
          <div className="flex-1 min-w-0">
            {edit?.id === i.id ? (
              <div className="flex items-center gap-2">
                <span>$</span>
                <input inputMode="decimal" value={edit.v} onChange={(e) => setEdit({ id: i.id, v: e.target.value })} autoFocus className="w-24 border border-slate-300 rounded-lg px-2 py-1" />
                <button className="font-semibold text-green-700" onClick={async () => (await send({ edit: { id: i.id, amount: edit.v } })) && setEdit(null)}>Save</button>
                <button className="text-slate-500" onClick={() => setEdit(null)}>Cancel</button>
              </div>
            ) : (
              <button className={`font-bold text-lg ${office ? "underline decoration-dotted" : ""}`} disabled={!office}
                onClick={() => setEdit({ id: i.id, v: String(i.amount) })}>{money(i.amount)}</button>
            )}
            <div className="text-xs text-slate-500 truncate">{i.note ? `${i.note} · ` : ""}{i.byName}, {ago(i.at)}{i.editedBy ? ` · changed by ${i.editedBy}` : ""}</div>
          </div>
          {(office || i.by === me?.uid) && (
            <button aria-label="Remove expense" className="text-slate-400 p-1" onClick={() => confirm(`Remove the ${money(i.amount)} expense?`) && send({ remove: i.id })}><X size={18} /></button>
          )}
        </div>
      ))}

      {entering ? (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            {photo && <img src={photo} alt="Receipt" onClick={() => onView(photo)} className="w-14 h-14 object-cover rounded-md cursor-pointer shrink-0" />}
            <label className="flex-1 text-sm font-semibold">Total on the receipt
              <div className="flex items-center gap-1 mt-1">
                <span className="text-lg">$</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus
                  onKeyDown={(e) => e.key === "Enter" && add()} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-lg" />
              </div>
            </label>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What for? (optional)" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 rounded-lg py-2.5 font-bold text-white" style={{ background: "#1F9D55" }}>Add {amount ? money(Number(amount.replace(/[$,\s]/g, "")) || 0) : "expense"}</button>
            <button onClick={() => { setPhoto(null); setAdding(false); setAmount(""); setNote(""); }} className="px-3 text-slate-500">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap items-center">
          <PhotoButton folder={`jobs/${jobId}/receipts`} multiple={false} label={x.items.length ? "Another receipt" : "Snap receipt"} onUploaded={(urls) => setPhoto(urls[0])} />
          <button onClick={() => setAdding(true)} className="text-sm underline text-slate-500">No receipt</button>
          {asking && <button onClick={() => send({ none: true })} className="ml-auto rounded-lg px-4 py-2.5 font-semibold border border-slate-300 bg-white">No expenses</button>}
        </div>
      )}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  );
}
