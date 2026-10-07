// Render the daily reel: node render.mjs <photos-dir> <out.mp4> [props.json]
// Copies the photos into public/today, bundles, and renders 1080x1920 H.264.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , photosDir, out = "out/reel.mp4", propsFile] = process.argv;
if (!photosDir) { console.error("usage: node render.mjs <photos-dir> <out.mp4> [props.json]"); process.exit(1); }

const today = path.join(here, "public", "today");
fs.rmSync(today, { recursive: true, force: true });
fs.mkdirSync(today, { recursive: true });
const photos = fs.readdirSync(photosDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 10);
if (!photos.length) { console.error("no photos in", photosDir); process.exit(1); }
photos.forEach((f, i) => fs.copyFileSync(path.join(photosDir, f), path.join(today, `${i + 1}${path.extname(f).toLowerCase()}`)));

const extra = propsFile ? JSON.parse(fs.readFileSync(propsFile, "utf8")) : {};
const inputProps = {
  headline: "Lighting up the DMV",
  phone: "(703) 951-5100",
  site: "lightdmv.com",
  cta: "Book your install",
  towns: [],
  ...extra,
  photos: photos.map((f, i) => `today/${i + 1}${path.extname(f).toLowerCase()}`),
};

// Use a browser already on the machine when there is one (cloud sessions have Playwright's).
const browserExecutable = process.env.REMOTION_BROWSER || [
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
].find((p) => fs.existsSync(p)) || null;

const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: path.join(here, "public") });
const composition = await selectComposition({ serveUrl, id: "DailyReel", inputProps, browserExecutable });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: out, inputProps, browserExecutable, crf: 23 });
console.log(JSON.stringify({ out: path.resolve(out), seconds: composition.durationInFrames / composition.fps, photos: photos.length }));
