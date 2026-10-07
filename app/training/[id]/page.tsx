"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, GREEN, NAVY, RED } from "@/components/ui";
import { Band, Blocks, Btn, Card, H1, LessonCard, money, Rates, Spinner, useBusy } from "../parts";
import { Product, QuoteSim, SimCase, SimResult } from "../QuoteSim";

type Mod = {
  id: string; title: string; goal: string; practice: "read" | "intake" | "blind" | "final" | "objections"; number: number; next: string | null;
  status: string; detail: string; rates: Rates; bands: Band[]; cards: LessonCard[];
  drill?: { routes?: string[]; note?: string; items: { id: string; text: string; options?: string[] }[] };
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
      <Lesson m={m} onDone={load} />
      {(m.practice === "intake" || m.practice === "objections") && m.drill && <Drill m={m} onDone={load} />}
      {m.practice === "blind" && <Practice m={m} onDone={load} />}
      {m.practice === "final" && <Final m={m} onDone={load} />}
      {m.next && <Link href={`/training/${m.next}`} className="block text-right font-semibold" style={{ color: NAVY }}>Next module →</Link>}
    </div>
  );
}

/** Lesson cards one at a time; a card with a quick check opens the next card once it's answered. */
function Lesson({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const card = m.cards[i];
  if (!card) return null;
  const ch = card.check;
  const answered = !ch || picked[i] != null;
  const last = i === m.cards.length - 1;

  async function finish() {
    setFinished(true);
    await api("/api/training", { method: "POST", json: { action: "read", module: m.id } }).catch(() => {});
    onDone();
  }

  return (
    <Card className="space-y-4">
      <div className="flex gap-1">{m.cards.map((_, j) => <div key={j} className="h-1.5 flex-1 rounded-full" style={{ background: j <= i ? NAVY : "#E2E8F0" }} />)}</div>
      <h2 className="font-bold text-lg" style={{ color: NAVY }}>{card.title}</h2>
      <Blocks blocks={card.blocks} />
      {ch && (
        <div className="rounded-lg bg-slate-50 p-3 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick check</div>
          <div className="font-semibold text-sm">{ch.q}</div>
          <div className="flex flex-col gap-1.5">
            {ch.options.map((o, j) => {
              const done = picked[i] != null, right = j === ch.answer, mine = picked[i] === j;
              return (
                <button key={j} disabled={done} onClick={() => setPicked({ ...picked, [i]: j })} className="text-left text-sm rounded-lg border px-3 py-2 bg-white"
                  style={{ borderColor: done && right ? GREEN : done && mine ? RED : "#CBD5E1", background: done && right ? "#E8F6EE" : done && mine ? "#FDECEC" : "white" }}>
                  {o}
                </button>
              );
            })}
          </div>
          {picked[i] != null && <p className="text-sm" style={{ color: picked[i] === ch.answer ? GREEN : RED }}>{picked[i] === ch.answer ? "Right. " : "Not quite. "}<span className="text-slate-600">{ch.why}</span></p>}
        </div>
      )}
      <div className="flex justify-between items-center">
        <Btn ghost disabled={i === 0} onClick={() => setI(i - 1)}>Back</Btn>
        <span className="text-xs text-slate-500">{i + 1} of {m.cards.length}</span>
        {last
          ? <Btn disabled={!answered || finished} onClick={finish}>{finished ? "Done" : "Finish lesson"}</Btn>
          : <Btn disabled={!answered} onClick={() => setI(i + 1)}>Next</Btn>}
      </div>
    </Card>
  );
}

/** Intake routing or objection handling: one question at a time with the answer right after. */
function Drill({ m, onDone }: { m: Mod; onDone: () => void }) {
  const d = m.drill!;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [res, setRes] = useState<{ score: number; of: number; results: { id: string; answer: number; why: string; right: boolean }[] } | null>(null);
  const { busy, err, run } = useBusy();
  const q = d.items[i];
  const options = q?.options ?? d.routes ?? [];
  const r = res?.results.find((x) => x.id === q?.id);
  const title = m.practice === "intake" ? "Practice: what do you do with this request?" : "Practice: what do you say?";

  async function check() {
    await run(async () => {
      setRes(await api("/api/training", { method: "POST", json: { action: m.practice, answers: picked } }));
      onDone();
    });
  }
  const allPicked = d.items.every((x) => picked[x.id] != null);

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>{title}</h2>
        <p className="text-sm text-slate-500">{d.items.length} questions; pass is 8 in 10.{d.note ? ` ${d.note}` : ""}</p>
      </div>
      <div className="flex gap-1">{d.items.map((x, j) => {
        const rr = res?.results.find((y) => y.id === x.id);
        return <button key={x.id} onClick={() => setI(j)} className="h-6 flex-1 rounded text-[11px] font-bold"
          style={{ background: rr ? (rr.right ? "#E8F6EE" : "#FDECEC") : j === i ? NAVY : picked[x.id] != null ? "#E6ECF5" : "#F1F5F9", color: rr ? (rr.right ? GREEN : RED) : j === i ? "white" : NAVY }}>{j + 1}</button>;
      })}</div>
      {q && (
        <div className="space-y-2">
          <div className="font-semibold">{q.text}</div>
          <div className="flex flex-col gap-1.5">
            {options.map((o, j) => {
              const mine = picked[q.id] === j, right = r && r.answer === j;
              return (
                <button key={j} disabled={!!res} onClick={() => { setPicked({ ...picked, [q.id]: j }); if (i < d.items.length - 1) setTimeout(() => setI(i + 1), 250); }}
                  className="text-left text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: right ? GREEN : mine ? (r ? RED : NAVY) : "#CBD5E1", background: right ? "#E8F6EE" : mine ? (r ? "#FDECEC" : "#E6ECF5") : "white" }}>
                  {o}
                </button>
              );
            })}
          </div>
          {r && <p className="text-sm" style={{ color: r.right ? GREEN : RED }}>{r.right ? "Right. " : "Not quite. "}<span className="text-slate-600">{r.why}</span></p>}
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res ? (
        <div className="flex items-center gap-3">
          <b style={{ color: res.score / res.of >= 0.8 ? GREEN : RED }}>{res.score} of {res.of} right</b>
          <span className="text-xs text-slate-500">Tap a number to see why.</span>
          <Btn ghost onClick={() => { setRes(null); setPicked({}); setI(0); }}>Try again</Btn>
        </div>
      ) : (
        <Btn disabled={busy || !allPicked} onClick={check}>{allPicked ? "Check my answers" : `Answer all ${d.items.length} to check`}</Btn>
      )}
    </Card>
  );
}

type CasesResp = { cases: SimCase[]; catalog: Product[]; run?: string };

/** Quote a real past request end to end, then compare with what we sent. */
function Practice({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [d, setD] = useState<CasesResp | null>(null);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  const { busy, err, run } = useBusy();
  const next = () => run(async () => { setD(await api<CasesResp>("/api/training/practice?mode=case")); setN(n + 1); setDone(false); });
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>Practice: quote a real request</h2>
        <p className="text-sm text-slate-500">A request we really got and sold. Look at the house, measure it, build the quote from our product list, then see what we sent. Pass is 5 quotes with 3 totals within {m.rates.passPct}%.</p>
      </div>
      {!d?.cases[0] ? <Btn disabled={busy} onClick={next}>Start a practice quote</Btn> : (
        <>
          <QuoteSim key={`${d.cases[0].id}-${n}`} c={d.cases[0]} catalog={d.catalog} rates={m.rates} bands={m.bands} mode="case" onDone={() => { setDone(true); onDone(); }} />
          {done && <Btn disabled={busy} onClick={next}>Next request</Btn>}
        </>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}

function Final({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [d, setD] = useState<CasesResp | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<SimResult[]>([]);
  const { busy, err, run } = useBusy();
  const start = () => run(async () => { setD(await api<CasesResp>("/api/training/practice?mode=final")); setI(0); setResults([]); });
  const c = d?.cases[i];
  const fin = results[results.length - 1]?.final;
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>Final check: 5 real requests</h2>
        <p className="text-sm text-slate-500">Quote all 5 the way you would for real. You pass when every total is within {m.rates.passPct}% of what we sent.</p>
      </div>
      {!d ? <Btn disabled={busy} onClick={start}>Start the final check</Btn> : (
        <>
          {c && <QuoteSim key={c.id} c={c} catalog={d.catalog} rates={m.rates} bands={m.bands} mode="final" run={d.run} label={`Request ${i + 1} of ${d.cases.length}`}
            onDone={(r) => { setResults([...results, r]); onDone(); }} />}
          {results.length === i + 1 && i < d.cases.length - 1 && <Btn onClick={() => setI(i + 1)}>Next request ({i + 2} of {d.cases.length})</Btn>}
          {fin && (
            <div className="space-y-2">
              <div className="font-bold text-lg" style={{ color: fin.within === fin.of ? GREEN : RED }}>
                {fin.within} of {fin.of} within {m.rates.passPct}%. {fin.within === fin.of ? "Passed. You're ready to quote." : "Not yet. Look at the lines you were furthest off on and try a new set."}
              </div>
              <div className="text-sm text-slate-600">{results.map((r, j) => `#${j + 1}: you ${money(r.myTotal)} vs ${money(r.realTotal)}`).join(" · ")}</div>
              <Btn onClick={start} disabled={busy}>New set of 5</Btn>
            </div>
          )}
        </>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}
