/** A strand of holiday bulbs drawn along the top of a banner. Decoration only. */
const COLORS = ["#F5A524", "#F10800", "#34D399", "#60A5FA", "#FDE68A"];

export default function Lights({ count = 18, className = "" }: { count?: number; className?: string }) {
  const w = 600;
  const step = w / count;
  const y = (x: number) => 10 + 8 * Math.sin((x / w) * Math.PI * 3);
  const path = Array.from({ length: 61 }, (_, i) => { const x = (i / 60) * w; return `${i ? "L" : "M"}${x.toFixed(1)},${y(x).toFixed(1)}`; }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} 40`} preserveAspectRatio="none" className={`pointer-events-none ${className}`} aria-hidden>
      <path d={path} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.2" />
      {Array.from({ length: count }, (_, i) => {
        const x = step / 2 + i * step;
        const c = COLORS[i % COLORS.length];
        return (
          <g key={i} transform={`translate(${x.toFixed(1)},${(y(x) + 2).toFixed(1)})`}>
            <circle r="7" fill={c} opacity=".25" />
            <rect x="-1.6" y="-2" width="3.2" height="3" rx=".6" fill="rgba(255,255,255,.45)" />
            <ellipse cy="5" rx="3" ry="4.4" fill={c} />
          </g>
        );
      })}
    </svg>
  );
}
