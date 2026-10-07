import { kvDel, kvGet, kvSet } from "./store";
import { stableOrigin } from "./jobber";

/* Google for the Marketing tab: read the info@ inbox, read job photos in Drive for the daily video,
   and keep the campaign sheet in sync.
   Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (an OAuth client of type "Web application").
   Redirect URL to register in Google Cloud: <your site>/api/google/callback
   Optional: MARKETING_SHEET_ID to point at a different sheet than the 2026 one. */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "openid", "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly", // job photos for the daily video
  "https://www.googleapis.com/auth/drive.file",     // the one small file the app writes (the video runner's key)
];
const TOKENS = "ldmv:google:tokens";

// "2026 Marketing Campaign" in Light DMV's Drive (Marketing folder).
export const SHEET_ID = process.env.MARKETING_SHEET_ID?.trim() || "1lTuCIn1YH_WE1IIp4V9diGEVuVREoTaNyL_dOZLYoj0";
export const sheetUrl = () => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

type Tokens = { access_token: string; refresh_token: string; expires_at: number; email?: string; connectedAt: number };

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID?.trim() && !!process.env.GOOGLE_CLIENT_SECRET?.trim();
export const googleRedirect = (origin: string) => `${stableOrigin(origin)}/api/google/callback`;

export function googleAuthUrl(origin: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!.trim());
  u.searchParams.set("redirect_uri", googleRedirect(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent"); // always hand back a refresh token
  u.searchParams.set("login_hint", "info@lightdmv.com");
  u.searchParams.set("state", state);
  return u.toString();
}

async function token(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(), ...params }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed (${res.status}): ${j.error_description || j.error || "no token"}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
}

export async function googleExchange(code: string, origin: string) {
  const j = await token({ grant_type: "authorization_code", code, redirect_uri: googleRedirect(origin) });
  if (!j.refresh_token) throw new Error("Google didn't hand back a long-lived key. Remove the app's access in your Google account and connect again.");
  let email: string | undefined;
  try { email = JSON.parse(Buffer.from(j.id_token!.split(".")[1], "base64url").toString()).email; } catch {}
  await kvSet<Tokens>(TOKENS, { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 120) * 1000, email, connectedAt: Date.now() });
}

export async function googleStatus() {
  const t = await kvGet<Tokens>(TOKENS);
  return { configured: googleConfigured(), connected: !!t, email: t?.email, connectedAt: t?.connectedAt };
}
export const googleDisconnect = () => kvDel(TOKENS);

async function access(): Promise<string> {
  const t = await kvGet<Tokens>(TOKENS);
  if (!t) throw new Error("Google is not connected.");
  if (t.expires_at > Date.now()) return t.access_token;
  const j = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  await kvSet<Tokens>(TOKENS, { ...t, access_token: j.access_token, expires_at: Date.now() + (j.expires_in - 120) * 1000 });
  return j.access_token;
}

