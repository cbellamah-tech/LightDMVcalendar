"use client";

import { useEffect, useState } from "react";
import { api, Me } from "@/components/ui";
import type { CrewPay } from "../types";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** What the crew gets for this visit. Owners and the manager can set a different amount. */
export default function PayLine({ jobId, kind, pay, onChange }: { jobId: string; kind: string; pay?: CrewPay; onChange: (p: CrewPay) => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  const office = me?.role === "owner" || me?.role === "manager";
  if (!pay || (!office && pay.amount == null)) return null;

  async function save(v: string | null) {
    setErr("");
    try {
      const r = await api<{ pay: CrewPay }>(`/api/jobs/${jobId}`, { method: "POST", json: { crewPay: v } });
      onChange(r.pay);
      setEdit(false);
    } catch (e: any) { setErr(e.message); }
  }

  const why = pay.how === "set" ? "set by the office" : pay.how === "rule" ? `${kind === "takedown" ? "5%" : "15%"} of the job` : "not set yet";
  return (
    <div className="text-sm pt-1 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-green-700">{office ? "Crew pay" : "Your crew's pay"}: {pay.amount != null ? money(pay.amount) : "not set"}</span>
        {office && <span className="text-slate-400">{why}</span>}
        {office && !edit && <button className="underline text-slate-500" onClick={() => { setVal(pay.amount != null ? String(pay.amount) : ""); setEdit(true); }}>Change</button>}
      </div>
      {edit && (
        <div className="flex items-center gap-2">
          <span>$</span>
          <input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ""))}
            className="w-28 border border-slate-300 rounded-lg px-2 py-1" autoFocus />
          <button className="font-semibold text-green-700" onClick={() => save(val)}>Save</button>
          {pay.how === "set" && <button className="text-slate-500 underline" onClick={() => save(null)}>Use the 20% rule</button>}
          <button className="text-slate-500" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      )}
      {err && <div className="text-red-600">{err}</div>}
    </div>
  );
}
