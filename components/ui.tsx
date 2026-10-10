import Link from "next/link";
import { useId, type ComponentProps, type ReactNode } from "react";
import type { ClubColors, CrestDesign, CrestPattern, CrestShape } from "@/game/types";

/*
 * Touchline UI kit.
 * Radius scale: controls rounded-md (6px), containers rounded-lg (8px),
 * tags rounded (4px); circles only for dots, swatches and player tokens.
 */

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ───────────── layout ─────────────

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-4xl leading-none md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Card with a header and a body; the most common building block. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "bad" | "neutral";
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface px-3.5 py-3", className)}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular", tone === "good" && "text-win-ink", tone === "bad" && "text-loss-ink")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────── controls ─────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "highlight";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-black/80 font-medium",
  secondary: "bg-surface text-text border border-line-strong hover:border-text/50",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-surface text-loss-ink border border-loss/40 hover:bg-loss/10",
  highlight: "bg-highlight text-text hover:bg-highlight-strong font-medium",
};
const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-md transition whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none select-none";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button type="button" className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-md px-1 py-2 text-left hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className={cn("mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition", checked ? "bg-win" : "bg-surface-3")}>
        <span className={cn("h-4 w-4 rounded-full bg-white shadow transition", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex rounded-md bg-surface-2 p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded font-medium transition disabled:opacity-40",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-xs",
            o.value === value ? "bg-surface text-text shadow-sm ring-1 ring-line" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underlined page tabs (for switching views within a page). */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; count?: number }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative -mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition",
            o.value === value ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className="rounded bg-highlight px-1.5 text-[11px] font-semibold tabular text-text">{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ───────────── labels ─────────────

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

type TagTone = "neutral" | "good" | "bad" | "warn" | "highlight" | "ink";
const TAG_TONES: Record<TagTone, string> = {
  neutral: "bg-surface-2 text-draw-ink",
  good: "bg-win/12 text-win-ink",
  bad: "bg-loss/12 text-loss-ink",
  warn: "bg-warn/15 text-warn-ink",
  highlight: "bg-highlight text-text",
  ink: "bg-accent text-accent-ink",
};

export function Tag({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: TagTone; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4", TAG_TONES[tone], className)}>
      {children}
    </span>
  );
}

// Position groups: keeper ink, defence outlined, midfield pale green, attack grey.
const GK = "bg-accent text-accent-ink";
const DEF = "bg-surface text-text ring-1 ring-line-strong";
const MID = "bg-highlight text-text";
const ATT = "bg-surface-3 text-text";
const POS_COLOR: Record<string, string> = {
  GK,
  CB: DEF,
  LB: DEF,
  RB: DEF,
  DM: MID,
  CM: MID,
  AM: MID,
  LM: MID,
  RM: MID,
  LW: ATT,
  RW: ATT,
  ST: ATT,
};

export function PosBadge({ pos, className }: { pos: string; className?: string }) {
  return <Badge className={cn("w-9 justify-center", POS_COLOR[pos], className)}>{pos}</Badge>;
}

export function ovrColor(ovr: number) {
  if (ovr >= 75) return "text-text";
  if (ovr >= 65) return "text-win-ink";
  if (ovr >= 55) return "text-text";
  if (ovr >= 45) return "text-warn-ink";
  return "text-loss-ink";
}

export function Ovr({ value, className }: { value: number | string; className?: string }) {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return <span className={cn("tabular font-semibold", ovrColor(n), className)}>{value}</span>;
}

/** Overall rating shown as a solid chip (for headers and pitch tokens). */
export function OvrChip({ value, className }: { value: number | string; className?: string }) {
  return <span className={cn("inline-flex min-w-9 items-center justify-center rounded bg-accent px-1.5 py-0.5 text-sm font-semibold tabular text-accent-ink", className)}>{value}</span>;
}

export function Stars({ value, range }: { value: number; range?: [number, number] }) {
  const lo = range ? range[0] : value;
  const hi = range ? range[1] : value;
  const full = Math.floor(lo);
  const half = lo - full >= 0.5;
  const fuzzy = Math.round((hi - lo) * 2) / 2;
  const label = range && hi !== lo ? `${lo}–${hi} stars potential` : `${value} stars potential`;
  return (
    <span className="whitespace-nowrap text-[12px] tracking-tight text-warn" aria-label={label} title={label}>
      {"★".repeat(full)}
      {half ? "½" : ""}
      {fuzzy > 0 && <span className="text-warn/40">{"★".repeat(Math.ceil(fuzzy))}</span>}
      <span className="text-surface-3">{"★".repeat(Math.max(0, 5 - full - (half ? 1 : 0) - Math.ceil(fuzzy)))}</span>
    </span>
  );
}

export function Meter({ value, max = 100, className, label }: { value: number; max?: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = pct > 75 ? "bg-win" : pct > 50 ? "bg-warn" : "bg-loss";
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 1–20 attribute bar with value (or range when not fully scouted). */
export function AttrBar({ value, range }: { value: number; range?: [number, number] }) {
  const [lo, hi] = range ?? [Math.floor(value), Math.floor(value)];
  const color = hi >= 16 ? "bg-win" : hi >= 12 ? "bg-highlight-strong" : hi >= 8 ? "bg-draw" : "bg-loss/70";
  return (
    <div className="relative h-1.5 w-full rounded-full bg-surface-3">
      <div className={cn("absolute inset-y-0 left-0 rounded-full", color)} style={{ width: `${(lo / 20) * 100}%` }} />
      {hi > lo && <div className={cn("absolute inset-y-0 rounded-full opacity-40", color)} style={{ left: `${(lo / 20) * 100}%`, width: `${((hi - lo) / 20) * 100}%` }} />}
    </div>
  );
}

export function attrTextColor(v: number) {
  if (v >= 16) return "text-win-ink";
  if (v >= 12) return "text-text";
  if (v >= 8) return "text-draw-ink";
  return "text-loss-ink";
}

export function ratingChip(r: number) {
  return r >= 8 ? "bg-accent text-accent-ink" : r >= 7 ? "bg-win text-white" : r >= 6 ? "bg-surface-2 text-text" : "bg-loss text-white";
}

// ───────────── crest ─────────────

export const CREST_SHAPES: Record<CrestShape, string> = {
  shield: "M20 2 L37 8 V22 C37 32 29 39 20 42 C11 39 3 32 3 22 V8 Z",
  classic: "M4 3 H36 V24 C36 34 28 40 20 42 C12 40 4 34 4 24 Z",
  round: "M20 3 A19 19 0 1 1 19.99 3 Z",
  diamond: "M20 2 L38 22 L20 42 L2 22 Z",
};

function CrestPatternFill({ pattern, color }: { pattern: CrestPattern; color: string }) {
  switch (pattern) {
    case "stripes":
      return (
        <g fill={color}>
          {[5, 15, 25, 35].map((x) => (
            <rect key={x} x={x} y="0" width="5" height="44" />
          ))}
        </g>
      );
    case "halves":
      return <rect x="20" y="0" width="20" height="44" fill={color} />;
    case "hoops":
      return (
        <g fill={color}>
          {[8, 18, 28, 38].map((y) => (
            <rect key={y} x="0" y={y} width="40" height="5" />
          ))}
        </g>
      );
    case "sash":
      return <polygon points="0,10 10,0 40,34 40,44 30,44" fill={color} />;
    case "chevron":
      return <polyline points="2,12 20,28 38,12" fill="none" stroke={color} strokeWidth="7" />;
    default:
      return <rect x="0" y="0" width="40" height="15" fill={color} opacity="0.85" />;
  }
}

export function Crest({ colors, label, size = 36, design }: { colors: ClubColors; label: string; size?: number; design?: CrestDesign }) {
  const id = useId();
  const shape = CREST_SHAPES[design?.shape ?? "shield"];
  return (
    <svg width={size} height={size} viewBox="0 0 40 44" aria-hidden className="shrink-0">
      <defs>
        <clipPath id={`crest-${id}`}>
          <path d={shape} />
        </clipPath>
      </defs>
      <path d={shape} fill={colors.primary} />
      <g clipPath={`url(#crest-${id})`}>
        <CrestPatternFill pattern={design?.pattern ?? "plain"} color={colors.secondary} />
      </g>
      <path d={shape} fill="none" stroke={colors.secondary} strokeWidth="2.5" />
      <text x="20" y="30" textAnchor="middle" fontSize="10" fontWeight="800" fill={colors.secondary} stroke={colors.primary} strokeWidth="2.2" paintOrder="stroke" fontFamily="system-ui, sans-serif">
        {label.slice(0, 3)}
      </text>
    </svg>
  );
}

/** Crest + name, linking nowhere; used in lists and tables. */
export function ClubName({
  club,
  size = 18,
  className,
  bold,
}: {
  club: { name: string; shortName: string; colors: ClubColors; crest?: CrestDesign };
  size?: number;
  className?: string;
  bold?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Crest design={club.crest} colors={club.colors} label={club.shortName} size={size} />
      <span className={cn("truncate", bold && "font-semibold")}>{club.name}</span>
    </span>
  );
}

export function FormPills({ form }: { form: ("W" | "D" | "L")[] }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Form: ${form.join(" ")}`}>
      {form.map((r, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white",
            r === "W" ? "bg-win" : r === "D" ? "bg-draw-ink" : "bg-loss",
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

// ───────────── states ─────────────

export function Empty({ children, title, action }: { children?: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {title && <div className="font-display text-2xl">{title}</div>}
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-[18px] w-[18px] shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Icon paths used across the app (24×24, stroke). */
export const ICONS = {
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  inbox: "M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  squad: "M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0",
  tactics: "M4 4h16v16H4zM12 4v16M4 12h4M16 12h4",
  training: "M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12",
  league: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4",
  cup: "M6 3h12v4a6 6 0 0 1-12 0zM9 21h6M12 13v8",
  fixtures: "M4 6h16M4 12h16M4 18h10",
  transfers: "M4 8h13l-3-3M20 16H7l3 3",
  scouting: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  finances: "M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  staff: "M9 7a3 3 0 1 0 0 .01M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.6",
  manager: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  editor: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  play: "M7 4v16l13-8z",
  check: "M5 12l5 5L20 7",
  close: "M6 6l12 12M18 6 6 18",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  alert: "M12 8v5M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  whistle: "M3 10h9a5 5 0 1 1-5 5M14 7l4-3",
  news: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5",
} as const;
