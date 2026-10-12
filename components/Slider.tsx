"use client";

import { useId, type CSSProperties } from "react";

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  valueText?: string;
  low?: string;
  high?: string;
  hint?: string;
  disabled?: boolean;
  ticks?: boolean;
}

/** A native, keyboard-accessible range with a filled track and precise step controls. */
export function Slider({ label, value, onChange, min, max, step = 1, valueText, low, high, hint, disabled, ticks = false }: SliderProps) {
  const id = useId();
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  const unavailable = disabled || max <= min;
  const change = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor={id} className="font-medium">{label}</label>
        <output htmlFor={id} className="rounded-md bg-highlight px-2 py-0.5 text-xs font-semibold tabular">{valueText ?? value}</output>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="slider-step" aria-label={`Decrease ${label.toLowerCase()}`} disabled={unavailable || value <= min} onClick={() => change(value - step)}>−</button>
        <div className="min-w-0 flex-1">
          <input
            id={id}
            type="range"
            className="slider w-full"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={unavailable}
            aria-valuetext={valueText}
            aria-describedby={hint ? `${id}-hint` : undefined}
            onChange={(e) => change(Number(e.target.value))}
            style={{ "--slider-fill": `${pct}%` } as CSSProperties}
          />
          {ticks && max - min <= 10 && (
            <div className="flex justify-between px-1 text-[10px] text-muted tabular" aria-hidden="true">
              {Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => <span key={i}>{min + i * step}</span>)}
            </div>
          )}
        </div>
        <button type="button" className="slider-step" aria-label={`Increase ${label.toLowerCase()}`} disabled={unavailable || value >= max} onClick={() => change(value + step)}>+</button>
      </div>
      {(low || high) && <div className="flex justify-between px-11 text-[11px] text-muted"><span>{low}</span><span>{high}</span></div>}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
