import { isFinished, stepMatch } from "./engine";
import type { MatchEvent, MatchState } from "./engine/types";

/** Moments worth watching in highlights mode. */
export function isHighlight(e: MatchEvent): boolean {
  switch (e.type) {
    case "goal":
    case "big_save":
    case "penalty":
    case "red":
      return true;
    case "shot_saved":
    case "shot_wide":
    case "shot_blocked":
      return (e.xg ?? 0) >= 0.08;
    default:
      return false;
  }
}

const LEAD_IN = 14; // seconds of build-up shown before a moment
const FOLLOW = 5; // seconds after it

/**
 * Look ahead on a copy of the (deterministic) match and return the tick windows
 * containing key moments from now on. Recompute after any tactical change,
 * since that changes the future.
 */
export function highlightWindows(state: MatchState): [number, number][] {
  const sim: MatchState = structuredClone(state);
  const from = sim.events.length;
  let guard = 0;
  while (!isFinished(sim) && guard++ < 20000) stepMatch(sim);
  const windows: [number, number][] = [];
  for (const e of sim.events.slice(from)) {
    if (!isHighlight(e)) continue;
    const start = Math.max(state.tick, e.tick - LEAD_IN);
    const end = e.tick + FOLLOW;
    const last = windows[windows.length - 1];
    if (last && start <= last[1] + 3) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }
  return windows;
}
