import { gapi, googleStatus } from "./google";
import { loadDriveIndex, saveDriveIndex } from "./drive";
import { kvGet, kvSet } from "./store";
import { loadLibrary, parseMockupName, setDriveMockups } from "./mockups";

/* Builds the Drive index (bin lists, takedown photos, finished-install photos) straight from Light DMV's Google Drive
   with the app's Google connection, so nobody uploads drive_index.json any more. Files are found by name at runtime
   (customer names and Drive ids never go in the code):
     bin sheets      Google Sheets whose name has "Bins" ("2026 Bins", "Storage unit bins"): box # | name | status
     takedown photos folders whose name has "Takedown" ("2025 Holiday Takedown"): "418-Doe.heic" = bin 418, "LL-Name" = no bin
     install photos  folders named "<year> Holiday Lighting": "Copy of Jane Doe.heic" = that customer's finished install
     designs         Light Design Hero downloads anywhere in Drive ("J_Doe_Design1.png"), synced from each quoting computer */

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const STATUS = "ldmv:drive:auto";
const MAX_AGE = 6 * 3600_000;
const FOLDER = "application/vnd.google-apps.folder";
const SHEET = "application/vnd.google-apps.spreadsheet";
const ALL = "supportsAllDrives=true&includeItemsFromAllDrives=true";

export type DriveSyncStatus = { at?: number; error?: string; bins?: number; takedown?: number; install?: number; sheets?: string[]; folders?: number };

async function list(q: string, fields = "id,name,mimeType"): Promise<any[]> {
  const out: any[] = [];
  let token = "";
  for (let page = 0; page < 30; page++) {
    const j = await gapi(`${DRIVE}?q=${encodeURIComponent(q)}&pageSize=1000&fields=${encodeURIComponent(`nextPageToken,files(${fields})`)}&${ALL}${token ? `&pageToken=${token}` : ""}`);
    out.push(...(j.files ?? []));
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return out;
}

const year = (s: string) => Number(s.match(/20\d\d/)?.[0]) || 0;
const base = (title: string) => title.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/^copy of\s+/i, "").trim();

/** "418-Doe" → bin 418, label Doe; "LL-Roe" → no bin. */
export function parseTakedown(title: string) {
  const t = base(title);
  const m = t.match(/^(\d{1,4}[a-z]?)\s*[-_ ]\s*(.+)$/i);
  if (m) return { bin: m[1], label: m[2].trim() };
  return { bin: null, label: t.replace(/^LL\s*[-_ ]\s*/i, "").trim() };
}

