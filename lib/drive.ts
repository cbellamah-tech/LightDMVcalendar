// Snapshot of Light DMV's Google Drive bin lists and takedown photo folders. Customer names live here,
// so it's uploaded by an owner and kept in the database, never in the (public) code repo.
import { kvGet, kvSet } from "./store";

type BinRow = { bin: string; name: string; status: string; source: string };
type PhotoRow = { fileId: string; title: string; bin: string | null; label: string; year: number; mimeType?: string };
export type DriveIndex = { generatedAt: string | null; bins: BinRow[]; takedownPhotos: PhotoRow[] };
const KEY = "ldmv:drive:index";
const EMPTY: DriveIndex = { generatedAt: null, bins: [], takedownPhotos: [] };
let mem: { at: number; idx: DriveIndex } | null = null;

export async function loadDriveIndex(): Promise<DriveIndex> {
  if (mem && Date.now() - mem.at < 60_000) return mem.idx;
  const idx = (await kvGet<DriveIndex>(KEY)) ?? EMPTY;
  mem = { at: Date.now(), idx };
  return idx;
}

export async function saveDriveIndex(raw: unknown): Promise<DriveIndex> {
  const x = raw as Partial<DriveIndex>;
  if (!x || !Array.isArray(x.bins) || !Array.isArray(x.takedownPhotos)) throw new Error("That isn't a Drive index file.");
  const idx: DriveIndex = {
    generatedAt: typeof x.generatedAt === "string" ? x.generatedAt : new Date().toISOString(),
    bins: x.bins.filter((b) => b && typeof b.bin === "string" && typeof b.name === "string").map((b) => ({ bin: b.bin, name: b.name, status: String(b.status || ""), source: String(b.source || "") })),
    takedownPhotos: x.takedownPhotos.filter((p) => p && typeof p.fileId === "string").map((p) => ({
      fileId: p.fileId, title: String(p.title || ""), bin: p.bin ? String(p.bin) : null, label: String(p.label || ""), year: Number(p.year) || 0,
    })),
  };
  await kvSet(KEY, idx);
  mem = { at: Date.now(), idx };
  return idx;
}

export type DrivePhoto = { fileId: string; title: string; year: number; bin: string | null; thumb: string; link: string; sure: boolean };
export type DriveMatch = { bins: { bin: string; status: string; source: string }[]; photos: DrivePhoto[]; indexedAt: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const lastName = (s: string) => norm(s).split(" ").filter((w) => w.length > 1).pop() || "";
// Drop a middle initial so "Lauren H Grawert" matches "Lauren Grawert".
const loose = (s: string) => norm(s).split(" ").filter((w) => w.length > 1).join(" ");

export function driveFor(idx: DriveIndex, clientName: string, notesBins: string[] = []): DriveMatch {
  const name = loose(clientName);
  const binRows = name ? idx.bins.filter((b) => loose(b.name) === name) : [];
  const bins = new Map<string, { bin: string; status: string; source: string }>();
  for (const b of [...binRows].sort((a, z) => (a.source === "2026 Bins" ? -1 : 1) - (z.source === "2026 Bins" ? -1 : 1))) {
    // "58/59" or "168 or 163" means more than one bin; "LL" and "No box" have no bin number.
    const nums = b.bin.match(/\d+[a-z]?/gi) ?? [];
    for (const n of nums) if (!bins.has(n)) bins.set(n, { bin: n, status: b.status, source: b.source });
  }
  for (const n of notesBins) if (!bins.has(n)) bins.set(n, { bin: n, status: "", source: "Jobber notes" });

  const last = lastName(clientName);
  const photos: DrivePhoto[] = [];
  for (const p of idx.takedownPhotos) {
    // Untitled phone exports ("photo-output", "IMG_1279") carry no name.
    const named = !/^(photo-output|img[_-]?\d)/i.test(p.title);
    const byBin = !!p.bin && (bins.has(p.bin) || bins.has(p.bin.replace(/[a-z]$/i, "")));
    const byName = named && !!last && lastName(p.label) === last;
    // A bin match is certain; a last-name match alone is shown as "possible" (common names collide).
    if (byBin || (byName && (!p.bin || bins.size === 0))) {
      photos.push({
        fileId: p.fileId, title: p.title, year: p.year, bin: p.bin, sure: byBin,
        thumb: `https://drive.google.com/thumbnail?id=${p.fileId}&sz=w1200`,
        link: `https://drive.google.com/file/d/${p.fileId}/view`,
      });
    }
  }
  photos.sort((a, b) => Number(b.sure) - Number(a.sure) || b.year - a.year);
  return { bins: [...bins.values()], photos, indexedAt: idx.generatedAt };
}
