import type { MatchState } from "@/game/engine/types";

export interface Point { x: number; y: number }
export interface PitchMotion { players: Map<string, Point>; ball: Point; half: number }

/** Further than anyone runs in one game second: a reset (kick-off, set-piece placing), drawn as a cut. */
const CUT_DISTANCE = 12;

/** Presentation state never writes back to deterministic simulation positions. */
export function createPitchMotion(s: MatchState): PitchMotion {
  return { players: new Map(s.players.filter((p) => p.onPitch).map((p) => [p.id, { x: p.x, y: p.y }])), ball: { x: s.ball.x, y: s.ball.y }, half: s.half };
}

export function updatePitchMotion(motion: PitchMotion, s: MatchState, alpha: number, dt: number, cut = false): void {
  // Highlights and a change of ends are cuts, not a sprint across the pitch.
  if (cut || motion.half !== s.half) {
    Object.assign(motion, createPitchMotion(s));
    return;
  }
  if (dt <= 0) return;
  const active = new Set<string>();
  for (const p of s.players) {
    if (!p.onPitch) continue;
    active.add(p.id);
    const reset = Math.hypot(p.x - p.px, p.y - p.py) > CUT_DISTANCE;
    motion.players.set(p.id, reset ? { x: p.x, y: p.y } : { x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha });
  }
  for (const id of motion.players.keys()) if (!active.has(id)) motion.players.delete(id);
  const owner = s.ball.owner === null ? undefined : s.players[s.ball.owner];
  const carrier = owner ? motion.players.get(owner.id) : undefined;
  // Possession uses the very same rendered position as the carrier. Flights
  // interpolate on the simulation timeline, without a second chasing clock.
  motion.ball = carrier ? { ...carrier } : { x: s.ball.px + (s.ball.x - s.ball.px) * alpha, y: s.ball.py + (s.ball.y - s.ball.py) * alpha };
}