async function readBins() {
  const sheets = (await list(`mimeType = '${SHEET}' and name contains 'Bins' and trashed = false`)).filter((f) => /\bbins\b/i.test(f.name));
  const bins: { bin: string; name: string; status: string; source: string }[] = [];
  for (const f of sheets) {
    const j = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}/values/A1:E3000`);
    const rows: string[][] = j.values ?? [];
    const head = (rows[0] ?? []).map((h) => String(h).toLowerCase());
    const col = (re: RegExp, d: number) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : d; };
    const cb = col(/box|bin/, 0), cn = col(/name|customer|client/, 1), cs = col(/status/, 2);
    for (const r of rows.slice(1)) {
      const bin = String(r[cb] ?? "").trim(), name = String(r[cn] ?? "").trim();
      if (bin && name) bins.push({ bin, name, status: String(r[cs] ?? "").trim(), source: f.name.trim() });
    }
  }
  return { bins, sheets: sheets.map((f) => f.name.trim()) };
}

async function readPhotos() {
  const folders = await list(`mimeType = '${FOLDER}' and trashed = false and (name contains 'Takedown' or name contains 'Holiday Lighting')`);
  const takedown: { fileId: string; title: string; bin: string | null; label: string; year: number }[] = [];
  const install: typeof takedown = [];
  for (const f of folders) {
    const isTakedown = /takedown|take down/i.test(f.name);
    if (!isTakedown && !/^\s*20\d\d holiday lighting\s*$/i.test(f.name)) continue;
    const y = year(f.name);
    const add = (p: any, folderLabel?: string) => {
      // A photo inside a customer's own subfolder ("418-Doe/IMG_1234.heic") takes the folder's name.
      const named = folderLabel && /^(img|photo|image|dsc|pxl)[-_ ]?\d|^photo-output|^\d+$/i.test(base(p.name)) ? folderLabel : base(p.name);
      if (isTakedown) takedown.push({ fileId: p.id, title: p.name, year: y, ...parseTakedown(named) });
      else install.push({ fileId: p.id, title: p.name, year: y, bin: null, label: named });
    };
    for (const p of await list(`'${f.id}' in parents and mimeType contains 'image/' and trashed = false`, "id,name")) add(p);
    for (const sub of await list(`'${f.id}' in parents and mimeType = '${FOLDER}' and trashed = false`))
      for (const p of await list(`'${sub.id}' in parents and mimeType contains 'image/' and trashed = false`, "id,name")) add(p, sub.name.trim());
  }
  return { takedown, install, folders: folders.length };
}

export const driveSyncStatus = async () => (await kvGet<DriveSyncStatus>(STATUS)) ?? {};

/** Rebuild the index from Drive when it is older than 6 hours (or now, with force). Quietly skips when Google isn't connected. */
export async function syncDriveIndex(force = false): Promise<DriveSyncStatus> {
  const prev = await driveSyncStatus();
  if (!force && prev.at && Date.now() - prev.at < MAX_AGE) return prev;
  if (!(await googleStatus()).connected) return prev;
  try {
    const [{ bins, sheets }, { takedown, install, folders }] = await Promise.all([readBins(), readPhotos()]);
    // Nothing found at all is a Drive hiccup, not an empty business: keep the last index.
    if (!bins.length && !takedown.length && !install.length) throw new Error("Found no bin sheets or photo folders in Drive.");
    const old = await loadDriveIndex();
    await saveDriveIndex({
      generatedAt: new Date().toISOString(),
      bins: bins.length ? bins : old.bins,
      takedownPhotos: takedown.length ? takedown : old.takedownPhotos,
      installPhotos: install.length ? install : old.installPhotos ?? [],
    }, true);
    const s: DriveSyncStatus = { at: Date.now(), bins: bins.length, takedown: takedown.length, install: install.length, sheets, folders };
    await kvSet(STATUS, s);
    return s;
  } catch (e: any) {
    const s = { ...prev, at: Date.now() - MAX_AGE + 30 * 60_000, error: e.message }; // try again in half an hour
    await kvSet(STATUS, s);
    return s;
  }
}

const MOCKUPS = "ldmv:drive:mockups";
export type MockupSyncStatus = { at?: number; error?: string; files?: number; customers?: number; copied?: number };
export const mockupSyncStatus = async () => (await kvGet<MockupSyncStatus>(MOCKUPS)) ?? {};

/** Light Design Hero designs anywhere in the company Drive (each quoting computer's Downloads folder, synced by Google
 *  Drive for desktop), into the design library every job reads. Every 20 minutes at most, or now with force. */
export async function syncDriveMockups(force = false): Promise<MockupSyncStatus> {
  const prev = await mockupSyncStatus();
  if (!force && prev.at && Date.now() - prev.at < 20 * 60_000) return prev;
  if (!(await googleStatus()).connected) return prev;
  try {
    // Drive's name search only matches the start of words, so list the pictures and keep the ones named like a design.
    const files = (await list(`mimeType contains 'image/' and trashed = false`, "id,name,modifiedTime"))
      .filter((f) => parseMockupName(f.name))
      .map((f) => ({ file: String(f.name), driveId: String(f.id), at: Date.parse(f.modifiedTime) || 0 }));
    await setDriveMockups(files);
    // Copy the newest ones into photo storage now so jobs open fast; the rest are copied the first time a job shows them.
    const { copyDrivePhoto, driveCopyKey } = await import("./jobImages");
    const lib = await loadLibrary();
    const inUse = Object.values(lib).flat().filter((m) => m.driveId).sort((a, b) => b.at - a.at);
    const started = Date.now();
    let copied = 0;
    for (const m of inUse) {
      if (Date.now() - started > 15_000) break;
      if (await kvGet<string>(driveCopyKey(m.driveId!))) continue;
      if (await copyDrivePhoto(m.driveId!).then(() => true, () => false)) copied++;
    }
    const s: MockupSyncStatus = { at: Date.now(), files: inUse.length, customers: Object.values(lib).filter((l) => l.some((m) => m.driveId)).length, copied };
    await kvSet(MOCKUPS, s);
    return s;
  } catch (e: any) {
    const s = { ...prev, at: Date.now() - 15 * 60_000, error: e.message }; // try again in 5 minutes
    await kvSet(MOCKUPS, s);
    return s;
  }
}
