"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, GREEN, NAVY, RED } from "@/components/ui";
import { Band, Blocks, Btn, Card, H1, LessonCard, money, Rates, Spinner, useBusy } from "../parts";
import { Job, PriceJob, Result, TreeGroup } from "../PriceJob";

type Mod = {
  id: string; title: string; goal: string; practice: "read" | "drill" | "quotes" | "final"; number: number; next: string | null;
  status: string; detail: string; rates: Rates; bands: Band[]; treeGroups: TreeGroup[]; cards: LessonCard[]; pass: { tries: number; good: number } | null;
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
      {(m.practice === "drill" || m.practice === "quotes") && <Practice m={m} onDone={load} />}
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

type JobsResp = { jobs: Job[]; run?: string };

/** Price real jobs from their photos, one at a time, and see what we charged. */
function Practice({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [d, setD] = useState<JobsResp | null>(null);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  const { busy, err, run } = useBusy();
  const drill = m.practice === "drill";
  const next = () => run(async () => {
    setD(await api<JobsResp>(`/api/training/practice?mode=${drill ? "drill" : "quote"}&module=${m.id}`)); setN(n + 1); setDone(false);
  });
  const job = d?.jobs[0];
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>{drill ? `Practice: price real ${m.title.toLowerCase()}` : "Practice: quote a real job"}</h2>
        <p className="text-sm text-slate-500">
          {drill ? "A house we really lit, with the lines of this type to price. " : "A house we really lit and everything the customer bought. Price every line. "}
          {m.pass ? `Pass: ${m.pass.tries} tries with ${m.pass.good} within ${m.rates.passPct}%.` : ""}
        </p>
      </div>
      {!job ? <Btn disabled={busy} onClick={next}>{drill ? "Start pricing" : "Start a practice quote"}</Btn> : (
        <>
          <PriceJob key={`${job.id}-${n}`} job={job} mode={drill ? "drill" : "quote"} module={m.id} rates={m.rates} bands={m.bands} trees={m.treeGroups}
            onDone={() => { setDone(true); onDone(); }} />
          {done && <Btn disabled={busy} onClick={next}>Next job</Btn>}
        </>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}

function Final({ m, onDone }: { m: Mod; onDone: () => void }) {
  const [d, setD] = useState<JobsResp | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const { busy, err, run } = useBusy();
  const start = () => run(async () => { setD(await api<JobsResp>("/api/training/practice?mode=final")); setI(0); setResults([]); });
  const job = d?.jobs[i];
  const fin = results[results.length - 1]?.final;
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold text-lg" style={{ color: NAVY }}>Final check: 5 real jobs</h2>
        <p className="text-sm text-slate-500">Price all 5 with no hints. You pass when every total is within {m.rates.passPct}% of what we charged.</p>
      </div>
      {!d ? <Btn disabled={busy} onClick={start}>Start the final check</Btn> : (
        <>
          {job && <PriceJob key={job.id} job={job} mode="final" run={d.run} rates={m.rates} bands={m.bands} trees={m.treeGroups} label={`Job ${i + 1} of ${d.jobs.length}`}
            onDone={(r) => { setResults([...results, r]); onDone(); }} />}
          {results.length === i + 1 && i < d.jobs.length - 1 && <Btn onClick={() => setI(i + 1)}>Next job ({i + 2} of {d.jobs.length})</Btn>}
          {fin && (
            <div className="space-y-2">
              <div className="font-bold text-lg" style={{ color: fin.within === fin.of ? GREEN : RED }}>
                {fin.within} of {fin.of} within {m.rates.passPct}%. {fin.within === fin.of ? "Passed. You're ready to quote." : "Not yet. Go back to the line types you were furthest off on, then try a new set."}
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
