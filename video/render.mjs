// Render the daily reel: node render.mjs <media-dir> <out.mp4> [props.json]
// <media-dir> holds the shots in order (01.mov, 02.jpg, 03.mp4...): job videos and photos. Each video is cut to
// its best ~2 s with ffmpeg (9:16, landscape footage sits on a blurred fill), then Remotion adds the hook,
// captions and call to action and renders 1080x1920 H.264. props.json may set headline, beats, towns, cta,
// music (a path to an mp3), and starts (seconds into each video to cut from, by shot index).
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , mediaDir, out = "out/reel.mp4", propsFile] = process.argv;
if (!mediaDir) { console.error("usage: node render.mjs <media-dir> <out.mp4> [props.json]"); process.exit(1); }

const FPS = 30;
const VIDEO_S = 2.2, FIRST_S = 2.8, PHOTO_S = 1.4;
const extra = propsFile ? JSON.parse(fs.readFileSync(propsFile, "utf8")) : {};

const today = path.join(here, "public", "today");
fs.rmSync(today, { recursive: true, force: true });
fs.mkdirSync(today, { recursive: true });

const files = fs.readdirSync(mediaDir).filter((f) => /\.(jpe?g|png|webp|mov|mp4|m4v)$/i.test(f)).sort().slice(0, 12);
if (!files.length) { console.error("no photos or videos in", mediaDir); process.exit(1); }

const probe = (f) => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", f]).toString());
  const v = j.streams.find((s) => s.codec_type === "video") || {};
  const rot = Math.abs(Number(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation != null)?.rotation || 0)) % 180 === 90;
  return { seconds: Number(j.format.duration) || 0, w: rot ? v.height : v.width, h: rot ? v.width : v.height };
};

const shots = files.map((f, i) => {
  const src = path.join(mediaDir, f);
  const town = (extra.towns || [])[i] || undefined;
  if (/\.(mov|mp4|m4v)$/i.test(f)) {
    const len = i === 0 ? FIRST_S : VIDEO_S;
    const { seconds, w, h } = probe(src);
    const start = Math.max(0, Math.min(Number(extra.starts?.[i] ?? seconds * 0.3), seconds - len - 0.05));
    const cut = Math.min(len, Math.max(0.6, seconds - start));
    const vf = w > h
      // Landscape: sharp footage across the middle on a blurred, zoomed copy of itself.
      ? "split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.08[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,setsar=1"
      : "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1";
    const name = `${String(i + 1).padStart(2, "0")}.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(start), "-t", String(cut), "-i", src, "-filter_complex", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", path.join(today, name)]);
    return { kind: "video", src: `today/${name}`, frames: Math.round(cut * FPS), town };
  }
  const name = `${String(i + 1).padStart(2, "0")}${path.extname(f).toLowerCase()}`;
  fs.copyFileSync(src, path.join(today, name));
  return { kind: "photo", src: `today/${name}`, frames: Math.round((i === 0 ? FIRST_S : PHOTO_S) * FPS), town };
});

let music;
if (extra.music && fs.existsSync(extra.music)) {
  music = `today/music${path.extname(extra.music)}`;
  fs.copyFileSync(extra.music, path.join(here, "public", music));
}

const inputProps = {
  headline: "Your house, but make it Christmas",
  beats: ["We design it", "We install it", "Lit all season", "We take it down", "We store it", "Free quote"],
  phone: "(703) 951-5100",
  site: "lightdmv.com",
  cta: "Book your install",
  ...extra,
  shots,
  music,
};
delete inputProps.towns; delete inputProps.starts;

// Use a browser already on the machine when there is one (cloud sessions have Playwright's).
const browserExecutable = process.env.REMOTION_BROWSER || [
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
].find((p) => fs.existsSync(p)) || null;

const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: path.join(here, "public") });
const composition = await selectComposition({ serveUrl, id: "DailyReel", inputProps, browserExecutable });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: out, inputProps, browserExecutable, crf: 21 });
console.log(JSON.stringify({ out: path.resolve(out), seconds: composition.durationInFrames / composition.fps, shots: shots.length, videos: shots.filter((s) => s.kind === "video").length }));
