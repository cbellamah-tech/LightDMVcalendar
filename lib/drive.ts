// Snapshot of Light DMV's Google Drive bin lists and takedown photo folders, bundled with the app.
// Regenerate data/drive/drive_index.json when the sheets or folders change.
import index from "../data/drive/drive_index.json";

type BinRow = { bin: string; name: string; status: string; source: string };
type PhotoRow = { fileId: string; title: string; bin: string | null; label: string; year: number; mimeType?: string };
const idx = index as unknown as { generatedAt: string | null; bins: BinRow[]; takedownPhotos: PhotoRow[] };

export type DrivePhoto = { fileId: string; title: string; year: number; bin: string | null; thumb: string; link: string; sure: boolean };
export type DriveMatch = { bins: { bin: string; status: string; source: string }[]; photos: DrivePhoto[]; indexedAt: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const lastName = (s: string) => norm(s).split(" ").filter((w) => w.length > 1).pop() || "";
// Drop a middle initial so "Lauren H Grawert" matches "Lauren Grawert".
const loose = (s: string) => norm(s).split(" ").filter((w) => w.length > 1).join(" ");

export function driveFor(clientName: string, notesBins: string[] = []): DriveMatch {
  const name = loose(clientName);
  const binRows = name ? idx.bins.filter((b) => loose(b.name) === name) : [];
  const bins = new Map<string, { bin: string; status: string; source: string }>();
  for (const b of [...binRows].sort((a, z) => (a.source === "2026 Bins" ? -1 : 1) - (z.source === "2026 Bins" ? -1 : 1))) {
    if (!bins.has(b.bin)) bins.set(b.bin, { bin: b.bin, status: b.status, source: b.source });
  }
  for (const n of notesBins) if (!bins.has(n)) bins.set(n, { bin: n, status: "", source: "Jobber notes" });

  const last = lastName(clientName);
  const photos: DrivePhoto[] = [];
  for (const p of idx.takedownPhotos) {
    const byBin = !!p.bin && bins.has(p.bin);
    const byName = !!last && lastName(p.label) === last;
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
