import { useId } from "react";
import { HEAT_COLS, HEAT_ROWS } from "@/game/engine/types";
import type { Position } from "@/game/types";
import { cn } from "./ui";

/*
 * Small SVG charts. No chart library: these are bespoke, light, and work
 * offline. Colours come from the theme tokens.
 */

// ───────────── radar ─────────────

export interface RadarSeries {
  label: string;
  values: number[]; // 0–20
  color: string;
}

export function Radar({ axes, series, size = 220 }: { axes: string[]; series: RadarSeries[]; size?: number }) {
  const c = size / 2;
  const r = size / 2 - 34;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rr = (Math.max(0, Math.min(20, v)) / 20) * r;
    return [c + Math.cos(a) * rr, c + Math.sin(a) * rr] as const;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[260px]" role="img" aria-label={`Attribute radar: ${series.map((s) => s.label).join(" vs ")}`}>
      {[5, 10, 15, 20].map((ring) => (
        <polygon key={ring} points={axes.map((_, i) => pt(i, ring).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 20);
        const [lx, ly] = pt(i, 24.5);
        return (
          <g key={a}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="var(--muted)">
              {a}
            </text>
          </g>
        );
      })}
      {series.map((s) => (
        <polygon
          key={s.label}
          points={s.values.map((v, i) => pt(i, v).join(",")).join(" ")}
          fill={s.color}
          fillOpacity="0.22"
          stroke={s.color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

// ───────────── sparkline ─────────────

export function Sparkline({ values, width = 120, height = 32, min, max, className }: { values: number[]; width?: number; height?: number; min?: number; max?: number; className?: string }) {
  if (values.length < 2) return <div className={cn("text-xs text-muted", className)}>Not enough data yet</div>;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - lo) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={`Trend from ${values[0].toFixed(1)} to ${last.toFixed(1)}`}>
      <path d={d} fill="none" stroke="var(--win)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="2.5" fill="var(--win)" />
    </svg>
  );
}

// ───────────── pitch base ─────────────

/** Horizontal pitch outline (105×68), attacking right. */
export function PitchMarks() {
  return (
    <g fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.5">
      <rect x="0.5" y="0.5" width="104" height="67" />
      <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
      <circle cx="52.5" cy="34" r="9.15" />
      <rect x="0.5" y="13.84" width="16.5" height="40.32" />
      <rect x="88" y="13.84" width="16.5" height="40.32" />
      <rect x="0.5" y="24.84" width="5.5" height="18.32" />
      <rect x="99" y="24.84" width="5.5" height="18.32" />
    </g>
  );
}

export function PitchSvg({ children, label }: { children: React.ReactNode; label: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 105 68" className="h-auto w-full rounded-md" role="img" aria-label={label}>
      <defs>
        <pattern id={`stripes-${id}`} width="15" height="68" patternUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="var(--pitch-a)" />
          <rect x="7.5" width="7.5" height="68" fill="var(--pitch-b)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#stripes-${id})`} />
      {children}
    </svg>
  );
}

// ───────────── heatmap ─────────────

/** Normalised (0–1) 12×8 heat grid, team-relative attacking right. */
export function Heatmap({ heat, label = "Heatmap" }: { heat: number[]; label?: string }) {
  const cw = 105 / HEAT_COLS;
  const ch = 68 / HEAT_ROWS;
  return (
    <PitchSvg label={label}>
      {heat.map((v, i) => {
        if (v <= 0.05) return null;
        const col = i % HEAT_COLS;
        const row = Math.floor(i / HEAT_COLS);
        return <rect key={i} x={col * cw} y={row * ch} width={cw} height={ch} fill="#d9482b" fillOpacity={Math.min(0.75, v * 0.8)} rx="2" />;
      })}
      <PitchMarks />
    </PitchSvg>
  );
}

// ───────────── pass network ─────────────

export function PassNetwork({
  nodes,
  links,
}: {
  nodes: { id: string; label: string; x: number; y: number; size: number }[];
  links: [string, string, number][];
}) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const max = Math.max(1, ...links.map((l) => l[2]));
  return (
    <PitchSvg label="Pass network: lines show the most common passing links, nodes average positions">
      <PitchMarks />
      {links
        .filter(([, , n]) => n >= Math.max(2, max * 0.18))
        .map(([a, b, n]) => {
          const p = pos.get(a);
          const q = pos.get(b);
          if (!p || !q) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={p.x * 105}
              y1={p.y * 68}
              x2={q.x * 105}
              y2={q.y * 68}
              stroke="#141414"
              strokeOpacity={0.25 + (n / max) * 0.5}
              strokeWidth={0.4 + (n / max) * 2}
              strokeLinecap="round"
            />
          );
        })}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x * 105} cy={n.y * 68} r={2.2 + n.size * 2.2} fill="#141414" stroke="#fff" strokeWidth="0.5" />
          <text x={n.x * 105} y={n.y * 68 + 0.9} textAnchor="middle" fontSize="2.6" fontWeight="700" fill="#fff">
            {n.label}
          </text>
        </g>
      ))}
    </PitchSvg>
  );
}

