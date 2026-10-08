import { kvGet, kvSet } from "./store";
import { gql } from "./jobber";
import { buildSelection, fieldsMatching, fieldType, rows, Spec } from "./jobberSchema";
import { driveFor, DriveIndex, DriveMatch } from "./drive";
import { jobParts } from "./sops";

/* What a crew needs on site, pulled from the Jobber job, its quote and the client. Never prices:
   the job's dollar value is kept server-side only, to work out crew pay (lib/crewPay.ts). */

export type DetailFile = { name: string; url: string; image: boolean };
export type DetailNote = { from: "job" | "quote"; message: string; at?: string; files: DetailFile[] };
export type DetailLine = { name: string; description?: string; quantity?: number; images: DetailFile[] };
export type JobDetail = {
  fetchedAt: number;
  error?: string;
  createdAt?: string;
  instructions?: string;
  quoteNumber?: string;
  lines: DetailLine[];
  notes: DetailNote[];
  clientName?: string;
  clientTags: string[];
  otherJobs: { jobNumber?: number; title?: string; createdAt?: string }[];
  repeat: boolean;
  repeatWhy?: string;
  bins: string[];           // bin numbers written in Jobber notes
  value?: number;           // pre-tax job total, server-side only (crew pay); withDrive drops it
  quotePdf?: string;        // Jobber link to the signed quote PDF, server-side only (its mockups are copied out)
  quoteMockups?: string[];  // mockups copied out of the signed quote that couldn't be tied to one line
  imgv?: number;            // photo import version this detail was pulled with
};
/** Bump to re-pull every saved detail once (it was saved before photos were copied in). */
const IMGV = 1;
export type JobDetailView = JobDetail & { drive: DriveMatch };

export const FILE: Spec = { fileName: true, name: true, url: true, contentType: true, thumbnailUrl: true };
export const FILES: Spec[string] = { first: 10, sel: { nodes: { sel: FILE } } };
export const LINE: Spec = {
  name: true, description: true, quantity: true, textOnly: true,
  image: { sel: FILE }, images: FILES, fileAttachments: FILES, photos: FILES, imageUrl: true,
};
const NOTES: Spec[string] = { first: 30, sel: { nodes: { sel: { message: true, createdAt: true, fileAttachments: FILES, attachments: FILES } } } };
const JOB_SPEC: Spec = {
  id: true, jobNumber: true, createdAt: true, instructions: true, total: true, amounts: { sel: { subtotal: true, total: true } },
  lineItems: { first: 50, sel: { nodes: { sel: { ...LINE, totalPrice: true } } } },
  notes: NOTES,
  quote: { sel: { id: true, quoteNumber: true, message: true, notes: NOTES, lineItems: { first: 50, sel: { nodes: { sel: LINE } } } } },
  client: { sel: {
    id: true, name: true,
    tags: { first: 20, sel: { nodes: { sel: { label: true } } } },
    jobs: { first: 25, sel: { nodes: { sel: { id: true, jobNumber: true, title: true, createdAt: true } } } },
  } },
};

