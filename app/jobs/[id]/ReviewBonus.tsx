"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Me } from "@/components/ui";
import type { ReviewBonus as Bonus } from "../types";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** $50 for each Google review collected with someone's review card on this job. The office can change the amount
 *  or take it off (it goes back to the Review cards page to assign). */
export default function ReviewBonus({ items, onChange }: { items?: Bonus[]; onChange: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  if (!items?.length) return null;
  const office = me?.role === "owner" || me?.role === "manager";

  async function save(id: string, json: Record<string, unknown>) {
    setErr("");
    try { await api("/api/reviews", { method: "POST", json: { id, ...json } }); setEdit(null); onChange(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="text-sm space-y-1">
      {items.map((b) => (
        <div key={b.reviewId}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-green-700">Google review bonus: {b.person} {money(b.amount)}</span>
            <span className="text-slate-400">{b.reviewer}&apos;s review</span>
            {office && edit !== b.reviewId && <>
              <button className="underline text-slate-500" onClick={() => { setVal(String(b.amount)); setEdit(b.reviewId); }}>Change</button>
              <button className="underline text-slate-500" onClick={() => save(b.reviewId, { reopen: true })}>Take off</button>
            </>}
          </div>
          {office && b.how && <div className="text-xs text-slate-400">{b.how} <Link href="/reviews" className="underline">Review cards</Link></div>}
          {edit === b.reviewId && (
            <div className="flex items-center gap-2">
              <span>$</span>
              <input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ""))}
                className="w-24 border border-slate-300 rounded-lg px-2 py-1" autoFocus />
              <button className="font-semibold text-green-700" onClick={() => save(b.reviewId, { amount: val })}>Save</button>
              <button className="text-slate-500" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          )}
        </div>
      ))}
      {err && <div className="text-red-600">{err}</div>}
    </div>
  );
}
