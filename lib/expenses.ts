import { kvGet, kvUpdate } from "./store";

/* Out-of-pocket expenses a crew enters when they close out a job (gas, a part from the hardware store, tolls):
   a receipt photo and the total. They're paid back with the crew's pay, so they add to the crew's day total,
   and they count against the job in the owners' Costs ledger. Owners and the manager can fix an amount. */

export type Expense = { id: string; amount: number; note?: string; photo?: string; by: string; byName: string; at: number; editedBy?: string };
export type JobExpenses = { items: Expense[]; none?: { byName: string; at: number } }; // none = the crew said there were none
const KEY = "ldmv:expenses";

export const getAllExpenses = async () => (await kvGet<Record<string, JobExpenses>>(KEY)) ?? {};
export const getJobExpenses = async (jobId: string): Promise<JobExpenses> => (await getAllExpenses())[jobId] ?? { items: [] };
export const expenseTotal = (e?: JobExpenses) => Math.round((e?.items ?? []).reduce((t, x) => t + x.amount, 0) * 100) / 100;

export async function changeExpenses(jobId: string, fn: (e: JobExpenses) => void): Promise<JobExpenses> {
  const all = await kvUpdate<Record<string, JobExpenses>>(KEY, {}, (all) => {
    const e = (all[jobId] ??= { items: [] });
    fn(e);
    if (!e.items.length && !e.none) delete all[jobId];
  });
  return all[jobId] ?? { items: [] };
}

/** "$12.50" typed any way ("12.5", "$12.50", "1,200") -> 12.5; null when it isn't a sensible amount. */
export function parseAmount(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 10000 ? Math.round(n * 100) / 100 : null;
}
