import { createHash } from "crypto";
import { kvGet, kvSet } from "./store";
import { savePhoto } from "./photos";
import { drivePhotoJpeg, googleStatus } from "./google";
import type { DriveMatch } from "./drive";
import { rows } from "./jobberSchema";
import type { DetailFile, JobDetail } from "./jobDetails";

/* Copies a job's pictures into our own photo storage so crews see them without Jobber or Google sign-ins:
   - photos on Jobber line items, if Jobber's API ever hands them out (no public version has so far, and its quote
     PDF leaves them out too, so the designs come from Google Drive instead: lib/driveSync.ts),
   - last season's takedown and install photos from Drive (HEIC from the phones comes back as JPEG). */

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);
// Jobber's signed links change their query string each time; the path names the file.
const stable = (url: string) => url.split("?")[0];
const copyKey = (url: string) => `ldmv:imgcopy:${sha(stable(url))}`;
export const driveCopyKey = (fileId: string) => `ldmv:driveimg:${fileId}`;
const isOurs = (url: string) => url.startsWith("/") || /supabase\.co\/storage|blob\.vercel-storage\.com/.test(url);

async function copyUrl(url: string, name: string, folder: string): Promise<string | null> {
  if (isOurs(url)) return url;
  const k = copyKey(url);
  const have = await kvGet<string>(k);
  if (have) return have;
  const { jobberFile } = await import("./jobber");
  const res = await jobberFile(url).catch(() => null);
  if (!res) return null;
  const type = res.headers.get("content-type") || "image/jpeg";
  if (!/^image\//.test(type)) return null;
  const saved = await savePhoto(new File([await res.arrayBuffer()], name || "photo.jpg", { type }), folder);
  await kvSet(k, saved);
  return saved;
}

/** The newest Jobber API version we look at for line item photos (the app itself stays on its tested version). */
export const NEWEST_JOBBER_API = "2026-09-25";
const PHOTO_FIELD = /image|photo|picture|attachment|file|media|thumbnail/i;
export type LinePhotoCheck = { at: number; version: string; fields: string[]; error?: string };
const CHECK = "ldmv:jobber:linephotocheck";

/** Once a day: does Jobber's newest API version have a photo field on quote line items yet? */
export async function linePhotoCheck(): Promise<LinePhotoCheck> {
  const have = await kvGet<LinePhotoCheck>(CHECK);
  if (have && have.version === NEWEST_JOBBER_API && Date.now() - have.at < 86400_000) return have;
  const { gqlAt } = await import("./jobber");
  let r: LinePhotoCheck;
  try {
    const d = await gqlAt<any>(`{ q: __type(name: "QuoteLineItem") { fields { name } } }`, {}, NEWEST_JOBBER_API);
    r = { at: Date.now(), version: NEWEST_JOBBER_API, fields: (d.q?.fields ?? []).map((f: any) => String(f.name)).filter((n: string) => PHOTO_FIELD.test(n)) };
  } catch (e: any) {
    r = { at: Date.now(), version: NEWEST_JOBBER_API, fields: [], error: e.message };
  }
  await kvSet(CHECK, r);
  return r;
}

/** The quote's line item photos through the newest API version, by line name (only once Jobber has the field). */
async function newestLinePhotos(quoteId: string, fields: string[]): Promise<Map<string, DetailFile[]>> {
  const { gqlAt } = await import("./jobber");
  const { filesOf } = await import("./jobDetails");
  const q = (sel: string) => `query LdmvLinePhotos($id: EncodedId!) { quote(id: $id) { lineItems(first: 50) { nodes { name ${sel} } } } }`;
  // A file object first; a plain URL field if Jobber made it a string.
  const r = await gqlAt<any>(q(fields.map((f) => `${f} { url thumbnailUrl fileName contentType }`).join(" ")), { id: quoteId }, NEWEST_JOBBER_API)
    .catch(() => gqlAt<any>(q(fields.join(" ")), { id: quoteId }, NEWEST_JOBBER_API));
  const out = new Map<string, DetailFile[]>();
  for (const li of rows(r.quote?.lineItems)) {
    const files = filesOf(li, true);
    if (files.length) out.set(String(li.name), files);
  }
  return out;
}

/** Copy the job's Jobber pictures into photo storage and point the detail at the copies. */
export async function importJobImages(d: JobDetail): Promise<JobDetail> {
  const folder = `jobber/${sha(d.quoteNumber || d.clientName || "job").slice(0, 12)}`;
  const started = Date.now();
  const copy = async (f: DetailFile): Promise<DetailFile> => {
    if (!f.image || Date.now() - started > 25_000) return f;
    const u = await copyUrl(f.url, f.name, folder).catch(() => null);
    return u ? { ...f, url: u } : f;
  };
  let lines = d.lines;
  // Line item photos from Jobber itself, the day its API offers them.
  if (d.quoteId && !lines.some((l) => l.images.some((f) => f.image))) {
    const check = await linePhotoCheck().catch(() => null);
    if (check?.fields.length) {
      const got = await newestLinePhotos(d.quoteId, check.fields).catch(() => new Map<string, DetailFile[]>());
      lines = lines.map((l) => (got.get(l.name)?.length && !l.images.length ? { ...l, images: got.get(l.name)! } : l));
    }
  }
  const outLines = [];
  for (const l of lines) outLines.push({ ...l, images: await Promise.all(l.images.map(copy)) });
  const notes = [];
  for (const n of d.notes) notes.push({ ...n, files: await Promise.all(n.files.map(copy)) });
  const fromJobber = outLines.reduce((t, l) => t + l.images.filter((f) => f.image).length, 0);
  return { ...d, lines: outLines, notes, photoInfo: fromJobber ? `${fromJobber} line photo${fromJobber === 1 ? "" : "s"} from Jobber` : "" };
}

/** Copy the Drive photos matched to a job into photo storage (a few per call). Returns how many were new. */
export async function importDrivePhotos(m: DriveMatch, limit = 6): Promise<number> {
  if (!(await googleStatus()).connected) return 0;
  let n = 0;
  for (const p of [...m.photos, ...m.installPhotos].slice(0, limit)) {
    if (await kvGet<string>(driveCopyKey(p.fileId))) continue;
    await copyDrivePhoto(p.fileId, p.year).catch(() => null);
    n++;
  }
  return n;
}

/** Our stored copy of a Drive photo, made the first time it's needed. */
export async function copyDrivePhoto(fileId: string, year?: number): Promise<string> {
  const k = driveCopyKey(fileId);
  const have = await kvGet<string>(k);
  if (have) return have;
  const res = await drivePhotoJpeg(fileId, 1600);
  const url = await savePhoto(new File([await res.arrayBuffer()], `${fileId}.jpg`, { type: "image/jpeg" }), `drive/${year || "photos"}`);
  await kvSet(k, url);
  return url;
}
