import { kvGet, kvUpdate } from "./store";
import type { Job } from "./jobs";
import type { JobDetail } from "./jobDetails";

/* What the crew is paid for a visit. Company rule: 20% of the job, 15% at install and 5% at takedown,
   taken from the job's pre-tax total in Jobber. An owner or the manager can set a different amount on any job. */

export const PAY_RATE = { install: 0.15, takedown: 0.05 } as const;

export type CrewPay = { amount: number | null; how: "set" | "rule" | "unknown" };
type Override = { amount: number; by: string; at: number };
const KEY = "ldmv:crewpay";

export const getPayOverrides = async () => (await kvGet<Record<string, Override>>(KEY)) ?? {};

export async function setPayOverride(jobId: string, amount: number | null, by: string) {
  await kvUpdate<Record<string, Override>>(KEY, {}, (all) => {
    if (amount == null) delete all[jobId];
    else all[jobId] = { amount, by, at: Date.now() };
    return all;
  });
}

export function payFor(job: Job, detail: JobDetail | null, overrides: Record<string, Override>): CrewPay {
  const o = overrides[job.id];
  if (o) return { amount: o.amount, how: "set" };
  const rate = PAY_RATE[job.kind as keyof typeof PAY_RATE];
  if (!rate || !detail?.value) return { amount: null, how: "unknown" };
  return { amount: Math.round(detail.value * rate), how: "rule" };
}
