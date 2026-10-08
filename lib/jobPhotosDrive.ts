import { createHash } from "crypto";
import { kvGet, kvSet, kvUpdate } from "./store";
import { gapi, googleAccessToken, googleStatus } from "./google";
import { SOPS } from "./sops";
import type { Checklist, Job } from "./jobs";

/* Every photo taken on a job checklist is copied to Light DMV's Google Drive (info@lightdmv.com), organized by customer:
     Light DMV Job Photos / <Customer - street> / <2026-27 season> / 2026-11-12 Install - Arrival (whole house) 1.jpg
   plus one Google Sheet in the top folder listing every photo (date, customer, job, photo, part, who, link).
   Folders and the sheet are made at runtime with the app's own Drive access (drive.file), so no customer name is in the code. */

const ROOT_NAME = "Light DMV Job Photos";
const SHEET_NAME = "Light DMV Job Photos - index";
const FOLDERS = "ldmv:jobphotos:folders";      // folder path -> Drive folder id
const SHEET = "ldmv:jobphotos:sheet";          // index sheet id
const copiedKey = (jobId: string) => `ldmv:jobphotos:copied:${jobId}`; // photo url -> Drive file id
const FAILS = "ldmv:jobphotos:last-error";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

const PHOTO_LABEL: Record<string, string> = {
  "arrival-photo": "Arrival (whole house)",
  "part-photos": "Being set",
  timer: "Timer",
  "finished-photos": "Finished job",
  "goodie-bag": "Goodie bag at the door",
  "yard-sign": "Yard sign",
  "takedown-photos": "Takedown",
  "after-photo": "Fixed and lit",
};
const KIND_LABEL = { install: "Install", takedown: "Takedown", fix: "Service" } as const;

const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const day = (t: number | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t));

/** Nov 2026 installs and Jan 2027 takedowns are the same season: "2026-27 season". */
export function seasonOf(iso: string) {
  const d = new Date(iso);
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")} season`;
}

/** "Jane Doe - 123 Main St" so two customers with the same name stay apart. */
export function customerFolderName(job: Job) {
  const street = (job.address || "").split(",")[0].trim();
  const who = (job.client || "").trim();
  return clean([who, street].filter(Boolean).join(" - ") || job.title || job.id);
}

async function findOrMakeFolder(name: string, parent?: string): Promise<string> {
  const path = `${parent || "root"}/${name}`;
  const cache = (await kvGet<Record<string, string>>(FOLDERS)) ?? {};
  if (cache[path]) return cache[path];
  const q = encodeURIComponent(`name = '${esc(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false${parent ? ` and '${parent}' in parents` : ""}`);
  const found = await gapi(`${DRIVE}?q=${q}&fields=files(id)&pageSize=1`);
  const id: string = found.files?.[0]?.id
    ?? (await gapi(`${DRIVE}?fields=id`, { method: "POST", body: { name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) } })).id;
  await kvUpdate<Record<string, string>>(FOLDERS, {}, (all) => { all[path] = id; });
  return id;
}

