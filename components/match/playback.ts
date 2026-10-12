/** Fixed regulation-time playback: 90 game minutes take seven real minutes. */
export const MATCH_PACING = [
  { label: "7 min · normal pace", duration: "7 min", seconds: 420, multiplier: 1 },
];

export function playbackTicksPerSecond(seconds: number): number {
  return 90 * 60 / seconds;
}

/** A hidden tab must not advance minutes of play on its first visible frame. */
export function playbackDelta(now: number, previous: number): number {
  return Math.max(0, Math.min(0.1, (now - previous) / 1000));
}
