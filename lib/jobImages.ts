import { createHash } from "crypto";
import { kvGet, kvSet } from "./store";
import { savePhoto } from "./photos";
import { drivePhotoJpeg, googleStatus } from "./google";
import type { DriveMatch } from "./drive";
import { pdfPictures } from "./pdfPictures";
import type { DetailFile, JobDetail } from "./jobDetails";

/* Copies a job's pictures into our own photo storage so crews see them without Jobber or Google sign-ins:
   - photos on Jobber line items (Jobber's file links expire after a while),
   - the mockups inside the signed quote PDF Jobber keeps on the quote (one per "Click Photo to Preview" line),
   - last season's takedown and install photos from Drive (HEIC from the phones comes back as JPEG). */

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);
// Jobber's signed links change their query string each time; the path names the file.
const stable = (url: string) => url.split("?")[0];
const copyKey = (url: string) => `ldmv:imgcopy:${sha(stable(url))}`;
const pdfKey = (url: string) => `ldmv:quotepdf2:${sha(stable(url))}`;
export const driveCopyKey = (fileId: string) => `ldmv:driveimg:${fileId}`;
const isOurs = (url: string) => url.startsWith("/") || /supabase\.co\/storage|blob\.vercel-storage\.com/.test(url);

async function copyUrl(url: string, name: string, folder: string): Promise<string | null> {
  if (isOurs(url)) return url;
  const k = copyKey(url);
  const have = await kvGet<string>(k);
  if (have) return have;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") || "image/jpeg";
  if (!/^image\//.test(type)) return null;
  const saved = await savePhoto(new File([await res.arrayBuffer()], name || "photo.jpg", { type }), folder);
  await kvSet(k, saved);
  return saved;
}

type PdfRead = { urls: string[]; status: string };
/** Mockups from the signed quote PDF, copied once per PDF. */
async function quotePdfMockups(pdfUrl: string, folder: string): Promise<PdfRead | null> {
  const k = pdfKey(pdfUrl);
  const have = await kvGet<PdfRead | string[]>(k);
  if (have && !Array.isArray(have)) return have;
  const res = await fetch(pdfUrl, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const pics = pdfPictures(buf).slice(0, 20);
  const urls: string[] = [];
  for (const [n, p] of pics.entries())
    urls.push(await savePhoto(new File([new Uint8Array(p.data)], `mockup-${n + 1}.${p.type === "image/png" ? "png" : "jpg"}`, { type: p.type }), folder));
  const r = { urls, status: `signed quote PDF read (${Math.round(buf.length / 1024)} KB, ${pics.length} picture${pics.length === 1 ? "" : "s"} in it)` };
  await kvSet(k, r);
  return r;
}

/** Lines the customer is shown a picture for ("Click Photo to Preview", "Reference Photo included", "shown in the design photo"). */
const wantsPhoto = (l: { name: string; description?: string }) => /photo|preview|picture|mockup/i.test(`${l.name} ${l.description || ""}`);

/** Copy the job's Jobber pictures into photo storage and point the detail at the copies. */
export async function importJobImages(d: JobDetail, prev: JobDetail | null): Promise<JobDetail> {
  const folder = `jobber/${sha(d.quoteNumber || d.clientName || "job").slice(0, 12)}`;
  const started = Date.now();
  const copy = async (f: DetailFile): Promise<DetailFile> => {
    if (!f.image || Date.now() - started > 25_000) return f;
    const u = await copyUrl(f.url, f.name, folder).catch(() => null);
    return u ? { ...f, url: u } : f;
  };
  const lines = [];
  for (const l of d.lines) lines.push({ ...l, images: await Promise.all(l.images.map(copy)) });
  const notes = [];
  for (const n of d.notes) notes.push({ ...n, files: await Promise.all(n.files.map(copy)) });
  let out: JobDetail = { ...d, lines, notes };

  const fromJobber = lines.reduce((t, l) => t + l.images.filter((f) => f.image).length, 0);
  out.photoInfo = fromJobber ? `${fromJobber} line photo${fromJobber === 1 ? "" : "s"} from Jobber` : d.quotePdf ? "" : "no line photos from Jobber and no signed quote PDF on this quote yet";
  // The signed quote's mockups, when Jobber's API gave no photo on the lines themselves.
  if (d.quotePdf && !fromJobber) {
    const fresh = await quotePdfMockups(d.quotePdf, folder).catch((e) => ({ urls: [], status: `couldn't read the signed quote PDF (${e.message})` }));
    if (!fresh && prev) {
      // Couldn't read the PDF this time: keep what the last pull found.
      out.lines = out.lines.map((l) => ({ ...l, images: l.images.length ? l.images : prev.lines.find((p) => p.name === l.name)?.images ?? [] }));
      return { ...out, quoteMockups: prev.quoteMockups, photoInfo: prev.photoInfo };
    }
    out.photoInfo = fresh?.status ?? "couldn't download the signed quote PDF from Jobber";
    const mockups = fresh?.urls ?? [];
    const photoLines = lines.map((l, i) => (wantsPhoto(l) ? i : -1)).filter((i) => i >= 0);
    if (mockups.length && mockups.length === photoLines.length) {
      // One picture per "Click Photo to Preview" line, in the quote's order.
      photoLines.forEach((li, k) => { out.lines[li] = { ...out.lines[li], images: [{ name: "Mockup", url: mockups[k], image: true }] }; });
      out = { ...out, quoteMockups: [] };
    } else {
      out = { ...out, quoteMockups: mockups };
    }
  }
  return out;
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
