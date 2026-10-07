"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/ui";

const src = (ref: string, l: number, k: number) => `/api/training/mockup?ref=${encodeURIComponent(ref)}&l=${l}&k=${k}`;

/** Mockup counts per line for a past quote, read from Jobber the first time someone opens it. */
export function useMockups(ref: string | null) {
  const [counts, setCounts] = useState<number[] | null>(null);
  useEffect(() => {
    setCounts(null);
    if (ref) api<{ counts: number[] }>(`/api/training/mockup?ref=${encodeURIComponent(ref)}`).then((r) => setCounts(r.counts)).catch(() => setCounts([]));
  }, [ref]);
  return counts;
}

/** The mockup images on one line (tap to open full size). */
export function LineMockups({ refId, line, count, big }: { refId: string; line: number; count: number; big?: boolean }) {
  const [bad, setBad] = useState<Record<number, boolean>>({});
  if (!count) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {Array.from({ length: count }, (_, k) => bad[k] ? null : (
        <a key={k} href={src(refId, line, k)} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(refId, line, k)} alt="Mockup" loading="lazy" onError={() => setBad({ ...bad, [k]: true })}
            className={`${big ? "h-64" : "h-28"} rounded-lg border border-slate-200 object-cover bg-slate-100`} />
        </a>
      ))}
    </div>
  );
}
