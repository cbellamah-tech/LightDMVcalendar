"use client";

import { useEffect, useState } from "react";
import { api, fmtDay, fmtTime, NAVY } from "@/components/ui";
import { mapsLink } from "@/lib/geo";
import type { PayPerson } from "../signs/MyPay";

/** Yard sign placer pay: $2 a sign placed with a photo. Every number opens the signs behind it. */
export default function SignPay() {
  const [d, setD] = useState<{ perSign: number; people: PayPerson[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api("/api/signs/pay").then(setD).catch(() => {}); }, []);
  if (!d) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold mb-1" style={{ color: NAVY }}>Yard sign pay</h2>
      <p className="text-sm text-slate-500 mb-3">${d.perSign} for each sign the sign placer puts in with a photo, spots he added himself included. Tap a person for every sign, its photo and where it is.</p>
      {d.people.length === 0 ? <p className="text-sm text-slate-500">No signs logged yet.</p> : d.people.map((p) => (
        <div key={p.uid} className="border-t first:border-t-0 py-2">
          <button onClick={() => setOpen(open === p.uid ? null : p.uid)} className="w-full text-left flex flex-wrap gap-x-4 gap-y-1 items-baseline">
            <span className="font-bold">{p.name}</span>
            <span className="text-sm">Today <b>${p.today.amount}</b> ({p.today.signs})</span>
            <span className="text-sm">7 days <b>${p.week.amount}</b> ({p.week.signs})</span>
            <span className="text-sm">All <b>${p.all.amount}</b> ({p.all.signs} signs{p.added ? `, ${p.added} new spots` : ""})</span>
          </button>
          {open === p.uid && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                {p.days.map((x) => <span key={x.day} className="rounded-full bg-slate-100 px-2 py-1">{fmtDay(`${x.day}T12:00:00`)}: ${x.amount} · {x.signs} signs</span>)}
              </div>
              <ul className="divide-y text-sm max-h-96 overflow-y-auto">
                {p.recent.map((e: any) => (
                  <li key={e.visitId} className="py-1.5 flex items-center gap-3">
                    {e.photoUrl ? <a href={e.photoUrl} target="_blank" rel="noreferrer"><img src={e.photoUrl} alt="" className="w-12 h-12 object-cover rounded" /></a> : <span className="w-12" />}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-semibold">{e.stopName}{e.added ? " (new spot)" : ""}</span>
                      <span className="block text-xs text-slate-500">{e.routeId} · {fmtDay(e.at)} {fmtTime(e.at)} · {e.signs} sign{e.signs > 1 ? "s" : ""}
                        {e.lat != null && <> · <a className="underline" href={mapsLink(e.lat, e.lng)} target="_blank" rel="noreferrer">map</a></>}</span>
                    </span>
                    <span className="font-bold">${e.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