// ───────────── position suitability ─────────────

const POS_SPOTS: Record<Position, [number, number]> = {
  GK: [6, 34],
  CB: [20, 34],
  LB: [24, 9],
  RB: [24, 59],
  DM: [36, 34],
  CM: [50, 34],
  AM: [66, 34],
  LM: [52, 10],
  RM: [52, 58],
  LW: [76, 11],
  RW: [76, 57],
  ST: [86, 34],
};

/** Each position shaded by how good the player is there (0–99 rating). */
export function PositionMap({ ratings, natural }: { ratings: Record<Position, number>; natural: Position[] }) {
  const max = Math.max(...Object.values(ratings));
  return (
    <PitchSvg label="Position suitability: darker means better">
      <PitchMarks />
      {(Object.keys(POS_SPOTS) as Position[]).map((p) => {
        const [x, y] = POS_SPOTS[p];
        const r = ratings[p];
        const strength = Math.max(0, (r - (max - 25)) / 25); // relative to his best
        const isNatural = natural.includes(p);
        return (
          <g key={p}>
            <rect
              x={x - 6.5}
              y={y - 4.5}
              width="13"
              height="9"
              rx="1.5"
              fill={strength > 0.85 ? "#141414" : strength > 0.55 ? "#2f8f57" : strength > 0.25 ? "#a6e0b8" : "rgba(255,255,255,0.75)"}
              stroke={isNatural ? "#141414" : "none"}
              strokeWidth="0.6"
            />
            <text x={x} y={y - 0.6} textAnchor="middle" fontSize="2.8" fontWeight="700" fill={strength > 0.55 ? "#fff" : "#141414"}>
              {p}
            </text>
            <text x={x} y={y + 3} textAnchor="middle" fontSize="2.6" fill={strength > 0.55 ? "#fff" : "#141414"}>
              {r}
            </text>
          </g>
        );
      })}
    </PitchSvg>
  );
}

// ───────────── xG timeline ─────────────

