"use client";

import { useEffect, useState } from "react";
import { MATCH_PREP_SECONDS, prepSessionProgress } from "@/game/training-session";
import type { SaveGame } from "@/game/save";

export function useTrainingClock() {
  // Cache Components prerenders this hook: read wall time only after mounting.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MatchTrainingTimer({ save, now }: { save: SaveGame; now: number }) {
  const progress = prepSessionProgress(save.training, save.calendarIndex, now, save.leagues[0].season);
  const assigned = save.training.matchPrep && save.training.matchPrep !== "none";
  const expired = save.training.matchPrepSession && (save.training.matchPrepSession.week !== save.calendarIndex || save.training.matchPrepSession.season !== save.leagues[0].season);
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2 flex justify-between gap-3 text-sm font-semibold tabular">
        <span>Match-training drill · {MATCH_PREP_SECONDS} seconds</span>
        <span>{!assigned ? "Not assigned" : expired ? "Awaiting start" : progress.ready ? "Ready · 100%" : `${progress.remaining}s left · ${Math.floor(progress.percent)}%`}</span>
      </div>
      <div role="progressbar" aria-label="Timed match-training session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress.percent)} aria-valuetext={`${Math.floor(progress.percent)}% complete, ${progress.remaining} seconds remaining`} className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-win transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">{!assigned || expired ? "Select a plan below to start this week's drill." : progress.ready ? "Drill complete. Its match bonuses are available for your next kickoff." : "Drill in progress. Match bonuses become available when the countdown reaches zero. Your countdown is saved and continues while you're away."} Attribute gains still arrive at the weekly update. Changing plans starts a new drill.</p>
    </div>
  );
}
