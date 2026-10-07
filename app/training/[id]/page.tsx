"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, GREEN, NAVY, RED } from "@/components/ui";
import { BlindItem, Block, Blocks, Btn, Card, gradeQuotes, H1, QuoteForm, QuoteResult, Rates, Spinner, useBusy } from "../parts";

type Mod = {
  id: string; title: string; goal: string; practice: "read" | "intake" | "blind" | "final"; number: number; next: string | null;
  status: string; detail: string; rates: Rates; lessons: { title: string; blocks: Block[] }[];
  intake?: { routes: string[]; note?: string; items: { id: string; text: string }[] };
};

export default function ModulePage({ params }: { params: { id: string } }) {
  const [m, setM] = useState<Mod | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<Mod>(`/api/training/module/${params.id}`).then(setM).catch((e) => setErr(e.message)), [params.id]);
  useEffect(() => { load(); }, [load]);
  if (!m) return err ? <div className="p-6 text-red-600">{err}</div> : <Spinner />;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/training" className="text-sm font-semibold flex items-center gap-1" style={{ color: NAVY }}><ChevronLeft size={16} /> All modules</Link>
      <H1 sub={m.goal}>{m.number}. {m.title}</H1>
      {m.detail && <div className="text-sm font-semibold" style={{ color: m.status === "passed" ? GREEN : NAVY }}>{m.status === "passed" ? "Passed" : "In progress"} · {m.detail}</div>}
      {m.lessons.map((l, i) => (
        <Card key={i} className="space-y-3">
          <h2 className="font-bold text-lg" style={{ color: NAVY }}>{l.title}</h2>
          <Blocks blocks={l.blocks} />
        </Card>
      ))}
      {m.practice === "read" && <MarkRead m={m} onDone={load} />}
      {m.practice === "intake" && m.intake && <IntakeDrill m={m} onDone={load} />}
      {m.practice === "blind" && <BlindPractice m={m} onDone={load} />}
      {m.practice === "final" && <FinalCheck m={m} onDone={load} />}
      {m.next && <Link href={`/training/${m.next}`} className="block text-right font-semibold" style={{ color: NAVY }}>Next module →</Link>}
    </div>
  );
}

function MarkRead({ m, onDone }: { m: Mod; onDone: () => void }) {
  const { busy, run } = useBusy();
  if (m.status === "passed") return <p className="text-sm font-semibold" style={{ color: GREEN }}>Marked as read.</p>;
  return <Btn disabled={busy} onClick={() => run(async () => { await api("/api/training", { method: "POST", json: { action: "read", module: m.id } }); onDone(); })}>I've read this</Btn>;
}

function IntakeDrill({ m, onDone }: { m: Mod; onDone: () => void }) {
  const q = m.intake!;
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [res, setRes] = useState<{ score: number; of: number; results: { id: string; answer: number; why: string; right: boolean }[] } | null>(null);
  const { busy, err, run } = useBusy();
  const by = new Map(res?.results.map((r) => [r.id, r]));
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>Practice: route the request</h2>
        <p className="text-sm text-slate-500">Pick what you'd do first with each request. Pass is 8 of {q.items.length}.{q.note ? ` ${q.note}` : ""}</p>
      </div>
      {q.items.map((it, i) => {
        const r = by.get(it.id);
        return (
          <div key={it.id} className="space-y-2">
            <div className="font-semibold text-sm">{i + 1}. {it.text}</div>
            <div className="flex flex-wrap gap-2">
              {q.routes.map((route, j) => {
                const on = picked[it.id] === j, right = r && r.answer === j;
                return (
                  <button key={j} disabled={!!res} onClick={() => setPicked({ ...picked, [it.id]: j })}
                    className="text-sm rounded-full px-3 py-1 border"
                    style={{ borderColor: right ? GREEN : on ? (r ? RED : NAVY) : "#CBD5E1", background: on ? (r ? (right ? "#E8F6EE" : "#FDECEC") : "#E6ECF5") : right ? "#E8F6EE" : "white" }}>
                    {route}
                  </button>
                );
              })}
            </div>
            {r && <p className="text-sm" style={{ color: r.right ? GREEN : RED }}>{r.right ? "Right. " : "Not quite. "}<span className="text-slate-600">{r.why}</span></p>}
          </div>
        );
      })}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res ? (
        <div className="flex items-center gap-3">
          <b style={{ color: res.score / res.of >= 0.8 ? GREEN : RED }}>{res.score} of {res.of} right</b>
          <Btn ghost onClick={() => { setRes(null); setPicked({}); }}>Try again</Btn>
        </div>
      ) : (
        <Btn disabled={busy || Object.keys(picked).length < q.items.length}
          onClick={() => run(async () => { setRes(await api("/api/training", { method: "POST", json: { action: "intake", answers: picked } })); onDone(); })}>
          Check my answers
        </Btn>
      )}
    </Card>
  );
}

