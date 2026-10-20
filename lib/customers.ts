import { createHash } from "crypto";
import { kvGet, kvGetMany, kvGetPrefix, kvSet, kvSetMany } from "./store";
import { JC, JJ, JQ, jobberWebUrl, type CxLine, type CxMsg, type CxNote, type JClient, type JJob, type JQuote } from "./cxJobber";
import { GC, GM, GN, ghlContactUrl, type GContact, type GMsgs, type GNotes } from "./cxGhl";
import { isAdminLine, lineTags } from "./cxItems";
import { EM, type CxEmails } from "./cxEmail";

/* The owners' customer database: Jobber clients and GoHighLevel contacts merged into households (same phone, email
   or street address = one customer, so a couple with two quotes or a returning customer under a new name is never a
   new lead), with every season's jobs, dollars and line items, photos, texts and notes. Customer data lives only in
   the database; nothing here names anyone. */

export type CxRow = {
  id: string; name: string; aka: string[]; address?: string; phone?: string; email?: string;
  seasons: number[]; total: number; lastAt: number; jobs: number; quotes: number;
  status: "customer" | "quoted" | "lead"; jobber: boolean; ghl: boolean; bins?: string[];
};
type Members = { jc: string[]; gc: string[]; jq: string[]; jj: string[] };

const INDEX = "ldmv:cx:index";
const MEMBERS = "ldmv:cx:h:";

/** Nov 2026 installs and Jan 2027 takedowns are the 2026 season. */
export const seasonOf = (iso?: string) => {
  const t = Date.parse(iso ?? "");
  if (!t) return 0;
  const d = new Date(t);
  return d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
};
const SOLD = /approved|converted|accepted|won|sold/i;
const DEAD = /archived|rejected|declined|lost|draft/i;
export const jobDate = (j: JJob) => j.startAt || j.completedAt || j.createdAt;

const digits = (p: string) => p.replace(/\D/g, "").slice(-10);
const OUR_EMAIL = /@lightdmv\.com$/i;
function addressKey(a?: string): string | null {
  if (!a) return null;
  const parts = a.toLowerCase().split(",").map((s) => s.trim());
  const m = parts[0]?.match(/^(\d+[a-z]?)\s+(.+)$/);
  if (!m) return null;
  const word = m[2].replace(/\b(n|s|e|w|north|south|east|west)\b/g, "").replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/)[0];
  const unit = parts[0].match(/(?:apt|unit|suite|ste|#)\s*([a-z0-9-]+)/)?.[1] ?? "";
  const zip = a.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/)?.[1];
  const place = zip ?? parts[1]?.replace(/[^a-z ]/g, "").trim();
  return word && place ? `${m[1]} ${word} ${unit}|${place}` : null;
}