export function XgTimeline({ home, away, homeColor, awayColor, goals }: { home: number[]; away: number[]; homeColor: string; awayColor: string; goals: { minute: number; side: 0 | 1 }[] }) {
  const w = 300;
  const h = 120;
  const mins = Math.max(home.length, away.length) - 1;
  const max = Math.max(1, home[home.length - 1] ?? 0, away[away.length - 1] ?? 0) * 1.15;
  const x = (m: number) => 24 + (m / mins) * (w - 30);
  const y = (v: number) => h - 18 - (v / max) * (h - 28);
  const step = (arr: number[]) => arr.map((v, m) => `${m ? "H" + x(m).toFixed(1) + " V" : "M" + x(0) + ","}${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={`Expected goals over time: ${(home.at(-1) ?? 0).toFixed(2)} to ${(away.at(-1) ?? 0).toFixed(2)}`}>
      {[0, max / 2, max].map((v, i) => (
        <g key={i}>
          <line x1="24" x2={w - 6} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x="20" y={y(v) + 3} textAnchor="end" fontSize="8" fill="var(--muted)">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      {[0, 45, 90].map((m) => (
        <text key={m} x={x(Math.min(m, mins))} y={h - 4} textAnchor="middle" fontSize="8" fill="var(--muted)">
          {m}′
        </text>
      ))}
      <path d={step(home)} fill="none" stroke={homeColor} strokeWidth="2" />
      <path d={step(away)} fill="none" stroke={awayColor} strokeWidth="2" />
      {goals.map((g, i) => {
        const arr = g.side === 0 ? home : away;
        return <circle key={i} cx={x(g.minute)} cy={y(arr[Math.min(g.minute, arr.length - 1)] ?? 0)} r="3.5" fill={g.side === 0 ? homeColor : awayColor} stroke="#fff" strokeWidth="1" />;
      })}
    </svg>
  );
}

// ───────────── momentum ─────────────

/** Bars above the line favour home, below favour away (5-minute buckets). */
export function Momentum({ values, homeColor, awayColor, current, height = 44 }: { values: number[]; homeColor: string; awayColor: string; current?: number; height?: number }) {
  const buckets: number[] = [];
  const len = Math.max(90, values.length);
  for (let i = 0; i < len; i += 5) buckets.push(values.slice(i, i + 5).reduce((a, b) => a + (b ?? 0), 0));
  const max = Math.max(0.5, ...buckets.map(Math.abs));
  const w = 300;
  const bw = w / buckets.length;
  const mid = height / 2;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Momentum: bars above the line show home pressure, below away pressure">
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--line-strong)" />
      {buckets.map((v, i) => {
        const hgt = (Math.abs(v) / max) * (mid - 2);
        return <rect key={i} x={i * bw + 0.5} width={bw - 1} y={v >= 0 ? mid - hgt : mid} height={hgt} fill={v >= 0 ? homeColor : awayColor} rx="0.8" />;
      })}
      {current !== undefined && <line x1={(current / len) * w} x2={(current / len) * w} y1="0" y2={height} stroke="var(--text)" strokeDasharray="2 2" />}
    </svg>
  );
}

// ───────────── finance bars ─────────────

export function BarChart({ data, height = 120, formatter = (v: number) => String(v) }: { data: { label: string; value: number }[]; height?: number; formatter?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasPos = data.some((d) => d.value > 0);
  const hasNeg = data.some((d) => d.value < 0);
  const w = 300;
  const labelH = 12;
  const slot = w / Math.max(8, data.length);
  const bw = Math.min(slot - 4, 22);
  const plot = height - labelH - 4;
  // put the zero line where it leaves room for whichever signs are present
  const zero = hasPos && hasNeg ? plot / 2 + 2 : hasNeg ? 4 : plot;
  const scale = (hasPos && hasNeg ? plot / 2 - 4 : plot - 6) / max;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${formatter(d.value)}`).join(", ")}`}>
      <line x1="0" x2={w} y1={zero} y2={zero} stroke="var(--line-strong)" />
      {data.map((d, i) => {
        const hgt = Math.abs(d.value) * scale;
        const x = i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            <title>{`${d.label}: ${formatter(d.value)}`}</title>
            <rect x={x} width={bw} y={d.value >= 0 ? zero - hgt : zero} height={Math.max(1, hgt)} fill={d.value >= 0 ? "var(--win)" : "var(--loss)"} rx="1.5" />
            <text x={x + bw / 2} y={height - 2} textAnchor="middle" fontSize="8" fill="var(--muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ───────────── shot map ─────────────

/**
 * Shots on a full pitch: ours attack right, theirs attack left. Dot size is
 * xG; filled dots are goals.
 */
export function ShotMap({ shots, label = "Shot map" }: { shots: [number, number, number, 0 | 1, 0 | 1][]; label?: string }) {
  return (
    <PitchSvg label={label}>
      <PitchMarks />
      {shots.map(([x, y, xg, goal, ours], i) => {
        // team-relative to the shooter: flip theirs so they attack our goal (left)
        const px = ours ? x * 105 : (1 - x) * 105;
        const py = ours ? y * 68 : (1 - y) * 68;
        const r = 0.8 + Math.sqrt(xg) * 3.2;
        const color = ours ? "#2f8f57" : "#c2410c";
        return <circle key={i} cx={px} cy={py} r={r} fill={goal ? color : "none"} stroke={color} strokeWidth={goal ? 0.4 : 0.6} fillOpacity={0.85} />;
      })}
    </PitchSvg>
  );
}

/** Paired bars per label (for / against). */
export function PairBars({ data, height = 110, aLabel, bLabel }: { data: { label: string; a: number; b: number }[]; height?: number; aLabel: string; bLabel: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const w = 300;
  const slot = w / data.length;
  const bw = Math.min(14, slot / 2.6);
  const plot = height - 14;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label={`${aLabel} and ${bLabel}: ${data.map((d) => `${d.label} ${d.a}/${d.b}`).join(", ")}`}>
      <line x1="0" x2={w} y1={plot} y2={plot} stroke="var(--line-strong)" />
      {data.map((d, i) => {
        const x = i * slot + slot / 2;
        const ha = (d.a / max) * (plot - 4);
        const hb = (d.b / max) * (plot - 4);
        return (
          <g key={i}>
            <rect x={x - bw - 1} y={plot - ha} width={bw} height={Math.max(0.5, ha)} fill="var(--win)" rx="1" />
            <rect x={x + 1} y={plot - hb} width={bw} height={Math.max(0.5, hb)} fill="var(--loss)" rx="1" />
            <text x={x} y={height - 2} textAnchor="middle" fontSize="8" fill="var(--muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
