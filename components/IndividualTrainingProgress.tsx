import { ATTRIBUTE_LABELS, TRAINING_FOCUS } from "@/game/constants";
import { individualTrainingProgress } from "@/game/progress";
import type { Player } from "@/game/types";
import { Meter } from "./ui";

export function IndividualTrainingProgress({ player, start, compact = false }: { player: Player; start?: Player["attributes"]; compact?: boolean }) {
  const progress = individualTrainingProgress(player);
  if (!progress) return <p className="mt-3 text-xs text-muted">No individual focus assigned. Choose a focus to see its progress; the team plan still trains this player.</p>;
  const percent = Math.floor(progress.percent);
  if (compact) return <div className="mt-2 min-w-40"><div className="mb-1 flex justify-between gap-2 text-[11px] text-muted"><span>Focus level {progress.level.toFixed(2)} → {progress.target}</span><span>{percent}%</span></div><Meter value={progress.percent} label={`${player.lastName}: individual training focus progress`} /></div>;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex justify-between gap-2 text-xs font-semibold"><span>{TRAINING_FOCUS[player.focus!].label} · toward focus level {progress.target}</span><span className="tabular">{percent}%</span></div>
      <Meter value={progress.percent} label={`${player.lastName}: individual training focus progress`} />
      <p className="text-xs text-muted">Average trained attribute: <strong>{progress.level.toFixed(2)} / 20</strong>. The bar measures the decimal part of this average toward its next whole point; it updates with weekly development.</p>
      <div className="flex flex-col gap-1 text-xs">
        {progress.keys.map((key) => {
          const gain = start ? player.attributes[key] - start[key] : undefined;
          return <div key={key} className="flex justify-between gap-2"><span>{ATTRIBUTE_LABELS[key]}</span><span className="tabular">{player.attributes[key].toFixed(2)} / 20{gain !== undefined && <span className="ml-2 text-muted">({gain >= 0 ? "+" : ""}{gain.toFixed(2)} this season)</span>}</span></div>;
        })}
      </div>
      {player.injuryWeeks > 0 && <p className="text-xs text-loss-ink">Paused while injured · {player.injuryWeeks} recovery weeks remaining.</p>}
    </div>
  );
}