/** Rebuild the customer list from every saved Jobber and GoHighLevel record. */
export async function buildCustomers(): Promise<number> {
  const [jcs, jqs, jjs, gcs] = await Promise.all([
    kvGetPrefix<JClient>(JC), kvGetPrefix<JQuote>(JQ), kvGetPrefix<JJob>(JJ), kvGetPrefix<GContact>(GC),
  ]);
  const ids: string[] = [];
  const parent: number[] = [];
  const add = (id: string) => { ids.push(id); parent.push(parent.length); return parent.length - 1; };
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); };

  const clients = jcs.map(([, c]) => c);
  const contacts = gcs.map(([, c]) => c);
  const keysOf: string[][] = [];
  for (const c of clients) {
    add(`j:${c.id}`);
    keysOf.push([...c.phones.map((p) => `p:${digits(p)}`), ...c.emails.filter((e) => !OUR_EMAIL.test(e)).map((e) => `e:${e.toLowerCase()}`),
      ...c.addresses.map(addressKey).filter(Boolean).map((k) => `a:${k}`)]);
  }
  for (const c of contacts) {
    add(`g:${c.id}`);
    keysOf.push([...c.phones.map((p) => `p:${digits(p)}`), ...c.emails.filter((e) => !OUR_EMAIL.test(e)).map((e) => `e:${e.toLowerCase()}`),
      ...(addressKey(c.address) ? [`a:${addressKey(c.address)}`] : [])]);
  }
  // Quotes and jobs carry the property address, which ties a client to the house even when the client record has none.
  const quotesBy = new Map<string, JQuote[]>(), jobsBy = new Map<string, JJob[]>();
  for (const [, q] of jqs) if (q.clientId) (quotesBy.get(q.clientId) ?? quotesBy.set(q.clientId, []).get(q.clientId)!).push(q);
  for (const [, j] of jjs) if (j.clientId) (jobsBy.get(j.clientId) ?? jobsBy.set(j.clientId, []).get(j.clientId)!).push(j);
  clients.forEach((c, i) => {
    for (const x of [...(quotesBy.get(c.id) ?? []), ...(jobsBy.get(c.id) ?? [])]) { const k = addressKey(x.address); if (k) keysOf[i].push(`a:${k}`); }
  });

  const byKey = new Map<string, number[]>();
  keysOf.forEach((ks, i) => { for (const k of new Set(ks)) if (k.length > 6 && !/^p:\d{0,9}$/.test(k)) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(i); });
  // A phone, email or address on many records is an office line or a shared building, not one household.
  for (const list of byKey.values()) if (list.length <= 6) for (const i of list.slice(1)) union(list[0], i);

  const groups = new Map<number, number[]>();
  ids.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });

  const { loadDriveIndex, driveFor } = await import("./drive");
  const driveIdx = await loadDriveIndex();
  const rows: CxRow[] = [];
  const members: [string, Members][] = [];
  for (const list of groups.values()) {
    const js = list.filter((i) => i < clients.length).map((i) => clients[i]);
    const gs = list.filter((i) => i >= clients.length).map((i) => contacts[i - clients.length]);
    const quotes = js.flatMap((c) => quotesBy.get(c.id) ?? []);
    const jobs = js.flatMap((c) => jobsBy.get(c.id) ?? []);
    const m: Members = { jc: js.map((c) => c.id), gc: gs.map((c) => c.id), jq: quotes.map((q) => q.id), jj: jobs.map((j) => j.id) };
    const id = createHash("sha1").update([...m.jc.map((x) => `j:${x}`), ...m.gc.map((x) => `g:${x}`)].sort()[0]).digest("hex").slice(0, 16);
    const { seasons, total } = money(jobs, quotes);
    const times = [...jobs.map((j) => jobDate(j)), ...quotes.map((q) => q.createdAt), ...gs.map((c) => c.dateUpdated), ...js.map((c) => c.updatedAt)]
      .map((t) => Date.parse(t ?? "") || 0);
    // The name on the newest Jobber work, else the newest Jobber client, else GoHighLevel.
    const newest = [...js].sort((a, b) => latest(b, quotesBy, jobsBy) - latest(a, quotesBy, jobsBy))[0];
    const names = [...new Set([newest?.name, ...js.map((c) => c.name), ...gs.map((c) => c.name)].filter((n): n is string => !!n && n !== "Unnamed"))];
    const address = [...jobs].sort((a, b) => (jobDate(b) ?? "").localeCompare(jobDate(a) ?? "")).find((j) => j.address)?.address
      ?? quotes.find((q) => q.address)?.address ?? js.flatMap((c) => c.addresses)[0] ?? gs.find((c) => c.address)?.address;
    rows.push({
      id, name: names[0] ?? "Unnamed", aka: names.slice(1, 5), address,
      phone: [...js.flatMap((c) => c.phones), ...gs.flatMap((c) => c.phones)][0], email: [...js.flatMap((c) => c.emails), ...gs.flatMap((c) => c.emails)].find((e) => !OUR_EMAIL.test(e)),
      seasons, total, lastAt: Math.max(0, ...times), jobs: jobs.length, quotes: quotes.length,
      status: total > 0 || jobs.length ? "customer" : quotes.length ? "quoted" : "lead", jobber: js.length > 0, ghl: gs.length > 0,
      bins: [...new Set(js.flatMap((c) => driveFor(driveIdx, c.name).bins.map((b) => b.bin)))],
    });
    members.push([MEMBERS + id, m]);
  }
  rows.sort((a, b) => b.lastAt - a.lastAt);
  await kvSetMany(members);
  await kvSet(INDEX, rows);
  g.__cxIndex = { at: Date.now(), rows };
  return rows.length;
}

/** Who the household's name comes from: the client with the newest job, else the newest quote, else the newest client. */
function latest(c: JClient, quotesBy: Map<string, JQuote[]>, jobsBy: Map<string, JJob[]>) {
  const t = (xs: (string | undefined)[]) => Math.max(0, ...xs.map((x) => Date.parse(x ?? "") || 0));
  const job = t((jobsBy.get(c.id) ?? []).map(jobDate));
  return job ? 2e13 + job : t((quotesBy.get(c.id) ?? []).map((q) => q.createdAt)) ? 1e13 + t((quotesBy.get(c.id) ?? []).map((q) => q.createdAt)) : t([c.createdAt]);
}

