import { kvGet, kvSet } from "./store";
import { gql } from "./jobber";
import { buildSelection, rows, Spec } from "./jobberSchema";
import { driveFor, DriveIndex, DriveMatch } from "./drive";

/* What a crew needs on site, pulled from the Jobber job, its quote and the client. Never prices. */

export type DetailFile = { name: string; url: string; image: boolean };
export type DetailNote = { from: "job" | "quote"; message: string; at?: string; files: DetailFile[] };
export type DetailLine = { name: string; description?: string; quantity?: number; images: DetailFile[] };
export type JobDetail = {
  fetchedAt: number;
  error?: string;
  createdAt?: string;
  instructions?: string;
  quoteNumber?: string;
  quoteMessage?: string;
  lines: DetailLine[];
  notes: DetailNote[];
  clientName?: string;
  clientTags: string[];
  otherJobs: { jobNumber?: number; title?: string; createdAt?: string }[];
  repeat: boolean;
  repeatWhy?: string;
  bins: string[];           // bin numbers written in Jobber notes
};
export type JobDetailView = JobDetail & { drive: DriveMatch };

const FILE: Spec = { fileName: true, name: true, url: true, contentType: true, thumbnailUrl: true };
const FILES: Spec[string] = { first: 10, sel: { nodes: { sel: FILE } } };
const LINE: Spec = {
  name: true, description: true, quantity: true, textOnly: true,
  image: { sel: FILE }, images: FILES, fileAttachments: FILES, photos: FILES, imageUrl: true,
};
const NOTES: Spec[string] = { first: 30, sel: { nodes: { sel: { message: true, createdAt: true, fileAttachments: FILES, attachments: FILES } } } };
const JOB_SPEC: Spec = {
  id: true, jobNumber: true, createdAt: true, instructions: true,
  lineItems: { first: 50, sel: { nodes: { sel: LINE } } },
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

let selCache: string | null = null;
async function jobQuery() {
  if (!selCache) selCache = await buildSelection(gql, "Job", JOB_SPEC);
  return `query LdmvJob($id: EncodedId!) { job(id: $id) ${selCache} }`;
}

const toFile = (f: any): DetailFile | null => {
  const url = f?.url || f?.thumbnailUrl;
  if (!url) return null;
  const name = f.fileName || f.name || "file";
  return { name, url, image: /^image\//.test(f.contentType || "") || /\.(jpe?g|png|gif|webp|heic)$/i.test(name) };
};
const filesOf = (x: any): DetailFile[] =>
  [...rows(x?.image), ...rows(x?.images), ...rows(x?.fileAttachments), ...rows(x?.photos), ...rows(x?.attachments)]
    .map(toFile).filter(Boolean) as DetailFile[];

function parse(j: any): Omit<JobDetail, "fetchedAt"> {
  const quote = j.quote || {};
  const quoteLines = rows(quote.lineItems);
  const lines: DetailLine[] = rows(j.lineItems).map((li: any) => {
    // Photos usually live on the quote's line item; match by name.
    const q = quoteLines.find((x: any) => x.name === li.name);
    const imgs = [...filesOf(li), ...(q ? filesOf(q) : [])];
    if (li.imageUrl) imgs.push({ name: li.name, url: li.imageUrl, image: true });
    return { name: li.name, description: li.description || undefined, quantity: li.quantity ?? undefined, images: imgs };
  });
  const notes: DetailNote[] = [
    ...rows(quote.notes).map((n: any) => ({ from: "quote" as const, message: n.message || "", at: n.createdAt, files: filesOf(n) })),
    ...rows(j.notes).map((n: any) => ({ from: "job" as const, message: n.message || "", at: n.createdAt, files: filesOf(n) })),
  ].filter((n) => n.message.trim() || n.files.length);
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
    createdAt: j.createdAt, instructions: j.instructions || undefined,
    quoteNumber: quote.quoteNumber ? String(quote.quoteNumber) : undefined, quoteMessage: quote.message || undefined,
    lines, notes, clientName: client.name, clientTags: rows(client.tags).map((t: any) => t.label).filter(Boolean),
    otherJobs, repeat, repeatWhy, bins,
  };
}

export async function fetchJobDetail(jobberJobId: string): Promise<JobDetail> {
  let d: JobDetail;
  try {
    const r = await gql<{ job: any }>(await jobQuery(), { id: jobberJobId });
    d = { fetchedAt: Date.now(), ...parse(r.job || {}) };
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
  if (d && !opts.refresh && Date.now() - d.fetchedAt < MAX_AGE) return d;
  return opts.refresh || !d ? fetchJobDetail(jobberJobId) : d;
}

/** Detail plus what Drive knows (bin list, takedown photos), for the job page. */
export function withDrive(idx: DriveIndex, d: JobDetail | null, clientName: string): JobDetailView | null {
  const base = d ?? { fetchedAt: 0, lines: [], notes: [], clientTags: [], otherJobs: [], repeat: false, bins: [] };
  const drive = driveFor(idx, clientName || base.clientName || "", base.bins);
  const repeat = base.repeat || drive.bins.length > 0 || drive.photos.length > 0;
  return { ...base, drive, repeat, repeatWhy: base.repeatWhy || (repeat ? "On last season's bin list" : undefined) };
}

/** Refresh stale details for synced jobs, a few per call so a sync stays fast. */
export async function refreshStaleDetails(jobberJobIds: string[], limit = 12) {
  const ids = [...new Set(jobberJobIds)];
  const ages = await Promise.all(ids.map(async (id) => ({ id, at: (await kvGet<JobDetail>(key(id)))?.fetchedAt ?? 0 })));
  const due = ages.filter((a) => Date.now() - a.at > MAX_AGE).sort((a, b) => a.at - b.at).slice(0, limit);
  for (const a of due) await fetchJobDetail(a.id);
  return due.length;
}
