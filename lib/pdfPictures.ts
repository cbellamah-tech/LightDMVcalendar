import { createHash } from "crypto";
import { deflateSync, inflateSync } from "zlib";

/* Pictures inside a PDF (the signed quote Jobber keeps carries each line item's mockup). */

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A PNG file from 8-bit gray or RGB pixel rows (zlib data, PNG row filters already applied). */
function png(w: number, h: number, colors: number, idat: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colors === 3 ? 2 : 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
const num = (dict: string, key: string) => Number(dict.match(new RegExp(`/${key}\\s+(\\d+)`))?.[1] || 0);

export type PdfPicture = { data: Buffer; type: "image/jpeg" | "image/png"; w: number; h: number };

/** Photos embedded in a PDF: JPEG streams as they are, 8-bit RGB or gray Flate images rebuilt as PNG. Logos and icons are skipped. */
export function pdfPictures(pdf: Buffer, minSide = 240): PdfPicture[] {
  const out: PdfPicture[] = [];
  const seen = new Set<string>();
  let i = 0;
  while ((i = pdf.indexOf("/Subtype", i)) !== -1) {
    const at = i;
    i += 8;
    if (!/^\s*\/Image/.test(pdf.subarray(i, i + 12).toString("latin1"))) continue;
    const dictStart = pdf.lastIndexOf(" obj", at);
    const s = pdf.indexOf("stream", at);
    if (dictStart < 0 || s < 0) break;
    const dict = pdf.subarray(dictStart, s).toString("latin1");
    let start = s + 6;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const len = num(dict, "Length");
    let end = len && pdf.subarray(start + len, start + len + 20).toString("latin1").includes("endstream") ? start + len : pdf.indexOf("endstream", start);
    if (end < 0) break;
    i = end;
    const w = num(dict, "Width"), h = num(dict, "Height");
    if (Math.min(w, h) < minSide || /\/ImageMask\s+true/.test(dict)) continue;
    const raw = pdf.subarray(start, end);
    let pic: PdfPicture | null = null;
    if (/\/DCTDecode/.test(dict) && !/\/FlateDecode/.test(dict)) {
      if (raw[0] === 0xff && raw[1] === 0xd8) pic = { data: Buffer.from(raw), type: "image/jpeg", w, h };
    } else if (/\/FlateDecode/.test(dict) && !/\/DCTDecode/.test(dict) && num(dict, "BitsPerComponent") === 8) {
      const colors = /\/DeviceRGB|\/CalRGB/.test(dict) ? 3 : /\/DeviceGray|\/CalGray/.test(dict) ? 1 : /\/ICCBased/.test(dict) ? 3 : 0;
      if (!colors) continue;
      try {
        const px = inflateSync(raw);
        const row = w * colors;
        if (num(dict, "Predictor") >= 10 && px.length === (row + 1) * h) pic = { data: png(w, h, colors, Buffer.from(raw)), type: "image/png", w, h };
        else if (px.length === row * h) {
          // No PNG predictor: add a "none" filter byte to each row.
          const rows = Buffer.alloc((row + 1) * h);
          for (let y = 0; y < h; y++) px.copy(rows, y * (row + 1) + 1, y * row, (y + 1) * row);
          pic = { data: png(w, h, colors, deflateSync(rows)), type: "image/png", w, h };
        }
      } catch { /* not a plain image stream */ }
    }
    if (!pic) continue;
    const key = sha(pic.data.subarray(0, 4096).toString("base64") + pic.data.length);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pic);
  }
  return out;
}