const key = (jobberJobId: string) => `ldmv:jobdetail:${jobberJobId}`;
const MAX_AGE = 6 * 3600_000;
const BIN_RE = /\b(?:bin|box)\s*(?:#|no\.?|number)?\s*(\d{1,4})\b/gi;

// Any photo or file field Jobber has on a line item, whatever it is called in this API version.
const PHOTO_FIELD = /image|photo|picture|attachment|file|media|thumbnail/i;
const ANY_FILE: Spec[string] = { first: 10, sel: { nodes: { sel: FILE }, ...FILE } };

async function lineSpec(owner: string, base: Spec): Promise<Spec> {
  const t = await fieldType(gql, owner, "lineItems");
  if (!t) return base;
  const extra = Object.fromEntries((await fieldsMatching(gql, t, PHOTO_FIELD)).map((f) => [f, ANY_FILE]));
  return { ...extra, ...base };
}

let selCache: string | null = null;
async function jobQuery() {
  if (!selCache) {
    const spec: Spec = { ...JOB_SPEC };
    spec.lineItems = { first: 50, sel: { nodes: { sel: await lineSpec("Job", { ...LINE, totalPrice: true }) } } };
    const quote = (JOB_SPEC.quote as { sel: Spec }).sel;
    spec.quote = { sel: { ...quote, lineItems: { first: 50, sel: { nodes: { sel: await lineSpec("Quote", LINE) } } } } };
    selCache = await buildSelection(gql, "Job", spec);
  }
  return `query LdmvJob($id: EncodedId!) { job(id: $id) ${selCache} }`;
}

export const toFile = (f: any, assumeImage = false): DetailFile | null => {
  const url = f?.url || f?.thumbnailUrl;
  if (!url) return null;
  const name = f.fileName || f.name || "file";
  const type = String(f.contentType || "");
  const image = /^image\//.test(type) || /\.(jpe?g|png|gif|webp|heic)$/i.test(name) || (assumeImage && !type && !/\.pdf$/i.test(name));
  return { name, url, image };
};
// Plain fields of a line or note; every other field holding a URL or files is an attachment.
const PLAIN = new Set(["__typename", "id", "name", "description", "quantity", "textOnly", "totalPrice", "unitPrice", "message", "createdAt"]);
/** Every file on a Jobber line item or note, whichever field Jobber put it in. Line items are photos unless they say otherwise. */
export const filesOf = (x: any, assumeImage = false): DetailFile[] => {
  const out: DetailFile[] = [];
  for (const [k, v] of Object.entries(x ?? {})) {
    if (PLAIN.has(k) || v == null) continue;
    if (typeof v === "string") { if (/^https?:\/\//.test(v)) out.push({ name: x.name || k, url: v, image: assumeImage || /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(v) }); continue; }
    if (typeof v === "object") for (const r of rows(v)) { const f = toFile(r, assumeImage); if (f) out.push(f); }
  }
  return out.filter((f, i) => out.findIndex((g) => g.url === f.url) === i);
};

function parse(j: any): Omit<JobDetail, "fetchedAt"> {
  const quote = j.quote || {};
  const quoteLines = rows(quote.lineItems);
  const lines: DetailLine[] = rows(j.lineItems).map((li: any) => {
    // Photos usually live on the quote's line item; match by name.
    const q = quoteLines.find((x: any) => x.name === li.name);
    const imgs = [...filesOf(li, true), ...(q ? filesOf(q, true) : [])].filter((f, i, a) => a.findIndex((g) => g.url === f.url) === i);
    return { name: li.name, description: li.description || undefined, quantity: li.quantity ?? undefined, images: imgs };
  });
  const allNotes: DetailNote[] = [
    ...rows(quote.notes).map((n: any) => ({ from: "quote" as const, message: n.message || "", at: n.createdAt, files: filesOf(n) })),
    ...rows(j.notes).map((n: any) => ({ from: "job" as const, message: n.message || "", at: n.createdAt, files: filesOf(n) })),
  ];
  // The signed quote PDF carries the line item mockups; it is read on the server, never shown as a note.
  const quotePdf = allNotes.flatMap((n) => n.files).find((f) => SIGNED_PDF.test(f.name))?.url;
  const notes = allNotes.map(crewNote).filter((n) => n.message.trim() || n.files.length);
  const text = [j.instructions, quote.message, ...notes.map((n) => n.message), ...lines.map((l) => `${l.name} ${l.description || ""}`)].join("\n");
  const bins = [...new Set([...text.matchAll(BIN_RE)].map((m) => m[1]))];
  const client = j.client || {};
  const otherJobs = rows(client.jobs).filter((x: any) => x.id !== j.id)
    .map((x: any) => ({ jobNumber: x.jobNumber, title: x.title, createdAt: x.createdAt }));
  // Repeat: the client had a job well before this one (an earlier season), or the notes name a bin.
  const created = j.createdAt ? Date.parse(j.createdAt) : Date.now();
  const earlier = otherJobs.filter((x) => x.createdAt && Date.parse(x.createdAt) < created - 120 * 86400_000);
  const repeat = earlier.length > 0 || bins.length > 0;
  const repeatWhy = earlier.length
    ? `Jobber has ${earlier.length} earlier job${earlier.length > 1 ? "s" : ""} for this client (first ${new Date(Math.min(...earlier.map((x) => Date.parse(x.createdAt!)))).getFullYear()})`
    : bins.length ? `Notes mention bin ${bins.join(", ")}` : undefined;
  return {
    // The quote's customer message (our service agreement) is for the customer, not the crew, so it is never sent.
    createdAt: j.createdAt, instructions: j.instructions && !isContract(j.instructions) ? j.instructions : undefined,
    quoteNumber: quote.quoteNumber ? String(quote.quoteNumber) : undefined,
    lines, notes, clientName: client.name, clientTags: rows(client.tags).map((t: any) => t.label).filter(Boolean),
    otherJobs, repeat, repeatWhy, bins, value: jobValue(j), quotePdf,
  };
}

/** Pre-tax dollar value of the job: its line items, else the subtotal, else the total. */
function jobValue(j: any): number | undefined {
  const sum = rows(j.lineItems).reduce((t: number, li: any) => t + (Number(li.totalPrice) || 0), 0);
  const v = sum || Number(j.amounts?.subtotal) || Number(j.total) || Number(j.amounts?.total) || 0;
  return v > 0 ? Math.round(v * 100) / 100 : undefined;
}

/** Our seasonal lighting agreement / terms pasted into a note: customer paperwork, not crew notes. */
const isContract = (t?: string) => !!t && /service agreement|terms and conditions|scope of services/i.test(t);
/** Machine-written notes: the GoHighLevel sync block, AI call summaries, "Signed copy of quote" (and its PDF). */
const isSystemNote = (t?: string) => !!t && /=+\s*GHL SYNC|DO NOT EDIT\s*=+|AI Call with|Call Summary:|Signed copy of quote/i.test(t);
const SIGNED_PDF = /signed[-_ ]copy|\bquote[-_ ]?#?\d+.*\.pdf$/i;
/** Only what a person wrote for the crew. */
const crewNote = (n: DetailNote): DetailNote =>
  isContract(n.message) || isSystemNote(n.message)
    ? { ...n, message: "", files: [] }
    : { ...n, files: n.files.filter((f) => !SIGNED_PDF.test(f.name)) };

export async function fetchJobDetail(jobberJobId: string): Promise<JobDetail> {
  let d: JobDetail;
  try {
    const r = await gql<{ job: any }>(await jobQuery(), { id: jobberJobId });
    d = { fetchedAt: Date.now(), imgv: IMGV, ...parse(r.job || {}) };
    // Copy line item photos and the signed quote's mockups into our photo storage (Jobber's links expire).
    const { importJobImages } = await import("./jobImages");
    d = await importJobImages(d, await kvGet<JobDetail>(key(jobberJobId))).catch(() => d);
  } catch (e: any) {
    selCache = null;
    const prev = await kvGet<JobDetail>(key(jobberJobId));
    d = prev ? { ...prev, fetchedAt: Date.now(), error: e.message } : { fetchedAt: Date.now(), error: e.message, lines: [], notes: [], clientTags: [], otherJobs: [], repeat: false, bins: [] };
  }
  await kvSet(key(jobberJobId), d);
  return d;
}

export async function getJobDetail(jobberJobId: string, opts: { refresh?: boolean } = {}): Promise<JobDetail | null> {
  const d = await kvGet<JobDetail>(key(jobberJobId));
  if (d) { delete (d as any).quoteMessage; if (isContract(d.instructions)) d.instructions = undefined; d.notes = d.notes.map(crewNote).filter((n) => n.message.trim() || n.files.length); } // saved before these notes were left out
  if (d && !opts.refresh && Date.now() - d.fetchedAt < MAX_AGE && d.imgv === IMGV) return d;
  return opts.refresh || !d ? fetchJobDetail(jobberJobId) : d;
}

/** Detail plus what Drive knows (bin list, takedown photos), for the job page. */
export function withDrive(idx: DriveIndex, d: JobDetail | null, clientName: string): JobDetailView | null {
  const base = d ?? { fetchedAt: 0, lines: [], notes: [], clientTags: [], otherJobs: [], repeat: false, bins: [] };
  const drive = driveFor(idx, clientName || base.clientName || "", base.bins);
  const repeat = base.repeat || drive.bins.length > 0 || drive.photos.length > 0 || drive.installPhotos.length > 0;
  const { value: _value, quotePdf: _pdf, ...shown } = base; // never send the job's price (or the signed quote) to the browser
  return { ...shown, drive, repeat, repeatWhy: base.repeatWhy || (repeat ? "On last season's bin list" : undefined) };
}

/** Refresh stale details for synced jobs, a few per call so a sync stays fast. */
export async function refreshStaleDetails(jobberJobIds: string[], limit = 12) {
  const ids = [...new Set(jobberJobIds)];
  const ages = await Promise.all(ids.map(async (id) => {
    const d = await kvGet<JobDetail>(key(id));
    return { id, at: d && d.imgv === IMGV ? d.fetchedAt : 0 };
  }));
  const due = ages.filter((a) => Date.now() - a.at > MAX_AGE).sort((a, b) => a.at - b.at).slice(0, limit);
  const { importDrivePhotos } = await import("./jobImages");
  const { loadDriveIndex } = await import("./drive");
  const started = Date.now();
  for (const a of due) {
    if (Date.now() - started > 35_000) break; // the rest on the next sync, inside the function time limit
    const d = await fetchJobDetail(a.id);
    // Last season's takedown and install photos for this customer, copied in ahead of the visit.
    if (d.clientName) await importDrivePhotos(driveFor(await loadDriveIndex(), d.clientName, d.bins)).catch(() => {});
  }
  return due.length;
}

/** The parts of the job to photograph (from the saved Jobber detail; empty when it hasn't been pulled yet). */
export async function cachedJobParts(jobberJobId?: string): Promise<string[]> {
  if (!jobberJobId) return [];
  const d = await kvGet<JobDetail>(key(jobberJobId));
  return d ? jobParts(d.lines) : [];
}