async function gapi<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${await access()}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google (${res.status}): ${j.error?.message || "request failed"}`);
  return j as T;
}

/* ---------- Inbox ---------- */

export type InboxThread = { id: string; from: string; subject: string; snippet: string; lastAt: number; waiting: boolean; link: string };

const header = (m: any, name: string) => m?.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

/** Customer threads in the inbox from the last 14 days. "waiting" = the last message is theirs, not ours. */
export async function inboxThreads(limit = 40): Promise<InboxThread[]> {
  const me = (await kvGet<Tokens>(TOKENS))?.email?.toLowerCase() ?? "info@lightdmv.com";
  const q = encodeURIComponent("in:inbox newer_than:14d -category:promotions -category:social -category:updates -from:me");
  const list = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${limit}&q=${q}`);
  const out: InboxThread[] = [];
  for (const t of list.threads ?? []) {
    const th = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const msgs: any[] = th.messages ?? [];
    if (!msgs.length) continue;
    const first = msgs[0], last = msgs[msgs.length - 1];
    const customer = msgs.find((m) => addr(header(m, "From")) !== me) ?? first;
    out.push({
      id: t.id,
      from: header(customer, "From").replace(/<[^>]+>/, "").replace(/"/g, "").trim() || addr(header(customer, "From")),
      subject: header(first, "Subject") || "(no subject)",
      snippet: String(last.snippet ?? "").slice(0, 160),
      lastAt: Number(last.internalDate) || Date.now(),
      waiting: addr(header(last, "From")) !== me,
      link: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(me)}#all/${t.id}`,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/* ---------- Campaign sheet ---------- */

const colName = (i: number) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

/** Column of a month's week (1-4) in the campaign sheet: July starts at C, each month is 4 weeks + a total. */
export function sheetColumn(month: number, week: number): string | null {
  if (month < 7 || month > 12 || week < 1 || week > 4) return null;
  return colName(2 + (month - 7) * 5 + (week - 1));
}

export type SheetCell = { row: string; month: number; week: number; value: number };

/** Write counts into the sheet. Rows are matched by their name in column A; only the given cells change.
 *  Channels with no row in the sheet (door-to-door, car magnets, Bing) are skipped and listed back. */
export async function writeSheet(cells: SheetCell[]): Promise<{ written: { range: string; row: string; value: number }[]; missingRows: string[] }> {
  const meta = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`);
  const tab = meta.sheets?.[0]?.properties?.title ?? "Sheet1";
  const colA = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${tab}'!A1:A60`)}`);
  const names: string[] = (colA.values ?? []).map((r: string[]) => (r[0] ?? "").trim().toLowerCase());
  const written: { range: string; row: string; value: number }[] = [];
  const missing = new Set<string>();
  for (const c of cells) {
    const r = names.indexOf(c.row.trim().toLowerCase());
    const col = sheetColumn(c.month, c.week);
    if (r < 0) { missing.add(c.row); continue; }
    if (!col) continue;
    written.push({ range: `'${tab}'!${col}${r + 1}`, row: c.row, value: c.value });
  }
  if (written.length)
    await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
      method: "POST",
      body: { valueInputOption: "USER_ENTERED", data: written.map((w) => ({ range: w.range, values: [[w.value]] })) },
    });
  return { written, missingRows: [...missing] };
}

/** The whole campaign sheet as text, for showing it on the Marketing tab. */
export async function readSheetGrid(): Promise<{ title: string; rows: string[][] }> {
  const meta = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`);
  const tab = meta.sheets?.[0]?.properties?.title ?? "Sheet1";
  const v = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${tab}'!A1:AF40`)}?valueRenderOption=FORMATTED_VALUE`);
  return { title: tab, rows: (v.values ?? []) as string[][] };
}

/* ---------- Drive photos for the daily video ---------- */

export type DrivePic = { id: string; name: string; createdTime: string; folder?: string; width?: number; height?: number };

/** Photos added to Drive in the last `days` days, newest first. HEIC is fine: thumbnails come back as JPEG. */
export async function recentDrivePhotos(days = 30, limit = 150): Promise<DrivePic[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const q = encodeURIComponent(`mimeType contains 'image/' and trashed = false and createdTime > '${since}'`);
  const fields = encodeURIComponent("files(id,name,createdTime,parents,imageMediaMetadata(width,height))");
  const j = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=${limit}&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`);
  return (j.files ?? []).map((f: any) => ({
    id: f.id, name: f.name, createdTime: f.createdTime, folder: f.parents?.[0],
    width: f.imageMediaMetadata?.width, height: f.imageMediaMetadata?.height,
  }));
}

/** A JPEG of a Drive photo, `w` pixels on its long side (Drive renders it, HEIC included). */
export async function drivePhotoJpeg(id: string, w = 1600): Promise<Response> {
  const f = await gapi(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=thumbnailLink,mimeType&supportsAllDrives=true`);
  if (!f.thumbnailLink || !/^image\//.test(f.mimeType)) throw new Error("Not a photo, or Drive has no preview for it yet.");
  const url = String(f.thumbnailLink).replace(/=s\d+$/, `=s${Math.min(2400, Math.max(200, w))}`);
  const res = await fetch(url, { headers: { authorization: `Bearer ${await access()}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Drive preview failed (${res.status})`);
  return res;
}

const RUNNER_FILE = "Light DMV app - daily video key (do not share).txt";

/** Leave the video runner its key in Drive, where it reads it with its own Drive access. Only this app can see files it made. */
export async function writeRunnerFile(text: string) {
  const q = encodeURIComponent(`name = '${RUNNER_FILE}' and trashed = false`);
  const found = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const id = found.files?.[0]?.id;
  const boundary = "ldmv" + Date.now();
  const body = [
    `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(id ? {} : { name: RUNNER_FILE, mimeType: "text/plain" }),
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", text, `--${boundary}--`, "",
  ].join("\r\n");
  const url = id
    ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const res = await fetch(url, {
    method: id ? "PATCH" : "POST",
    headers: { authorization: `Bearer ${await access()}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Couldn't save the runner key to Drive (${res.status})`);
}
