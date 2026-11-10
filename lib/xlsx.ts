import { inflateRawSync } from "zlib";

/* Just enough of an .xlsx reader for vendor reports (iHeart's spot report): the first sheet as rows of
   strings and numbers. No package needed: an .xlsx is a zip of XML files. */

function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not an Excel file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** The first sheet's cells: text as strings, everything else as numbers (dates stay Excel serial numbers). */
export function readFirstSheet(buf: Buffer): (string | number | null)[][] {
  const files = unzip(buf);
  const shared = [...(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error("No sheet in the Excel file");
  const xml = files.get(sheetName)!.toString("utf8");
  const rows: (string | number | null)[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: (string | number | null)[] = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const val = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? unxml(inline ?? "") : type === "str" ? unxml(v ?? "") : v == null ? null : Number(v);
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(Array.from(row, (x) => x ?? null));
  }
  return rows;
}

/** An Excel date (serial number, or text like 10/20/2026) as "YYYY-MM-DD". */
export function excelDay(v: string | number | null): string {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 10);
  const us = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) return `${us[3].length === 2 ? "20" + us[3] : us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = String(v ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : "";
}

/** An Excel time (fraction of a day, or text like 5:15 AM) as "HH:MM", 24-hour. */
export function excelTime(v: string | number | null): string {
  if (typeof v === "number") {
    const mins = Math.round((v % 1) * 1440) % 1440;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?/i);
  if (!m) return "";
  let h = +m[1];
  if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
