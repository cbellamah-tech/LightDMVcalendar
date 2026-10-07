import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/* A 9:16 reel for Facebook, Instagram, Google and LinkedIn: title card, each job photo with a slow zoom
   and crossfade, then a call to action with the phone number. */

export const FPS = 30;
const INTRO = 45;      // 1.5 s
const PER_PHOTO = 75;  // 2.5 s
const FADE = 12;
const OUTRO = 75;      // 2.5 s

export type ReelProps = {
  headline: string;
  photos: string[];     // file names inside public/, e.g. "today/1.jpg"
  towns: string[];      // optional label per photo ("Potomac, MD")
  phone: string;
  site: string;
  cta: string;
};

export const reelFrames = (n: number) => INTRO + Math.max(1, n) * PER_PHOTO + OUTRO;

const NAVY = "#112E5B";
const RED = "#F10800";
const WARM = "#FFD27A";

function Glow() {
  const f = useCurrentFrame();
  // A row of soft bulbs along the top edge, twinkling.
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 14 }, (_, i) => {
        const o = 0.55 + 0.45 * Math.sin((f + i * 11) / 6);
        return (
          <div key={i} style={{
            position: "absolute", top: 36, left: 40 + i * 74, width: 26, height: 26, borderRadius: 13,
            background: i % 3 === 0 ? RED : WARM, opacity: o, boxShadow: `0 0 ${18 + 14 * o}px ${i % 3 === 0 ? RED : WARM}`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
}

function Intro({ headline }: { headline: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #1d4a8f, ${NAVY} 70%)`, justifyContent: "center", alignItems: "center" }}>
      <Glow />
      <div style={{ transform: `scale(${0.8 + 0.2 * s})`, opacity: s, textAlign: "center", color: "white", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ fontSize: 120, fontWeight: 900, letterSpacing: -2 }}>Light DMV</div>
        <div style={{ fontSize: 58, fontWeight: 600, marginTop: 24, color: WARM }}>{headline}</div>
      </div>
    </AbsoluteFill>
  );
}

function Photo({ src, town, last }: { src: string; town?: string; last: boolean }) {
  const f = useCurrentFrame();
  const len = PER_PHOTO + FADE;
  const zoom = interpolate(f, [0, len], [1.05, 1.18]);
  const fadeIn = interpolate(f, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = last ? 1 : interpolate(f, [len - FADE, len], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), background: "black" }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.6) 100%)" }} />
      {town ? (
        <div style={{ position: "absolute", bottom: 170, left: 60, color: "white", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 54, fontWeight: 700, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
          {town}
        </div>
      ) : null}
      <div style={{ position: "absolute", bottom: 90, left: 60, color: WARM, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 38, fontWeight: 600 }}>Light DMV</div>
    </AbsoluteFill>
  );
}

function Outro({ phone, site, cta }: { phone: string; site: string; cta: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: NAVY, justifyContent: "center", alignItems: "center", fontFamily: "Helvetica, Arial, sans-serif", color: "white", textAlign: "center" }}>
      <Glow />
      <div style={{ opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
        <div style={{ fontSize: 76, fontWeight: 800 }}>{cta}</div>
        <div style={{ fontSize: 96, fontWeight: 900, color: WARM, marginTop: 40 }}>{phone}</div>
        <div style={{ fontSize: 52, marginTop: 30, opacity: 0.9 }}>{site}</div>
        <div style={{ display: "inline-block", marginTop: 60, background: RED, borderRadius: 60, padding: "22px 54px", fontSize: 44, fontWeight: 800 }}>
          Christmas lights, installed and taken down
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const DailyReel = (p: ReelProps) => {
  const n = p.photos.length;
  return (
    <AbsoluteFill style={{ background: "black" }}>
      <Sequence durationInFrames={INTRO + FADE}><Intro headline={p.headline} /></Sequence>
      {p.photos.map((src, i) => (
        <Sequence key={src} from={INTRO + i * PER_PHOTO} durationInFrames={PER_PHOTO + FADE}>
          <Photo src={src} town={p.towns[i]} last={i === n - 1} />
        </Sequence>
      ))}
      <Sequence from={INTRO + Math.max(1, n) * PER_PHOTO}><Outro phone={p.phone} site={p.site} cta={p.cta} /></Sequence>
    </AbsoluteFill>
  );
};
