import { PITCH_LENGTH as L, PITCH_WIDTH as W } from "@/game/constants";
import type { MatchState } from "@/game/engine/types";
import type { PitchMotion } from "./motion";

export interface KitColors {
  fill: string;
  stroke: string;
  text: string;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Pick kits so the two sides are distinguishable (away switches to its secondary on a clash). */
export function resolveKits(s: MatchState): [KitColors, KitColors] {
  const h = s.teams[0].colors;
  const a = s.teams[1].colors;
  const home: KitColors = { fill: h.primary, stroke: h.secondary, text: luminance(h.primary) > 0.6 ? "#0b0f0d" : "#ffffff" };
  let awayFill = a.primary;
  let awayStroke = a.secondary;
  if (colorDistance(h.primary, a.primary) < 120) {
    awayFill = a.secondary;
    awayStroke = a.primary;
    if (colorDistance(h.primary, awayFill) < 120) {
      awayFill = luminance(h.primary) > 0.5 ? "#111827" : "#f8fafc";
      awayStroke = a.primary;
    }
  }
  const away: KitColors = { fill: awayFill, stroke: awayStroke, text: luminance(awayFill) > 0.6 ? "#0b0f0d" : "#ffffff" };
  return [home, away];
}

export function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number, s: MatchState, alpha: number, kits: [KitColors, KitColors], options: { names?: boolean; selectedId?: string | null; motion?: PitchMotion } = {}) {
  const pad = Math.max(8, w * 0.025);
  const sx = (w - pad * 2) / L;
  const sy = (h - pad * 2) / W;
  // Teams change ends at half-time: mirror the view in the second half.
  const flip = s.half === 2;
  const X = (x: number) => pad + (flip ? L - x : x) * sx;
  const Y = (y: number) => pad + (flip ? W - y : y) * sy;

  // grass
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? "#c5dec9" : "#cfe6d3";
    ctx.fillRect((w / stripes) * i, 0, w / stripes + 1, h);
  }

  /** Axis-aligned rectangle in pitch metres (handles the mirrored view). */
  const rect = (x: number, y: number, w: number, h: number, fill = false) => {
    const x0 = Math.min(X(x), X(x + w));
    const y0 = Math.min(Y(y), Y(y + h));
    if (fill) ctx.fillRect(x0, y0, w * sx, h * sy);
    ctx.strokeRect(x0, y0, w * sx, h * sy);
  };

  // lines
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = Math.max(1, w / 500);
  rect(0, 0, L, W);
  ctx.beginPath();
  ctx.moveTo(X(L / 2), Y(0));
  ctx.lineTo(X(L / 2), Y(W));
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(X(L / 2), Y(W / 2), 9.15 * sx, 9.15 * sy, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (const side of [0, 1]) {
    const gx = side === 0 ? 0 : L;
    const dir = side === 0 ? 1 : -1;
    // penalty box / six-yard box (pitch is symmetric, so drawing both ends is flip-safe)
    rect(Math.min(gx, gx + dir * 16.5), W / 2 - 20.16, 16.5, 40.32);
    rect(Math.min(gx, gx + dir * 5.5), W / 2 - 9.16, 5.5, 18.32);
    // spot
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(X(gx + dir * 11), Y(W / 2), Math.max(1, sx * 0.3), 0, Math.PI * 2);
    ctx.fill();
    // goal
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    rect(side === 0 ? -1.6 : L, W / 2 - 3.66, 1.6, 7.32, true);
  }

  const r = Math.max(8, Math.min(12, w / 62));
  const owner = s.ball.owner;

  // players
  ctx.font = `700 ${Math.max(10, Math.round(r))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of s.players) {
    if (!p.onPitch) continue;
    const position = options.motion?.players.get(p.id);
    const x = X(position?.x ?? p.px + (p.x - p.px) * alpha);
    const y = Y(position?.y ?? p.py + (p.y - p.py) * alpha);
    const kit = kits[p.side];
    const isGk = p.pos === "GK";
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // keepers wear neutral greys so they stand out from both outfield kits
    ctx.fillStyle = isGk ? (p.side === 0 ? "#141414" : "#f4f3ef") : kit.fill;
    ctx.strokeStyle = isGk ? (p.side === 0 ? "#f4f3ef" : "#141414") : kit.stroke;
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (owner === p.idx || options.selectedId === p.id) {
      ctx.strokeStyle = options.selectedId === p.id ? "#1f6e41" : "#141414";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = isGk ? (p.side === 0 ? "#fff" : "#141414") : kit.text;
    ctx.fillText(String(p.shirt), x, y + 0.5);
  }

  // Names sit outside the tokens, so a shirt number never competes with OVR.
  const occupied: { x: number; y: number; w: number }[] = [];
  const field = s.players.filter((p) => p.onPitch).sort((a, b) => Number(b.id === options.selectedId || b.idx === owner) - Number(a.id === options.selectedId || a.idx === owner));
  ctx.font = "600 10px system-ui, sans-serif";
  for (const p of field) {
    const important = p.idx === owner || p.id === options.selectedId;
    if (!options.names && !important) continue;
    const surname = p.shortName.replace(/^\S+\.\s*/, "");
    const label = `${p.shirt} ${surname.length > 13 ? surname.slice(0, 12) + "…" : surname}`;
    const width = ctx.measureText(label).width + 10;
    const position = options.motion?.players.get(p.id);
    const x = Math.max(width / 2 + 2, Math.min(w - width / 2 - 2, X(position?.x ?? p.px + (p.x - p.px) * alpha)));
    const baseY = Y(position?.y ?? p.py + (p.y - p.py) * alpha);
    let y = Math.min(h - 9, baseY + r + 11);
    const collides = (yy: number) => occupied.some((box) => Math.abs(box.y - yy) < 17 && Math.abs(box.x - x) < (box.w + width) / 2 + 2);
    if (collides(y)) y = Math.max(9, baseY - r - 11);
    if (collides(y) && !important) continue;
    ctx.fillStyle = important ? "#141414" : "rgba(251,250,247,0.94)";
    ctx.fillRect(x - width / 2, y - 8, width, 16);
    ctx.fillStyle = important ? "#ffffff" : "#141414";
    ctx.fillText(label, x, y);
    occupied.push({ x, y, w: width });
  }

  // ball
  const bx = options.motion?.ball.x ?? s.ball.px + (s.ball.x - s.ball.px) * alpha;
  const by = options.motion?.ball.y ?? s.ball.py + (s.ball.y - s.ball.py) * alpha;
  // where the ball came from and where it's going, so passes and shots can be followed
  const f = s.ball.flight;
  if (f) {
    ctx.save();
    ctx.strokeStyle = f.kind === "shot" ? "rgba(217,72,43,0.85)" : "rgba(20,20,20,0.45)";
    ctx.lineWidth = f.kind === "shot" ? 2 : 1.5;
    ctx.setLineDash(f.kind === "shot" ? [] : [5, 4]);
    ctx.beginPath();
    ctx.moveTo(X(f.fromX), Y(f.fromY));
    ctx.lineTo(X(bx), Y(by));
    ctx.stroke();
    if (f.kind !== "shot" && f.kind !== "clear") {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(X(f.toX), Y(f.toY), r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  const lift = s.ball.z * r * 1.6;
  const br = Math.max(3, r * 0.42) * (1 + s.ball.z * 0.35);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(X(bx) + 1, Y(by) + 1.5, br, br * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(X(bx), Y(by) - lift, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Use the same pitch projection for tapping a moving token as for drawing it. */
export function pitchPlayerAt(s: MatchState, w: number, h: number, x: number, y: number, motion?: PitchMotion): string | null {
  const pad = Math.max(8, w * 0.025);
  const sx = (w - pad * 2) / L;
  const sy = (h - pad * 2) / W;
  const flip = s.half === 2;
  let nearest: string | null = null;
  let distance = 24;
  for (const p of s.players) {
    if (!p.onPitch) continue;
    const point = motion?.players.get(p.id) ?? p;
    const d = Math.hypot(pad + (flip ? L - point.x : point.x) * sx - x, pad + (flip ? W - point.y : point.y) * sy - y);
    if (d < distance) { distance = d; nearest = p.id; }
  }
  return nearest;
}
