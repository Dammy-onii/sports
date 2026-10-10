"use client";

import { INSTRUCTION_LABELS } from "@/game/constants";
import { familiarityLabel, INSTRUCTION_KEYS, type FamiliarityBreakdown } from "@/game/familiarity";
import type { PlayerInstructions, Position } from "@/game/types";
import { Meter, cn } from "./ui";

/** Overall familiarity with a breakdown by formation, each instruction and roles. */
export function FamiliarityCard({ fam, formation, compact }: { fam: FamiliarityBreakdown; formation: string; compact?: boolean }) {
  const pct = (v: number) => Math.round(v * 100);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-medium">{familiarityLabel(fam.overall)}</span>
          <span className="tabular text-muted">{pct(fam.overall)}%</span>
        </div>
        <Meter value={fam.overall * 100} label="Tactical familiarity" />
      </div>
      {!compact && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted">Formation ({formation})</dt>
          <dd className={cn("tabular", fam.formation < 0.6 && "text-loss-ink")}>{pct(fam.formation)}%</dd>
          {INSTRUCTION_KEYS.map((k) => (
            <FamRow key={k} label={INSTRUCTION_LABELS[k].label} v={fam.instructions[k]} />
          ))}
          <dt className="text-muted">Player roles (XI average)</dt>
          <dd className={cn("tabular", fam.roles < 0.6 && "text-loss-ink")}>{pct(fam.roles)}%</dd>
        </dl>
      )}
      {!compact && (
        <p className="text-[11px] text-muted">
          Familiarity grows with matches and tactical training, and fades for anything you stop using. Low familiarity means slower reads, a looser shape, a less coordinated press and a leakier offside trap.
        </p>
      )}
    </div>
  );
}

function FamRow({ label, v }: { label: string; v: number }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", v < 0.6 && "text-loss-ink")}>{Math.round(v * 100)}%</dd>
    </>
  );
}

type Group = "GK" | "DEF" | "FB" | "MID" | "ATT";
const GROUP: Record<Position, Group> = { GK: "GK", CB: "DEF", LB: "FB", RB: "FB", DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID", LW: "ATT", RW: "ATT", ST: "ATT" };

type Choice = { key: keyof PlayerInstructions; label: string; options: [string, string][]; groups: Group[] };

const CHOICES: Choice[] = [
  { key: "shooting", label: "Shooting", options: [["less", "Less"], ["more", "More"]], groups: ["MID", "ATT", "FB"] },
  { key: "dribbling", label: "Dribbling", options: [["less", "Less"], ["more", "More"]], groups: ["DEF", "FB", "MID", "ATT"] },
  { key: "passing", label: "Passing", options: [["shorter", "Shorter"], ["direct", "Direct"]], groups: ["GK", "DEF", "FB", "MID", "ATT"] },
  { key: "crossing", label: "Crossing", options: [["less", "Less"], ["more", "More"]], groups: ["FB", "MID", "ATT"] },
  { key: "runs", label: "Forward runs", options: [["hold", "Hold"], ["forward", "Get forward"]], groups: ["FB", "MID", "ATT"] },
  { key: "width", label: "Width", options: [["narrow", "Narrower"], ["wide", "Wider"]], groups: ["FB", "MID", "ATT"] },
  { key: "pressing", label: "Closing down", options: [["less", "Less"], ["more", "More"]], groups: ["DEF", "FB", "MID", "ATT"] },
  { key: "tackling", label: "Tackling", options: [["soft", "Ease off"], ["hard", "Harder"]], groups: ["DEF", "FB", "MID", "ATT"] },
];

/** Individual instructions for one position (FM-style). */
export function PlayerInstructionsEditor({ pos, value, onChange, dense }: { pos: Position; value?: PlayerInstructions; onChange: (pi: PlayerInstructions | undefined) => void; dense?: boolean }) {
  const g = GROUP[pos];
  const pi = value ?? {};
  const set = (patch: Partial<PlayerInstructions>) => {
    const next = { ...pi, ...patch };
    for (const k of Object.keys(next) as (keyof PlayerInstructions)[]) if (next[k] === undefined || next[k] === false) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const count = Object.keys(pi).length;
  return (
    <div className={cn("flex flex-col", dense ? "gap-1.5" : "gap-2")}>
      {CHOICES.filter((c) => c.groups.includes(g)).map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{c.label}</span>
          <span className="inline-flex overflow-hidden rounded-md border border-line">
            {c.options.map(([v, label]) => {
              const on = pi[c.key] === v;
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => set({ [c.key]: on ? undefined : v } as Partial<PlayerInstructions>)} className={cn("px-2 py-1", on ? "bg-highlight font-medium text-text" : "text-muted hover:text-text")}>
                  {label}
                </button>
              );
            })}
          </span>
        </div>
      ))}
      {g !== "GK" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(
            [
              ["markTight", "Mark tighter"],
              ["roam", "Roam from position"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={!!pi[k]} onClick={() => set({ [k]: !pi[k] || undefined })} className={cn("rounded-md border px-2 py-1 text-xs", pi[k] ? "border-text bg-highlight font-medium" : "border-line text-muted hover:border-text")}>
              {label}
            </button>
          ))}
          {count > 0 && (
            <button type="button" onClick={() => onChange(undefined)} className="ml-auto text-xs text-muted underline-offset-2 hover:underline">
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Short summary of a slot's instructions, e.g. "Shoot more · Hold position". */
export function piSummary(pi?: PlayerInstructions): string {
  if (!pi) return "";
  const out: string[] = [];
  for (const c of CHOICES) {
    const v = pi[c.key];
    if (typeof v === "string") out.push(`${c.label}: ${c.options.find((o) => o[0] === v)?.[1]}`);
  }
  if (pi.markTight) out.push("Mark tighter");
  if (pi.roam) out.push("Roam");
  return out.join(" · ");
}
