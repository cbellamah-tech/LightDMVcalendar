"use client";

import { Package } from "lucide-react";
import { NAVY } from "@/components/ui";
import { bringAmount, mergeBring, type BringItem } from "@/lib/materials";

/** "What to bring": the materials to load, worked out from the Jobber line items. Several jobs add up into one list. */
export default function Bring({ lists, title = "What to bring", repeatBins, repeatJobs = 0, fold }: {
  lists: (BringItem[] | undefined)[]; title?: string; repeatBins?: string[]; repeatJobs?: number; fold?: boolean;
}) {
  const known = lists.filter((l): l is BringItem[] => !!l && l.length > 0);
  if (!known.length) return null;
  const items = known.length === 1 ? known[0] : mergeBring(known);
  const missing = lists.length - known.length;
  const body = (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-100">
        {items.map((i) => (
          <li key={i.key} className="flex justify-between gap-3 py-1.5 text-sm">
            <span className="font-semibold">{i.label}</span>
            <span className={`text-right shrink-0 ${i.qty == null ? "text-amber-700" : "font-bold"}`} style={i.qty == null ? undefined : { color: NAVY }}>{bringAmount(i)}</span>
          </li>
        ))}
      </ul>
      {repeatBins?.length ? <p className="text-xs text-amber-800">Repeat customer: bin {repeatBins.join(", ")} has their cut lights. Check them against this list.</p> : null}
      {repeatJobs > 0 && <p className="text-xs text-amber-800">{repeatJobs} repeat customer{repeatJobs > 1 ? "s" : ""}: their bins have most of this already.</p>}
      {missing > 0 && <p className="text-xs text-slate-500">{missing} job{missing > 1 ? "s" : ""} not read from Jobber yet. Open {missing > 1 ? "them" : "it"} to check.</p>}
      <p className="text-xs text-slate-500">"About" is worked out from the quote. Add spares: strands, bulbs, plugs, clips and stakes.</p>
    </div>
  );
  if (fold) {
    return (
      <details className="bg-white rounded-xl border border-slate-200 p-3 group">
        <summary className="font-bold flex items-center gap-2 cursor-pointer list-none text-sm" style={{ color: NAVY }}>
          <Package size={16} /> {title} <span className="ml-auto text-xs font-normal text-slate-500 group-open:hidden">Show</span>
        </summary>
        <div className="pt-2">{body}</div>
      </details>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="font-bold flex items-center gap-2"><Package size={16} /> {title}</div>
      {body}
    </div>
  );
}
