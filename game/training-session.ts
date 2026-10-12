import type { SaveGame } from "./save";
import type { MatchPrepFocus, TrainingPlan } from "./types";

export const MATCH_PREP_SECONDS = 60;

export function prepSessionProgress(plan: TrainingPlan, week: number, now: number, season = 1) {
  const focus = plan.matchPrep ?? "none";
  const session = plan.matchPrepSession;
  if (focus === "none") return { percent: 0, remaining: 0, ready: false };
  // Existing plans were already prepared before timed drills were introduced.
  if (!session) return { percent: 100, remaining: 0, ready: true };
  if (session.focus !== focus || session.week !== week || session.season !== season) return { percent: 0, remaining: MATCH_PREP_SECONDS, ready: false };
  const duration = Math.max(1, session.durationSeconds);
  const elapsed = Math.max(0, (now - session.startedAt) / 1000);
  return { percent: Math.min(100, elapsed / duration * 100), remaining: Math.max(0, Math.ceil(duration - elapsed)), ready: elapsed >= duration };
}

export function activeMatchPrep(save: Pick<SaveGame, "training" | "calendarIndex" | "leagues">, now = Date.now()): MatchPrepFocus {
  return prepSessionProgress(save.training, save.calendarIndex, now, save.leagues[0].season).ready ? save.training.matchPrep ?? "none" : "none";
}

export function selectMatchPrep(save: SaveGame, focus: MatchPrepFocus, now = Date.now()) {
  const current = save.training.matchPrepSession;
  if (save.training.matchPrep === focus && current?.week === save.calendarIndex && current.season === save.leagues[0].season && current.focus === focus) return;
  save.training.matchPrep = focus;
  save.training.matchPrepSession = focus === "none" ? undefined : { focus, season: save.leagues[0].season, week: save.calendarIndex, startedAt: now, durationSeconds: MATCH_PREP_SECONDS };
}
