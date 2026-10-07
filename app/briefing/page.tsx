"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, NAVY } from "@/components/ui";
import { Card, Feed, FeedItem } from "../marketing/parts";

/** Owners only: what the CEO, CFO and Tax bots report, and anything they need a yes on. */
export default function Briefing() {
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<{ feed: FeedItem[] }>("/api/marketing?area=owners").then((d) => setFeed(d.feed)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!feed) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;
  const asks = feed.filter((f) => f.ask && !f.answer);
  const rest = feed.filter((f) => !f.ask || f.answer);
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold pt-2" style={{ color: NAVY }}>Briefing</h1>
      {asks.length > 0 && <Card title={`Needs you (${asks.length})`}><Feed items={asks} canAnswer onChange={load} empty="" /></Card>}
      <Card title="From the CEO, CFO and Tax bots">
        <Feed items={rest} canAnswer onChange={load} empty="Nothing yet. Once the CEO, CFO and Tax bots have the drop box line (Marketing tab, Setup), their briefings and deadlines land here." />
      </Card>
    </div>
  );
}
