import { kvSetMany } from "./store";
import { gql } from "./jobber";
import { buildSelection, fieldsMatching, rows, Spec } from "./jobberSchema";

/* Jobber's side of the owners' customer database: every client, quote and job (with line items and notes),
   one page per call so a long history never hits the function time limit. Queries are built from what the
   account's API says exists (lib/jobberSchema.ts), so a field Jobber renames is left out instead of failing. */

export type CxNote = { at?: string; text: string; from: string };
export type CxMsg = { id: string; at?: string; dir?: "in" | "out"; kind: string; text: string; from: string };
export type CxLine = { name: string; description?: string; qty?: number; unit?: number; total?: number };
export type JClient = {
  id: string; name: string; company?: string; emails: string[]; phones: string[]; addresses: string[];
  tags: string[]; notes: CxNote[]; texts: CxMsg[]; createdAt?: string; updatedAt?: string;
};
export type JQuote = {
  id: string; num?: string; status?: string; title?: string; createdAt?: string; clientId?: string; address?: string;
  subtotal?: number; total?: number; lines: CxLine[]; notes: CxNote[];
};
export type JJob = {
  id: string; num?: string; status?: string; title?: string; createdAt?: string; startAt?: string; completedAt?: string;
  clientId?: string; address?: string; total?: number; lines: CxLine[]; notes: CxNote[]; quoteId?: string;
};

export const JC = "ldmv:cx:jc:";
export const JQ = "ldmv:cx:jq:";
export const JJ = "ldmv:cx:jj:";

const ADDR: Spec = { street: true, street1: true, street2: true, city: true, province: true, postalCode: true };
const ADDRESS: Spec[string] = { sel: ADDR };
const NOTES: Spec[string] = { first: 20, sel: { nodes: { sel: { message: true, createdAt: true } } } };
const LINES: Spec[string] = { first: 40, sel: { nodes: { sel: { name: true, description: true, quantity: true, unitPrice: true, totalPrice: true } } } };

// Text messages, if Jobber ever puts them on the client: any field whose name says so, with whatever message fields it has.
const TEXT_FIELD = /sms|text_?message|textmessage|conversation|communication|messages/i;
const MSG: Spec = { id: true, body: true, message: true, text: true, content: true, direction: true, createdAt: true, sentAt: true, status: true };

const CLIENT: Spec = {
  id: true, name: true, firstName: true, lastName: true, companyName: true, createdAt: true, updatedAt: true,
  emails: { sel: { address: true } }, phones: { sel: { number: true } },
  billingAddress: ADDRESS,
  clientProperties: { first: 10, sel: { nodes: { sel: { address: ADDRESS } } } },
  properties: { first: 10, sel: { nodes: { sel: { address: ADDRESS } } } },
  tags: { first: 20, sel: { nodes: { sel: { label: true } } } },
  notes: NOTES,
};
const QUOTE: Spec = {
  id: true, quoteNumber: true, quoteStatus: true, title: true, createdAt: true, updatedAt: true,
  client: { sel: { id: true } }, property: { sel: { address: ADDRESS } },
  amounts: { sel: { subtotal: true, total: true } }, lineItems: LINES, notes: { first: 10, sel: NOTES.sel },
};
const JOB: Spec = {
  id: true, jobNumber: true, jobStatus: true, title: true, createdAt: true, updatedAt: true, startAt: true, completedAt: true, total: true,
  client: { sel: { id: true } }, property: { sel: { address: ADDRESS } }, quote: { sel: { id: true } },
  amounts: { sel: { subtotal: true, total: true } }, lineItems: LINES, notes: { first: 10, sel: NOTES.sel },
};

const g = globalThis as unknown as { __cxSel?: Record<string, string>; __cxTexts?: string[] };
/** The client fields that hold text messages in this API version (none so far). */
export async function jobberTextFields(): Promise<string[]> {
  if (!g.__cxTexts) g.__cxTexts = await fieldsMatching(gql, "Client", TEXT_FIELD).catch(() => []);
  return g.__cxTexts;
}
async function selection(type: "Client" | "Quote" | "Job"): Promise<string> {
  g.__cxSel ??= {};
  if (!g.__cxSel[type]) {
    let spec = type === "Client" ? CLIENT : type === "Quote" ? QUOTE : JOB;
    if (type === "Client") {
      const extra = Object.fromEntries((await jobberTextFields()).map((f) => [f, { first: 30, sel: { nodes: { sel: MSG }, ...MSG } }]));
      spec = { ...extra, ...spec };
    }
    g.__cxSel[type] = await buildSelection(gql, type, spec);
  }
  return g.__cxSel[type];
}

const addr = (a: any) => {
  if (!a) return "";
  const street = [a.street || a.street1, a.street2].filter(Boolean).join(" ");
  return [street, a.city, a.province, a.postalCode].filter(Boolean).join(", ");
};
const num = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? undefined : Number(v));
const clip = (s: any, n = 4000) => String(s ?? "").trim().slice(0, n);
const notesOf = (x: any, from: string): CxNote[] =>
  rows(x).map((n: any) => ({ at: n.createdAt, text: clip(n.message ?? n.body ?? n.text), from })).filter((n) => n.text);
