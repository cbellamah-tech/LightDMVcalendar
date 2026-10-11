"use client";

import { Minus, Plus } from "lucide-react";

/** How many signs went in at this spot (a stoplight gets one per corner). */
export default function SignCount({ value, onChange, label = "Signs put in here" }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="One less" onClick={() => onChange(Math.max(1, value - 1))} className="w-9 h-9 rounded-full border border-slate-300 flex items-center justify-center"><Minus size={16} /></button>
        <span className="w-6 text-center text-lg font-bold">{value}</span>
        <button type="button" aria-label="One more" onClick={() => onChange(Math.min(12, value + 1))} className="w-9 h-9 rounded-full border border-slate-300 flex items-center justify-center"><Plus size={16} /></button>
      </div>
    </div>
  );
}
