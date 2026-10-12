import type { SaveGame } from "@/game/save";

/** Career time, not a wall-clock countdown: training is resolved once per advance. */
export function TrainingTiming({ save }: { save: SaveGame }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2 font-semibold">
        <span>Player development · 1 career week</span>
        <span>Next update · end of Week {save.calendarIndex + 1}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Complete this week&apos;s matchday or advance the week to receive attribute gains and the training report. Player development, position learning and mentoring update weekly; the separate match-preparation drill uses its countdown. Injuries pause individual development.</p>
    </div>
  );
}