const linesOf = (x: any): CxLine[] => rows(x).map((l: any) => ({
  name: clip(l.name, 200), description: clip(l.description, 1500) || undefined, qty: num(l.quantity), unit: num(l.unitPrice), total: num(l.totalPrice),
}));

function parseClient(c: any, textFields: string[]): JClient {
  const addresses = [addr(c.billingAddress), ...rows(c.clientProperties ?? c.properties).map((p: any) => addr(p.address ?? p))].filter(Boolean);
  const texts: CxMsg[] = [];
  for (const f of textFields) for (const m of rows(c[f])) {
    const text = clip(m.body ?? m.message ?? m.text ?? m.content);
    if (!text) continue;
    texts.push({ id: String(m.id ?? `${f}:${texts.length}`), at: m.sentAt ?? m.createdAt, dir: /in/i.test(String(m.direction ?? "")) ? "in" : "out", kind: "Text", text, from: "Jobber" });
  }
  const name = clip(c.name, 120) || [c.firstName, c.lastName].filter(Boolean).join(" ") || clip(c.companyName, 120) || "Unnamed";
  return {
    id: String(c.id), name, company: c.companyName || undefined,
    emails: rows(c.emails).map((e: any) => String(e.address ?? e).trim()).filter(Boolean),
    phones: rows(c.phones).map((p: any) => String(p.number ?? p).trim()).filter(Boolean),
    addresses: [...new Set(addresses)], tags: rows(c.tags).map((t: any) => String(t.label ?? t)).filter(Boolean),
    notes: notesOf(c.notes, "Jobber client note"), texts, createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}
const parseQuote = (q: any): JQuote => ({
  id: String(q.id), num: q.quoteNumber != null ? String(q.quoteNumber) : undefined, status: q.quoteStatus, title: q.title, createdAt: q.createdAt,
  clientId: q.client?.id, address: addr(q.property?.address) || undefined,
  subtotal: num(q.amounts?.subtotal), total: num(q.amounts?.total), lines: linesOf(q.lineItems), notes: notesOf(q.notes, "Jobber quote note"),
});
const parseJob = (j: any): JJob => {
  const lines = linesOf(j.lineItems);
  const sum = lines.reduce((t, l) => t + (l.total || 0), 0);
  return {
    id: String(j.id), num: j.jobNumber != null ? String(j.jobNumber) : undefined, status: j.jobStatus, title: j.title, createdAt: j.createdAt,
    startAt: j.startAt, completedAt: j.completedAt, clientId: j.client?.id, address: addr(j.property?.address) || undefined,
    total: sum || num(j.amounts?.subtotal) || num(j.total) || num(j.amounts?.total), lines, notes: notesOf(j.notes, "Jobber job note"), quoteId: j.quote?.id,
  };
};

const ROOT = { Client: "clients", Quote: "quotes", Job: "jobs" } as const;
const PAGE = { Client: 25, Quote: 15, Job: 15 } as const;
export type JobberKind = keyof typeof ROOT;

/** One page of clients, quotes or jobs. `since` asks only for records changed after it (when Jobber takes the filter). */
export async function jobberPage(kind: JobberKind, cursor: string | null, since?: string): Promise<{ count: number; next: string | null }> {
  const sel = await selection(kind);
  const filter = since ? `, filter: { updatedAt: { after: $since } }` : "";
  const q = `query LdmvCx($cursor: String${since ? ", $since: ISO8601DateTime!" : ""}) {
    ${ROOT[kind]}(first: ${PAGE[kind]}, after: $cursor${filter}) { nodes ${sel} pageInfo { hasNextPage endCursor } } }`;
  let d: any;
  try {
    d = await gql(q, since ? { cursor, since } : { cursor });
  } catch (e: any) {
    // A message field Jobber added may need arguments we don't know: drop the texts rather than the whole client list.
    if (kind !== "Client" || !g.__cxTexts?.length || /throttl/i.test(e.message)) throw e;
    g.__cxTexts = [];
    delete g.__cxSel!.Client;
    return jobberPage(kind, cursor, since);
  }
  const conn = d[ROOT[kind]];
  const nodes: any[] = conn?.nodes ?? [];
  const textFields = kind === "Client" ? await jobberTextFields() : [];
  const entries: [string, unknown][] = nodes.map((n) =>
    kind === "Client" ? [JC + n.id, parseClient(n, textFields)] : kind === "Quote" ? [JQ + n.id, parseQuote(n)] : [JJ + n.id, parseJob(n)]);
  await kvSetMany(entries);
  return { count: nodes.length, next: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null };
}

/** Jobber's web pages for a client, quote or job (its API ids wrap the number the web app uses). */
export function jobberWebUrl(id: string, kind: "clients" | "quotes" | "work_orders") {
  try {
    const n = Buffer.from(id, "base64").toString("utf8").match(/\/(\d+)$/)?.[1];
    return n ? `https://secure.getjobber.com/${kind}/${n}` : undefined;
  } catch { return undefined; }
}
