import { kvGet, kvUpdate } from "./store";
import { gql } from "./jobber";
import { buildSelection, rows } from "./jobberSchema";
import { ghlSendSms } from "./ghl";
import type { Job } from "./jobs";
import type { User } from "./users";

/* "On my way" texts: the crew taps 15 min, 30 min or 1 hour on a job and the customer gets a text.
   Jobber's API can read the client's phone but has no way to text a client, so the text goes out
   through GoHighLevel (the same number customers already hear from), to the phone on the Jobber client.
   Phone numbers are looked up at send time and never saved; the log keeps who, when and how far. */

export const ETA_MINUTES = [15, 30, 60] as const;
export type OmwSend = { at: number; by: string; lead: string; minutes: number; ok: boolean; error?: string };

const key = (jobId: string) => `ldmv:omw:${jobId}`;
export const getOmwLog = async (jobId: string) => (await kvGet<OmwSend[]>(key(jobId))) ?? [];

const CLIENT_SPEC = {
  id: true, name: true, firstName: true, isCompany: true,
  phones: { sel: { number: true, primary: true, smsAllowed: true, description: true } },
} as const;

let selCache: string | null = null;
async function clientFor(jobberJobId: string) {
  selCache ||= (await buildSelection(gql, "Client", CLIENT_SPEC as any)) || "{ id name phones { number } }";
  const d = await gql<{ job: { client?: any } | null }>(`query LdmvOmw($id: EncodedId!) { job(id: $id) { client ${selCache} } }`, { id: jobberJobId });
  return d.job?.client ?? null;
}

/** US numbers to +1XXXXXXXXXX; anything already in + form passes through. */
export function e164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.length >= 11 ? digits : null;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** A phone that takes texts: one Jobber marks SMS-ok, then a mobile, then the primary, then any. */
export function pickPhone(phones: { number?: string; primary?: boolean; smsAllowed?: boolean; description?: string }[]): string | null {
  const ok = phones.filter((p) => p.number && e164(p.number));
  const pick = ok.find((p) => p.smsAllowed) ?? ok.find((p) => /mobile|cell/i.test(p.description ?? "")) ?? ok.find((p) => p.primary) ?? ok[0];
  return pick ? e164(pick.number!) : null;
}

export const etaWords = (m: number) => (m >= 60 ? (m === 60 ? "an hour" : `${m / 60} hours`) : `${m} minutes`);

export function omwText(first: string | null, lead: string, minutes: number) {
  return `Hi${first ? ` ${first}` : ""}, ${lead} from Light DMV is about ${etaWords(minutes)} away for your holiday lights. Reply here if anything has changed.`;
}

/** The crew's lead (Gary on crew 1), else whoever tapped. */
export function leadName(job: Job, users: User[], tapper: string) {
  const lead = job.crew && users.find((u) => u.active && u.role === "lead" && u.crew === job.crew);
  return (lead && lead.name) || tapper;
}

export async function sendOnMyWay(job: Job, minutes: number, by: string, lead: string): Promise<OmwSend> {
  const entry: OmwSend = { at: Date.now(), by, lead, minutes, ok: false };
  try {
    if (!job.jobberJobId) throw new Error("This job isn't from Jobber, so there's no customer to text.");
    const c = await clientFor(job.jobberJobId);
    if (!c) throw new Error("Jobber didn't return the customer on this job.");
    const phone = pickPhone(rows(c.phones));
    if (!phone) throw new Error("The customer has no phone number in Jobber.");
    const first = c.isCompany ? null : String(c.firstName || String(c.name || "").split(/\s+/)[0] || "").trim() || null;
    await ghlSendSms({ phone, firstName: c.firstName || first || undefined, name: c.name || undefined }, omwText(first, lead, minutes));
    entry.ok = true;
  } catch (e: any) {
    entry.error = String(e.message || e).slice(0, 300);
  }
  await kvUpdate<OmwSend[]>(key(job.id), [], (cur) => { cur.push(entry); return cur.slice(-20); });
  return entry;
}
