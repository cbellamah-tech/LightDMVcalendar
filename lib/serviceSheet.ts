import { kvGet, kvSet, kvUpdate } from "./store";
import { gapi, googleStatus } from "./google";
import type { Job } from "./jobs";

/* Every fix (service call) the Jobber sync sees goes to the "Service Requested Sheet" in Light DMV's Drive once.
   Columns, as the sheet already has them: Date | Client | Requested | Work Done | Job ID | Year.
   Job ID is the Jobber visit id, which is how a fix is matched to its row. Work Done is filled in from the
   crew's note when they finish the fix in the app.
   The sheet is found by its name through the Google connection (info@lightdmv.com); SERVICE_SHEET_ID overrides. */

const SHEET_NAME = "Service Requested Sheet";
const STATUS = "ldmv:fixes:sheet";
const LOGGED = "ldmv:fixes:logged"; // visit id -> when it was added (so a row someone deleted on purpose isn't re-added)

export type FixSheetStatus = { sheetId?: string; lastAt?: number; lastAdded?: number; lastError?: string };

export const fixSheetStatus = async () => (await kvGet<FixSheetStatus>(STATUS)) ?? {};
export const fixSheetUrl = (id?: string) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : undefined);

async function sheetId(): Promise<string> {
  const env = process.env.SERVICE_SHEET_ID?.trim();
  if (env) return env;
  const s = await fixSheetStatus();
  if (s.sheetId) return s.sheetId;
  const q = encodeURIComponent(`name = '${SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
  const j = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=5&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`);
  const id = j.files?.[0]?.id;
  if (!id) throw new Error(`Couldn't find "${SHEET_NAME}" in Google Drive.`);
  await kvSet<FixSheetStatus>(STATUS, { ...s, sheetId: id });
  return id;
}

async function firstTab(id: string) {
  const meta = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`);
  return (meta.sheets?.[0]?.properties?.title as string) ?? "Sheet1";
}

const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Append fixes the sheet doesn't have yet. Returns how many rows were added. */
export async function logFixesToSheet(fixes: Job[]): Promise<number> {
  if (!fixes.length || !(await googleStatus()).connected) return 0;
  const prev = await fixSheetStatus();
  try {
    const id = await sheetId();
    const tab = await firstTab(id);
    const v = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A1:F5000`)}`);
    const rows: string[][] = v.values ?? [];
    const ids = new Set(rows.map((r) => (r[4] ?? "").trim()).filter(Boolean));
    const pairs = new Set(rows.map((r) => `${norm(r[1] ?? "")}|${norm(r[2] ?? "")}`));
    const logged = (await kvGet<Record<string, number>>(LOGGED)) ?? {};
    const add: Job[] = [];
    for (const f of fixes) {
      const vid = f.jobberVisitId;
      if (!vid || ids.has(vid) || logged[vid]) continue;
      // A row typed in by hand (no Job ID) for the same customer and request counts as logged.
      if (pairs.has(`${norm(f.client)}|${norm(f.request || "")}`)) continue;
      add.push(f);
      ids.add(vid);
    }
    if (add.length) {
      const values = add.map((f) => {
        const day = etDay(f.requestedAt || f.start);
        return [day, f.client, f.request || f.title, "", f.jobberVisitId!, day.slice(0, 4)];
      });
      await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A:F`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST", body: { values },
      });
    }
    // Remember everything the sheet has now, so a row deleted on purpose stays deleted.
    await kvUpdate<Record<string, number>>(LOGGED, {}, (all) => { for (const f of fixes) if (f.jobberVisitId && ids.has(f.jobberVisitId)) all[f.jobberVisitId] ??= Date.now(); });
    await kvSet<FixSheetStatus>(STATUS, { ...prev, ...(await fixSheetStatus()), lastAt: Date.now(), lastAdded: add.length, lastError: undefined });
    return add.length;
  } catch (e: any) {
    await kvSet<FixSheetStatus>(STATUS, { ...(await fixSheetStatus()), lastAt: Date.now(), lastError: e.message });
    throw e;
  }
}

/** When the crew finishes a fix in the app, put what they wrote in the Work Done column of its row. */
export async function writeWorkDone(fix: Job, workDone: string) {
  if (!fix.jobberVisitId || !workDone.trim() || !(await googleStatus()).connected) return;
  await logFixesToSheet([fix]).catch(() => 0); // make sure the row exists
  const id = await sheetId();
  const tab = await firstTab(id);
  const v = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!E1:E5000`)}`);
  const r = ((v.values ?? []) as string[][]).findIndex((x) => (x[0] ?? "").trim() === fix.jobberVisitId);
  if (r < 0) return;
  await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!D${r + 1}`)}?valueInputOption=RAW`, {
    method: "PUT", body: { values: [[workDone.trim().slice(0, 500)]] },
  });
}
