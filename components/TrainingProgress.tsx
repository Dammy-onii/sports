import { currentAbility, overall } from "@/game/ratings";
import { trainingProgress } from "@/game/progress";
import type { Player } from "@/game/types";

/** Actual ability progress; never exposes the player's hidden potential ceiling. */
export function TrainingProgress({ player }: { player: Player }) {
  const ovr = overall(player);
  const progress = trainingProgress(currentAbility(player), ovr);
  const percent = progress.complete ? 100 : Math.min(99, Math.floor(progress.percent));
  return (
    <div className="min-w-32">
      <div className="mb-1 flex justify-between gap-2 text-[11px] text-muted tabular">
        <span>{progress.complete ? "Maximum OVR" : `Toward ${ovr + 1} OVR`}</span>
        <span>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${player.lastName}: progress toward next overall rating`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-win transition-[width]" style={{ width: `${progress.percent}%` }} />
      </div>
      {player.injuryWeeks > 0 && <p className="mt-1 text-[10px] text-loss-ink">Training paused · injured</p>}
    </div>
  );
}
