/**
 * Match pace: how long 90 regulation minutes take in real time. Normal is the
 * default; key moments near goal also slow down (see `keyMomentFactor`).
 */
export const MATCH_PACING = [
  { label: "Relaxed", duration: "18 min", seconds: 1080 },
  { label: "Normal", duration: "12 min", seconds: 720 },
  { label: "Quick", duration: "7 min", seconds: 420 },
  { label: "Fast", duration: "3½ min", seconds: 210 },
];

export const DEFAULT_PACE = 1;

export function playbackTicksPerSecond(seconds: number): number {
  return 90 * 60 / seconds;
}

/** A hidden tab must not advance minutes of play on its first visible frame. */
export function playbackDelta(now: number, previous: number): number {
  return Math.max(0, Math.min(0.1, (now - previous) / 1000));
}

/** Play runs at this share of the chosen pace around the goals, so chances can be followed. */
export const KEY_MOMENT_SLOWDOWN = 0.55;