function BlindPractice({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [item, setItem] = useState<BlindItem | null>(null);
  const [vals, setVals] = useState<string[]>([]);
  const [res, setRes] = useState<QuoteResult | null>(null);
  const { busy, err, run } = useBusy();
  const next = () => run(async () => {
    const r = await api<{ items: BlindItem[] }>("/api/training/practice?mode=blind");
    setItem(r.items[0] ?? null); setVals([]); setRes(null);
  });
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>Practice: price a past job blind</h2>
        <p className="text-sm text-slate-500">A real sold quote with the prices hidden. Price every line, then see what Light DMV charged. Pass is 5 quotes with at least 3 totals within {m.rates.passPct}%.</p>
      </div>
      {!item ? <Btn disabled={busy} onClick={next}>Start a practice quote</Btn> : (
        <>
          <QuoteForm item={item} result={res ?? undefined} values={vals} onChange={setVals} />
          {res ? <Btn disabled={busy} onClick={next}>Next quote</Btn> : (
            <Btn disabled={busy || item.lines.some((_, i) => !vals[i])}
              onClick={() => run(async () => { const r = await gradeQuotes("blind", [item], [vals]); setRes(r.results[0]); onDone(); })}>
              Check my prices
            </Btn>
          )}
        </>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}

function FinalCheck({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [items, setItems] = useState<BlindItem[] | null>(null);
  const [vals, setVals] = useState<string[][]>([]);
  const [res, setRes] = useState<{ results: QuoteResult[]; within: number; of: number } | null>(null);
  const { busy, err, run } = useBusy();
  const start = () => run(async () => {
    const r = await api<{ items: BlindItem[] }>("/api/training/practice?mode=final");
    setItems(r.items); setVals(r.items.map(() => [])); setRes(null);
  });
  const ready = items && items.every((it, i) => it.lines.every((_, j) => vals[i]?.[j]));
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>Final check: 5 past jobs</h2>
        <p className="text-sm text-slate-500">Price all 5, then submit. You pass when every quote total is within {m.rates.passPct}% of the real price.</p>
      </div>
      {!items ? <Btn disabled={busy} onClick={start}>Start the final check</Btn> : (
        <>
          {items.map((it, i) => (
            <div key={it.id} className="space-y-2">
              <div className="font-bold" style={{ color: NAVY }}>Job {i + 1} of {items.length}</div>
              <QuoteForm item={it} result={res?.results[i]} values={vals[i] ?? []} onChange={(v) => { const n = [...vals]; n[i] = v; setVals(n); }} />
            </div>
          ))}
          {res ? (
            <div className="space-y-2">
              <div className="font-bold text-lg" style={{ color: res.within === res.of ? GREEN : RED }}>
                {res.within} of {res.of} within {m.rates.passPct}%. {res.within === res.of ? "Passed." : "Not yet: study the lines marked Off and try again."}
              </div>
              <Btn onClick={start} disabled={busy}>New set of 5</Btn>
            </div>
          ) : (
            <Btn disabled={busy || !ready} onClick={() => run(async () => { setRes(await gradeQuotes("final", items, vals)); onDone(); })}>Submit all 5</Btn>
          )}
        </>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}
