import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/* A 9:16 reel for Facebook, Instagram, Google, LinkedIn and YouTube Shorts. It opens straight on the best
   footage with a big hook line, cuts fast between real job clips (and a few photos), runs a short caption
   per cut (design, install, takedown...), and ends on a quick call to action. */

export const FPS = 30;
const OUTRO = 66; // 2.2 s
const PUNCH = 7;  // zoom punch on each cut

export type Shot = { kind: "video" | "photo"; src: string; frames: number; town?: string };

export type ReelProps = {
  headline: string;     // the hook, shown over the first shot
  shots: Shot[];        // files inside public/, in order
  beats: string[];      // one short caption per shot after the first, cycled
  phone: string;
  site: string;
  cta: string;
  music?: string;       // optional file inside public/
};

export const reelFrames = (shots: Shot[]) => shots.reduce((t, s) => t + s.frames, 0) + OUTRO;

const NAVY = "#0d1730";
const RED = "#F10800";
const GOLD = "#f59e0b";
const FONT = "Inter, Helvetica, Arial, sans-serif";

function ShotView({ shot, index }: { shot: Shot; index: number }) {
  const f = useCurrentFrame();
  const punch = interpolate(f, [0, PUNCH], [1.12, 1], { extrapolateRight: "clamp" });
  const drift = shot.kind === "photo"
    ? interpolate(f, [0, shot.frames], index % 2 ? [1.0, 1.1] : [1.1, 1.0])
    : 1;
  const style = { width: "100%", height: "100%", objectFit: "cover" as const, transform: `scale(${punch * drift})` };
  return (
    <AbsoluteFill style={{ background: "black", overflow: "hidden" }}>
      {shot.kind === "video"
        ? <OffthreadVideo src={staticFile(shot.src)} muted style={style} />
        : <Img src={staticFile(shot.src)} style={style} />}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55) 100%)" }} />
      {shot.town ? (
        <div style={{ position: "absolute", bottom: 120, width: "100%", textAlign: "center", color: "white", fontFamily: FONT, fontSize: 40, fontWeight: 700, letterSpacing: 1, textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>
          📍 {shot.town}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

function Hook({ text }: { text: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 11, stiffness: 160 } });
  const words = text.split(" ");
  const last = words.pop();
  return (
    <div style={{ position: "absolute", top: 260, left: 60, right: 60, textAlign: "center", transform: `scale(${0.6 + 0.4 * s})`, opacity: s }}>
      <span style={{ fontFamily: FONT, fontSize: 104, fontWeight: 900, lineHeight: 1.05, color: "white", letterSpacing: -2, textTransform: "uppercase", WebkitTextStroke: "3px black", paintOrder: "stroke fill", textShadow: "0 6px 24px rgba(0,0,0,0.6)" }}>
        {words.join(" ")} <span style={{ color: GOLD }}>{last}</span>
      </span>
    </div>
  );
}

function Beat({ text }: { text: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 13, stiffness: 200 } });
  return (
    <div style={{ position: "absolute", bottom: 300, width: "100%", textAlign: "center" }}>
      <span style={{ display: "inline-block", transform: `translateY(${(1 - s) * 40}px) rotate(-2deg)`, opacity: s, background: "white", color: NAVY, fontFamily: FONT, fontSize: 70, fontWeight: 900, padding: "14px 36px", borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}>
        {text}
      </span>
    </div>
  );
}

function Bug() {
  return (
    <div style={{ position: "absolute", top: 70, left: 0, width: "100%", textAlign: "center" }}>
      <span style={{ fontFamily: FONT, fontSize: 34, fontWeight: 800, color: "white", letterSpacing: 6, background: "rgba(13,23,48,0.75)", padding: "10px 26px", borderRadius: 40, border: `2px solid ${GOLD}` }}>
        LIGHT DMV
      </span>
    </div>
  );
}

function Outro({ phone, site, cta, last }: { phone: string; site: string; cta: string; last?: Shot }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {last?.kind === "photo" ? (
        <Img src={staticFile(last.src)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(18px) brightness(0.45)", transform: "scale(1.15)" }} />
      ) : null}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", fontFamily: FONT, color: "white" }}>
        <div style={{ opacity: s, transform: `scale(${0.85 + 0.15 * s})` }}>
          <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: 8, color: GOLD }}>LIGHT DMV</div>
          <div style={{ fontSize: 92, fontWeight: 900, marginTop: 30, lineHeight: 1.05 }}>{cta}</div>
          <div style={{ display: "inline-block", marginTop: 50, background: RED, borderRadius: 70, padding: "26px 60px", fontSize: 64, fontWeight: 900 }}>{phone}</div>
          <div style={{ fontSize: 50, fontWeight: 600, marginTop: 36, opacity: 0.9 }}>{site}</div>
          <div style={{ fontSize: 36, fontWeight: 500, marginTop: 24, opacity: 0.75 }}>DC · Maryland · Virginia</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const DailyReel = (p: ReelProps) => {
  let at = 0;
  const starts = p.shots.map((s) => { const a = at; at += s.frames; return a; });
  const first = p.shots[0]?.frames ?? 0;
  return (
    <AbsoluteFill style={{ background: "black" }}>
      {p.music ? <Audio src={staticFile(p.music)} volume={(f) => interpolate(f, [at, at + OUTRO], [0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /> : null}
      {p.shots.map((s, i) => (
        <Sequence key={s.src} from={starts[i]} durationInFrames={s.frames}>
          <ShotView shot={s} index={i} />
          {i > 0 && p.beats.length ? <Beat text={p.beats[(i - 1) % p.beats.length]} /> : null}
        </Sequence>
      ))}
      <Sequence durationInFrames={Math.max(first, 75)}><Hook text={p.headline} /></Sequence>
      <Sequence from={first} durationInFrames={at - first}><Bug /></Sequence>
      <Sequence from={at}><Outro phone={p.phone} site={p.site} cta={p.cta} last={p.shots[p.shots.length - 1]} /></Sequence>
    </AbsoluteFill>
  );
};