async function indexSheet(rootId: string): Promise<string> {
  const known = await kvGet<string>(SHEET);
  if (known) return known;
  const q = encodeURIComponent(`name = '${esc(SHEET_NAME)}' and '${rootId}' in parents and trashed = false`);
  let id: string | undefined = (await gapi(`${DRIVE}?q=${q}&fields=files(id)&pageSize=1`)).files?.[0]?.id;
  if (!id) {
    id = (await gapi(`${DRIVE}?fields=id`, { method: "POST", body: { name: SHEET_NAME, mimeType: "application/vnd.google-apps.spreadsheet", parents: [rootId] } })).id as string;
    await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:append?valueInputOption=RAW`, {
      method: "POST",
      body: { values: [["Date", "Customer", "Address", "Jobber #", "Job", "Crew", "Photo", "Part", "Taken by", "Photo link", "Customer folder"]] },
    });
  }
  await kvSet(SHEET, id);
  return id;
}

/** Upload one photo (fetched from the app's photo store) into a Drive folder. Skips it if a copy is already there. */
async function uploadPhoto(src: string, folderId: string, name: string, origin: string): Promise<{ id: string; link: string }> {
  const tag = createHash("sha1").update(src).digest("hex").slice(0, 24);
  const q = encodeURIComponent(`appProperties has { key='ldmvSrc' and value='${tag}' } and trashed = false`);
  const dup = (await gapi(`${DRIVE}?q=${q}&fields=files(id,webViewLink)&pageSize=1`)).files?.[0];
  if (dup) return { id: dup.id, link: dup.webViewLink };

  const res = await fetch(new URL(src, origin), { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't read the photo (${res.status})`);
  const type = res.headers.get("content-type") || "image/jpeg";
  const data = Buffer.from(await res.arrayBuffer());
  const boundary = "ldmv" + Date.now();
  const meta = JSON.stringify({ name, parents: [folderId], appProperties: { ldmvSrc: tag } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { authorization: `Bearer ${await googleAccessToken()}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`Drive upload failed (${up.status}): ${j.error?.message || ""}`);
  return { id: j.id, link: j.webViewLink };
}

export type DriveCopyResult = { copied: number; pending: number; skipped?: string; error?: string };

/** Copy this job's checklist photos that aren't in Drive yet. Safe to call again and again. */
export async function copyJobPhotos(job: Job, c: Checklist, origin: string, limit = 12): Promise<DriveCopyResult> {
  const status = await googleStatus();
  if (!status.connected) return { copied: 0, pending: 0, skipped: "Google isn't connected (Marketing tab, Connect Google)." };
  const done = (await kvGet<Record<string, string>>(copiedKey(job.id))) ?? {};
  const todo: { itemId: string; url: string; n: number; part?: string; by?: string }[] = [];
  for (const item of SOPS[job.kind].items) {
    const e = c.items[item.id];
    e?.photos.forEach((url, i) => { if (!done[url]) todo.push({ itemId: item.id, url, n: i + 1, part: e.parts?.[url], by: e.photoBy?.[url] || e.byName }); });
  }
  if (!todo.length) return { copied: 0, pending: 0 };

  let copied = 0;
  try {
    const root = await findOrMakeFolder(ROOT_NAME);
    const customer = await findOrMakeFolder(customerFolderName(job), root);
    const season = await findOrMakeFolder(seasonOf(job.start), customer);
    const sheet = await indexSheet(root);
    const rows: string[][] = [];
    for (const t of todo.slice(0, limit)) {
      const label = PHOTO_LABEL[t.itemId] || SOPS[job.kind].items.find((i) => i.id === t.itemId)?.text || t.itemId;
      const name = clean(`${day(job.start)} ${KIND_LABEL[job.kind]} - ${label}${t.part ? ` - ${t.part}` : ""} ${t.n}`) + ".jpg";
      const f = await uploadPhoto(t.url, season, name, origin);
      await kvUpdate<Record<string, string>>(copiedKey(job.id), {}, (all) => { all[t.url] = f.id; });
      rows.push([day(job.start), job.client, job.address, job.jobNumber ? String(job.jobNumber) : "", KIND_LABEL[job.kind], (job.crew || "").replace(/^crew(\d)$/, "Crew $1") || job.assignedNames.join(", "),
        label, t.part || "", t.by || "", f.link || `https://drive.google.com/file/d/${f.id}/view`, `https://drive.google.com/drive/folders/${customer}`]);
      copied++;
    }
    if (rows.length)
      await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values: rows } });
    if (todo.length === copied) await kvSet(FAILS, null);
    return { copied, pending: todo.length - copied };
  } catch (e: any) {
    await kvSet(FAILS, { at: Date.now(), jobId: job.id, message: String(e.message || e).slice(0, 300) });
    // A folder deleted by hand in Drive: forget the cached ids so the next try rebuilds them.
    if (/\b404\b/.test(String(e.message))) { await kvSet(FOLDERS, {}); await kvSet(SHEET, null); }
    return { copied, pending: todo.length - copied, error: String(e.message || e) };
  }
}

/** For the Jobs page: where the photos go, and how many are still waiting to be copied. */
export async function driveCopyStatus(jobs: Job[], checklists: Checklist[]) {
  const g = await googleStatus();
  const folders = (await kvGet<Record<string, string>>(FOLDERS)) ?? {};
  const rootId = folders[`root/${ROOT_NAME}`];
  const sheetId = await kvGet<string>(SHEET);
  let pending = 0, copied = 0;
  for (const c of checklists) {
    const job = jobs.find((j) => j.id === c.jobId);
    if (!job) continue;
    const done = (await kvGet<Record<string, string>>(copiedKey(job.id))) ?? {};
    for (const item of SOPS[job.kind].items) for (const u of c.items[item.id]?.photos ?? []) done[u] ? copied++ : pending++;
  }
  return {
    connected: g.connected, email: g.email, inDrive: copied, pending,
    folder: rootId ? `https://drive.google.com/drive/folders/${rootId}` : null,
    sheet: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null,
    lastError: await kvGet<{ at: number; jobId: string; message: string }>(FAILS),
  };
}
