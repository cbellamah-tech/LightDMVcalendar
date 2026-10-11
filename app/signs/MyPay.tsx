"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { api } from "@/components/ui";

type Sum = { signs: number; amount: number };
export type PayPerson = { uid: string; name: string; today: Sum; week: Sum; all: Sum; added: number; days: ({ day: string } & Sum)[]; recent: any[] };

/** The sign placer's running pay: $2 a sign. `bump` reloads it after each saved stop. */
export default function MyPay({ bump = 0, compact = false }: { bump?: number; compact?: boolean }) {
  const [d, setD] = useState<{ perSign: number; people: PayPerson[] } | null>(null);
  useEffect(() => { api("/api/signs/pay").then(setD).catch(() => {}); }, [bump]);
  const me = d?.people[0];
  if (!d || !me) return null;
  if (compact) return <div className="text-sm font-semibold text-green-800">Your pay today: ${me.today.amount} ({me.today.signs} signs) · all time ${me.all.amount}</div>;
  return (
    <div className="bg-white rounded-xl border-2 border-green-600 p-4">
      <div className="flex items-center gap-2 font-bold text-green-800"><DollarSign size={18} /> Your pay · ${d.perSign} a sign</div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        {([["Today", me.today], ["Last 7 days", me.week], ["All time", me.all]] as const).map(([l, s]) => (
          <div key={l} className="rounded-lg bg-green-50 p-2">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-xl font-extrabold text-green-800">${s.amount}</div>
            <div className="text-xs text-slate-500">{s.signs} signs</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-2">Every sign you put in with a photo counts, spots you add yourself too.</p>
    </div>
  );
}
