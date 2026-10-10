import { PITCH_LENGTH as L, PITCH_WIDTH as W } from "@/game/constants";
import type { MatchState } from "@/game/engine/types";

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

export function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number, s: MatchState, alpha: number, kits: [KitColors, KitColors]) {
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
  ctx.strokeRect(X(0), Y(0), L * sx, W * sy);
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

  const r = Math.max(5, Math.min(11, w / 70));
  const owner = s.ball.owner;

  // players
  ctx.font = `700 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of s.players) {
    if (!p.onPitch) continue;
    const x = X(p.px + (p.x - p.px) * alpha);
    const y = Y(p.py + (p.y - p.py) * alpha);
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
    if (owner === p.idx) {
      ctx.strokeStyle = "#141414";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = isGk ? (p.side === 0 ? "#fff" : "#141414") : kit.text;
    ctx.fillText(String(p.shirt), x, y + 0.5);
  }

  // ball
  const bx = s.ball.px + (s.ball.x - s.ball.px) * alpha;
  const by = s.ball.py + (s.ball.y - s.ball.py) * alpha;
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
