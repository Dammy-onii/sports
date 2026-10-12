import type { MatchState } from "@/game/engine/types";

export const PLAYER_VISUAL_SPEED = 7;
export const BALL_VISUAL_SPEED = 26;

export interface Point { x: number; y: number; vx?: number; vy?: number }
export interface PitchMotion { players: Map<string, Point>; ball: Point; half: number }

/** Real-time speed and acceleration limits; compressed ticks never multiply either. */
export function followPoint(from: Point, to: Point, dt: number, speed: number): Point {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance || dt <= 0) return { ...from };
  const oldX = from.vx ?? 0, oldY = from.vy ?? 0;
  const desiredSpeed = Math.min(speed, distance / 0.2);
  const response = -Math.expm1(-dt / 0.25);
  const changeX = (dx / distance * desiredSpeed - oldX) * response;
  const changeY = (dy / distance * desiredSpeed - oldY) * response;
  const acceleration = speed === PLAYER_VISUAL_SPEED ? 8 : 60;
  const scale = Math.min(1, acceleration * dt / Math.max(1e-10, Math.hypot(changeX, changeY)));
  const vx = oldX + changeX * scale, vy = oldY + changeY * scale;
  const stepX = (oldX + vx) / 2 * dt, stepY = (oldY + vy) / 2 * dt;
  if (stepX * dx + stepY * dy >= distance * distance) return { x: to.x, y: to.y, vx: 0, vy: 0 };
  return { x: from.x + stepX, y: from.y + stepY, vx, vy };
}

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
  const active = new Set<string>();
  for (const p of s.players) {
    if (!p.onPitch) continue;
    active.add(p.id);
    const target = { x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha };
    motion.players.set(p.id, followPoint(motion.players.get(p.id) ?? target, target, dt, PLAYER_VISUAL_SPEED));
  }
  for (const id of motion.players.keys()) if (!active.has(id)) motion.players.delete(id);
  const owner = s.ball.owner === null ? undefined : s.players[s.ball.owner];
  const carrier = owner ? motion.players.get(owner.id) : undefined;
  motion.ball = followPoint(motion.ball, carrier ?? { x: s.ball.px + (s.ball.x - s.ball.px) * alpha, y: s.ball.py + (s.ball.y - s.ball.py) * alpha }, dt, BALL_VISUAL_SPEED);
}
