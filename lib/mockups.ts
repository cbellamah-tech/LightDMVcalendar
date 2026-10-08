import { kvGet, kvUpdate } from "./store";
import type { DetailLine } from "./jobDetails";

/* Light Design Hero designs, as downloaded before they go on a Jobber quote: "A_Name_Design1.png" is the first line
   item's design for A. Name, "..._Design1_AI.png" the combined AI picture of the whole house. Jobber's API doesn't hand
   out line item photos (and its quote PDF leaves them out), so the designs are read where they are made: each quoting
   computer's Downloads folder synced to the company Google Drive, picked up by lib/driveSync.ts. Files can still be
   added by hand on the Jobber tab. Each job pairs by the customer's first initial and last name; names stay in the
   database, never the code. */

export type Mockup = { n: number; ai: boolean; url: string; file: string; at: number; driveId?: string };
type Library = Record<string, Mockup[]>; // "a name" -> mockups
const KEY = "ldmv:mockups";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** "A_Name_Design1 (2).png" -> { who: "a name", n: 1, ai: false } */
export function parseMockupName(file: string) {
  const m = file.match(/^([A-Za-z])_(.+?)_Design(\d+)(_AI)?(?:\s*\(\d+\))?\.(png|jpe?g|webp)$/i);
  if (!m) return null;
  return { who: norm(`${m[1]} ${m[2].replace(/_/g, " ")}`), n: Number(m[3]), ai: !!m[4] };
}

export const loadLibrary = async () => (await kvGet<Library>(KEY)) ?? {};

export async function addMockup(file: string, url: string) {
  const p = parseMockupName(file);
  if (!p) throw new Error(`${file} isn't named like a Light Design Hero download (A_Name_Design1.png).`);
  await kvUpdate<Library>(KEY, {}, (lib) => {
    // A re-download of the same design replaces the older copy.
    const list = (lib[p.who] ?? []).filter((x) => !(x.n === p.n && x.ai === p.ai));
    list.push({ n: p.n, ai: p.ai, url, file, at: Date.now() });
    lib[p.who] = list.sort((a, b) => a.n - b.n || Number(a.ai) - Number(b.ai));
  });
}

/** Swap in the designs found in Google Drive (newest copy of each design wins; files added by hand stay unless Drive has a newer one). */
export async function setDriveMockups(found: { file: string; driveId: string; at: number }[]) {
  await kvUpdate<Library>(KEY, {}, (lib) => {
    for (const who of Object.keys(lib)) lib[who] = lib[who].filter((m) => !m.driveId);
    for (const f of [...found].sort((a, b) => a.at - b.at)) {
      const p = parseMockupName(f.file);
      if (!p) continue;
      const list = lib[p.who] ?? [];
      const same = list.find((x) => x.n === p.n && x.ai === p.ai);
      if (same && same.at > f.at) continue;
      lib[p.who] = [...list.filter((x) => x !== same), { n: p.n, ai: p.ai, url: `/api/jobs/drive-img/${f.driveId}`, file: f.file, at: f.at, driveId: f.driveId }]
        .sort((a, b) => a.n - b.n || Number(a.ai) - Number(b.ai));
    }
    for (const who of Object.keys(lib)) if (!lib[who].length) delete lib[who];
  });
}

/** A Drive design the library holds (the photo route serves only files the app found itself). */
export const mockupByDriveId = (lib: Library, id: string) => Object.values(lib).flat().find((m) => m.driveId === id) ?? null;

/** Files already in the library, so a second drop skips them. */
export async function knownFiles() {
  const lib = await loadLibrary();
  return Object.values(lib).flat().map((m) => m.file);
}

/** The customer's mockups: first initial plus the whole last name ("Jane Doe-Roe" = J_Doe_Roe). */
export function mockupsFor(lib: Library, clientName: string): Mockup[] {
  const w = norm(clientName).split(" ").filter(Boolean);
  if (w.length < 2) return [];
  const initial = w[0][0];
  for (let k = 1; k < w.length; k++) {
    const hit = lib[`${initial} ${w.slice(k).join(" ")}`];
    if (hit?.length) return hit;
  }
  return lib[`${initial} ${w[w.length - 1]}`] ?? [];
}

/** Lines the customer is shown a picture for ("Click Photo to Preview", "(Photo included)", "shown in the design photo"). */
export const wantsPhoto = (l: { name: string; description?: string }) => /photo|preview|picture|mockup/i.test(`${l.name} ${l.description || ""}`);

/** Put Design 1, 2, 3... on the quote's photo lines in quote order (the job may leave out optional lines the customer skipped),
 *  then onto the job's lines by name; anything left over (and the AI whole-house picture) shows above the list. */
export function attachMockups(lines: DetailLine[], mockups: Mockup[], quoteLines?: { name: string; description?: string }[]): { lines: DetailLine[]; extra: string[] } {
  const designs = mockups.filter((m) => !m.ai);
  const ai = mockups.filter((m) => m.ai).map((m) => m.url);
  if (!designs.length) return { lines, extra: ai };
  const order = (quoteLines?.length ? quoteLines : lines).filter(wantsPhoto);
  const byName = new Map<string, Mockup>();
  order.forEach((l, k) => { if (designs[k] && !byName.has(l.name)) byName.set(l.name, designs[k]); });
  const used = new Set<Mockup>();
  const out = lines.map((l) => {
    const m = byName.get(l.name);
    if (!m || l.images.some((f) => f.image)) return l;
    used.add(m);
    return { ...l, images: [...l.images, { name: `Design ${m.n}`, url: m.url, image: true }] };
  });
  return { lines: out, extra: [...ai, ...designs.filter((m) => !used.has(m)).map((m) => m.url)] };
}
