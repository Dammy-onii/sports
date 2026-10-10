"use client";

import type { ClubColors, CrestDesign, CrestPattern, CrestShape } from "@/game/types";
import { CREST_SHAPES, Crest, cn } from "./ui";

// Club colours are the club's identity on the pitch, so the full palette is offered (greys first).
export const SWATCHES = [
  "#f5f5f5", "#a3a3a3", "#404040", "#0a0a0a", "#d62828", "#1d4ed8", "#16a34a", "#f59e0b", "#7c3aed",
  "#0f172a", "#0891b2", "#be185d", "#ea580c", "#facc15", "#065f46", "#7f1d1d", "#1e3a8a",
];

const SHAPES = Object.keys(CREST_SHAPES) as CrestShape[];
const PATTERNS: CrestPattern[] = ["plain", "stripes", "halves", "hoops", "sash", "chevron"];

export function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div>
      <div className="mb-2 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn("h-8 w-8 rounded-full border-2 transition", value === c ? "scale-110 border-accent" : "border-line")}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

/** Colours + crest shape/pattern, with a live preview. */
export function CrestBuilder({
  colors,
  design,
  label,
  onColors,
  onDesign,
}: {
  colors: ClubColors;
  design: CrestDesign;
  label: string;
  onColors: (c: ClubColors) => void;
  onDesign: (d: CrestDesign) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Swatches label="Primary colour" value={colors.primary} onChange={(primary) => onColors({ ...colors, primary })} />
      <Swatches label="Secondary colour" value={colors.secondary} onChange={(secondary) => onColors({ ...colors, secondary })} />
      <div>
        <div className="mb-2 text-xs text-muted">Crest shape</div>
        <div className="flex flex-wrap gap-2">
          {SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              aria-label={shape}
              onClick={() => onDesign({ ...design, shape })}
              className={cn("rounded-md border p-1.5", design.shape === shape ? "border-accent bg-highlight" : "border-line")}
            >
              <Crest colors={colors} label={label} size={36} design={{ ...design, shape }} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs text-muted">Pattern</div>
        <div className="flex flex-wrap gap-2">
          {PATTERNS.map((pattern) => (
            <button
              key={pattern}
              type="button"
              aria-label={pattern}
              onClick={() => onDesign({ ...design, pattern })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] capitalize text-muted",
                design.pattern === pattern ? "border-accent bg-highlight text-text" : "border-line",
              )}
            >
              <Crest colors={colors} label={label} size={36} design={{ ...design, pattern }} />
              {pattern}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