/** Dollars per season: the jobs' totals, else the season's sold quotes. */
function money(jobs: JJob[], quotes: JQuote[]) {
  const by = new Map<number, number>();
  for (const j of jobs) { const s = seasonOf(jobDate(j)); if (s) by.set(s, (by.get(s) ?? 0) + (j.total ?? 0)); }
  for (const q of quotes) {
    const s = seasonOf(q.createdAt);
    if (!s || by.has(s) || !SOLD.test(q.status ?? "")) continue;
    by.set(s, q.subtotal ?? q.total ?? 0);
  }
  const seasons = [...by.keys()].sort((a, b) => b - a);
  return { seasons, total: Math.round([...by.values()].reduce((t, v) => t + v, 0)), by };
}

const g = globalThis as unknown as { __cxIndex?: { at: number; rows: CxRow[] } };
export async function loadIndex(): Promise<CxRow[]> {
  if (g.__cxIndex && Date.now() - g.__cxIndex.at < 60_000) return g.__cxIndex.rows;
  const rows = (await kvGet<CxRow[]>(INDEX)) ?? [];
  g.__cxIndex = { at: Date.now(), rows };
  return rows;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9@. ]/g, " ").replace(/\s+/g, " ").trim();
/** Search by any name, street, phone or email. Every word has to match. */
export function searchRows(rows: CxRow[], q: string, status?: string): CxRow[] {
  const words = norm(q).split(" ").filter(Boolean);
  const qd = q.replace(/\D/g, "");
  return rows.filter((r) => {
    if (status && status !== "all" && r.status !== status) return false;
    if (!words.length) return true;
    if (qd.length >= 4 && r.phone && digits(r.phone).includes(qd)) return true;
    // "bin 12" or "12" finds whoever is in that bin.
    const bin = q.match(/^\s*(?:bin|box)?\s*#?\s*(\d{1,4}[a-z]?)\s*$/i)?.[1];
    if (bin && r.bins?.includes(bin)) return true;
    const hay = norm([r.name, ...r.aka, r.address, r.email].filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/* ---------- One customer ---------- */

export type CxSeason = {
  year: number; total: number; tags: string[];
  jobs: { id: string; num?: string; title?: string; date?: string; status?: string; total?: number; lines: CxLine[]; url?: string }[];
  quotes: { id: string; num?: string; title?: string; date?: string; status?: string; total?: number; lines: CxLine[]; url?: string }[];
};
export type CxEvent = { id: string; at?: string; kind: string; dir?: "in" | "out"; text: string; from: string; group: "text" | "note" | "call" | "email" | "other" };
export type CxPhoto = { url: string; label: string; year?: number; group: "design" | "install" | "takedown" | "crew" };
/** A storage bin: where it was listed (a Drive "Bins" sheet, or a Jobber note) and that list's year when it names one. */
export type CxBin = { bin: string; year?: number; status?: string; source: string };
export type CxProfile = Omit<CxRow, "bins"> & {
  bins: CxBin[];
  phones: string[]; emails: string[]; addresses: string[]; tags: string[];
  links: { label: string; url: string }[];
  seasons_: CxSeason[]; photos: CxPhoto[]; timeline: CxEvent[];
  synced: { notesAt?: number; textsAt?: number; emailsAt?: number }; jobberTexts: boolean; contactIds: string[];
};

const groupOf = (m: CxMsg | CxNote & { kind?: string }): CxEvent["group"] => {
  const k = (m as any).kind as string | undefined;
  if (!k) return "note";
  if (k === "Text" || k === "Facebook" || k === "Instagram" || k === "WhatsApp" || k === "Chat") return "text";
  if (k === "Call") return "call";
  if (k === "Email") return "email";
  return "other";
};
const lightLines = (ls: CxLine[]) => ls.filter((l) => !isAdminLine(l));

export async function customerProfile(id: string): Promise<CxProfile | null> {
  const [rows, m] = await Promise.all([loadIndex(), kvGet<Members>(MEMBERS + id)]);
  const row = rows.find((r) => r.id === id);
  if (!row || !m) return null;
  const [jcs, jqs, jjs, gcs, gms, gns, ems] = await Promise.all([
    kvGetMany<JClient>(m.jc.map((x) => JC + x)), kvGetMany<JQuote>(m.jq.map((x) => JQ + x)), kvGetMany<JJob>(m.jj.map((x) => JJ + x)),
    kvGetMany<GContact>(m.gc.map((x) => GC + x)), kvGetMany<GMsgs>(m.gc.map((x) => GM + x)), kvGetMany<GNotes>(m.gc.map((x) => GN + x)),
    kvGet<CxEmails>(EM + id),
  ]);
  const clients = jcs.filter(Boolean) as JClient[], quotes = jqs.filter(Boolean) as JQuote[], jobs = jjs.filter(Boolean) as JJob[];
  const contacts = gcs.filter(Boolean) as GContact[];

  // Seasons, newest first: each one's jobs and quotes with their line items.
  const { by } = money(jobs, quotes);
  const years = [...new Set([...jobs.map((j) => seasonOf(jobDate(j))), ...quotes.map((q) => seasonOf(q.createdAt))].filter(Boolean))].sort((a, b) => b - a);
  const seasons: CxSeason[] = years.map((year) => {
    const js = jobs.filter((j) => seasonOf(jobDate(j)) === year).sort((a, b) => (jobDate(a) ?? "").localeCompare(jobDate(b) ?? ""));
    const qs = quotes.filter((q) => seasonOf(q.createdAt) === year).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    // What they had: the jobs' lines, else the sold quote's, else the newest quote's.
    const had = js.length ? js.flatMap((j) => j.lines) : (qs.find((q) => SOLD.test(q.status ?? "")) ?? qs[0])?.lines ?? [];
    return {
      year, total: Math.round(by.get(year) ?? 0), tags: lineTags(had),
      jobs: js.map((j) => ({ id: j.id, num: j.num, title: j.title, date: jobDate(j), status: j.status, total: j.total, lines: lightLines(j.lines), url: jobberWebUrl(j.id, "work_orders") })),
      quotes: qs.filter((q) => !DEAD.test(q.status ?? "") || !js.length).map((q) => ({ id: q.id, num: q.num, title: q.title, date: q.createdAt, status: q.status, total: q.subtotal ?? q.total, lines: lightLines(q.lines), url: jobberWebUrl(q.id, "quotes") })),
    };
  });

  // Every text, call, email and note, newest first.
  const events: CxEvent[] = [];
  const push = (x: CxMsg | CxNote, id: string) => events.push({ id, at: x.at, kind: (x as CxMsg).kind ?? "Note", dir: (x as CxMsg).dir, text: x.text, from: x.from, group: groupOf(x as any) });
  clients.forEach((c) => { c.notes.forEach((n, i) => push(n, `jcn:${c.id}:${i}`)); c.texts.forEach((t) => push(t, `jt:${t.id}`)); });
  quotes.forEach((q) => q.notes.forEach((n, i) => push({ ...n, from: `Jobber quote #${q.num ?? ""} note` }, `jqn:${q.id}:${i}`)));
  jobs.forEach((j) => j.notes.forEach((n, i) => push({ ...n, from: `Jobber job #${j.num ?? ""} note` }, `jjn:${j.id}:${i}`)));
  gms.forEach((x) => x?.msgs.forEach((t) => push(t, `gm:${t.id}`)));
  gns.forEach((x, k) => x?.notes.forEach((n, i) => push(n, `gn:${m.gc[k]}:${i}`)));
  ems?.msgs.forEach((t) => push(t, t.id));
  const seen = new Set<string>();
  const timeline = events.filter((e) => { const k = `${e.at?.slice(0, 16)}|${e.text.slice(0, 80)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 800);

  // Bin numbers written in any Jobber note or line ("bin 12", "box #7").
  const noteText = [...clients.flatMap((c) => c.notes), ...quotes.flatMap((q) => [...q.notes, ...q.lines.map((l) => ({ text: `${l.name} ${l.description ?? ""}`, at: q.createdAt }))]),
    ...jobs.flatMap((j) => [...j.notes, ...j.lines.map((l) => ({ text: `${l.name} ${l.description ?? ""}`, at: jobDate(j) }))])];
  const noteBins: CxBin[] = noteText.flatMap((n) => [...n.text.matchAll(/\b(?:bin|box)\s*(?:#|no\.?|number)?\s*(\d{1,4})\b/gi)]
    .map((x) => ({ bin: x[1], year: seasonOf(n.at) || undefined, source: "Jobber notes" })));
  const { photos, bins: driveBins } = await customerPhotos(clients, contacts, m.jj);
  const bins = [...driveBins, ...noteBins].filter((b, i, a) => a.findIndex((x) => x.bin === b.bin && x.year === b.year) === i)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.bin.localeCompare(b.bin, undefined, { numeric: true }));
  const { getCxState } = await import("./cxSync");
  const textFields = (await getCxState()).jobberTextFields ?? [];
  const links = [
    ...clients.map((c) => ({ label: clients.length > 1 ? `Jobber: ${c.name}` : "Open in Jobber", url: jobberWebUrl(c.id, "clients") ?? "" })),
    ...contacts.map((c) => ({ label: contacts.length > 1 ? `GoHighLevel: ${c.name}` : "Open in GoHighLevel", url: ghlContactUrl(c.id) })),
  ].filter((l) => l.url);
  const ats = (xs: ({ at: number } | null)[]) => { const t = xs.filter(Boolean).map((x) => x!.at); return t.length ? Math.min(...t) : undefined; };
  return {
    ...row,
    phones: [...clients.flatMap((c) => c.phones), ...contacts.flatMap((c) => c.phones)].map((x) => x.trim()).filter((x, i, a) => a.findIndex((y) => digits(y) === digits(x)) === i),
    emails: [...new Set([...clients.flatMap((c) => c.emails), ...contacts.flatMap((c) => c.emails)].map((e) => e.toLowerCase()))],
    addresses: [...new Set([...jobs.map((j) => j.address), ...quotes.map((q) => q.address), ...clients.flatMap((c) => c.addresses), ...contacts.map((c) => c.address)].filter((a): a is string => !!a))],
    tags: [...new Set([...clients.flatMap((c) => c.tags), ...contacts.flatMap((c) => c.tags)])],
    links, seasons_: seasons, photos, timeline, bins,
    synced: { notesAt: ats(gns), textsAt: ats(gms), emailsAt: ems?.at }, jobberTexts: textFields.length > 0, contactIds: m.gc,
  };
}

/** The photos the app already has for this customer: Light Design Hero designs and finished-install and takedown
    photos from Drive (matched by name, as on the job page), plus every photo the crews took on the app's checklists. */
async function customerPhotos(clients: JClient[], contacts: GContact[], jobIds: string[]): Promise<{ photos: CxPhoto[]; bins: CxBin[] }> {
  const [{ loadDriveIndex, driveFor }, { loadLibrary, mockupsFor }, { getJobs, getChecklists }] = await Promise.all([import("./drive"), import("./mockups"), import("./jobs")]);
  const [idx, lib, all] = await Promise.all([loadDriveIndex(), loadLibrary(), getJobs()]);
  const out: CxPhoto[] = [];
  const bins: CxBin[] = [];
  const seen = new Set<string>();
  const add = (p: CxPhoto) => { if (!seen.has(p.url)) { seen.add(p.url); out.push(p); } };
  const names = [...new Set([...clients.map((c) => c.name), ...contacts.map((c) => c.name)])].filter((n) => n && n !== "Unnamed");
  for (const n of names) {
    for (const d of mockupsFor(lib, n)) add({ url: d.url, label: d.ai ? "Whole-house design" : `Design ${d.n}`, group: "design" });
    const match = driveFor(idx, n);
    for (const x of match.photos) if (x.sure && x.bin) bins.push({ bin: x.bin, year: x.year || undefined, source: "Takedown photo" });
    for (const b of match.bins) bins.push({ bin: b.bin, status: b.status || undefined, source: b.source, year: Number(b.source.match(/20\d\d/)?.[0]) || undefined });
    for (const p of match.installPhotos) add({ url: p.thumb, label: "Finished install", year: p.year || undefined, group: "install" });
    for (const p of match.photos.filter((x) => x.sure || match.bins.length === 0)) add({ url: p.thumb, label: p.bin ? `Takedown, bin ${p.bin}` : "Takedown", year: p.year || undefined, group: "takedown" });
  }
  const ids = new Set(jobIds);
  const appJobs = Object.values(all).filter((j) => j.jobberJobId && ids.has(j.jobberJobId));
  const lists = await getChecklists(appJobs);
  lists.forEach((c, i) => {
    const j = appJobs[i];
    for (const [item, e] of Object.entries(c.items)) for (const url of e.photos ?? [])
      add({ url, label: `${j.kind === "takedown" ? "Takedown" : j.kind === "fix" ? "Service" : "Install"}: ${e.parts?.[url] || item.replace(/-/g, " ")}`, year: seasonOf(j.start) || undefined, group: "crew" });
  });
  return { photos: out, bins };
}
