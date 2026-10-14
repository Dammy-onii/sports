import type { PlayerInstructions, Position } from "./types";

/**
 * Player roles: how a player interprets his position. Each role changes real
 * engine behaviour (positioning, runs and on-ball choices), not just a label.
 */
export type RoleId =
  | "goalkeeper"
  | "sweeper_keeper"
  | "defender"
  | "ball_playing_defender"
  | "stopper"
  | "full_back"
  | "wing_back"
  | "inverted_full_back"
  | "anchor"
  | "deep_playmaker"
  | "ball_winner"
  | "box_to_box"
  | "playmaker"
  | "carrier"
  | "advanced_playmaker"
  | "shadow_striker"
  | "wide_midfielder"
  | "winger"
  | "inside_forward"
  | "poacher"
  | "target_man"
  | "false_nine";

export interface RoleEffects {
  /** Shift of attacking position (team-relative pitch length, + = forward). */
  dx?: number;
  /** Shift of defending position. */
  dxDef?: number;
  /** Fraction pulled toward the centre line when attacking (inverted / inside roles). */
  tuck?: number;
  /** Extra width when attacking (0–1, pushes toward the touchline). */
  wide?: number;
  /** Frequency multiplier for runs in behind (0 = never). */
  runs?: number;
  /** Overlaps on the flank when the ball is wide. */
  overlap?: boolean;
  /** Priority to attack the box when the ball is wide (higher = first). */
  boxRuns?: number;
  /** Multipliers on on-ball choices. */
  carry?: number;
  shoot?: number;
  cross?: number;
  /** Bonus for forward / progressive passes chosen by this player. */
  playmake?: number;
  /** Extra seconds holding the ball up (target man). */
  hold?: number;
  /** Preference as the target of long balls and crosses. */
  aerial?: number;
  /** Extra metres of closing-down radius when defending. */
  press?: number;
  /** Goalkeeper comes off his line (team-relative). */
  sweep?: number;
  /** Player instructions only: −1 shorter … +1 more direct passing. */
  direct?: number;
  /** Player instructions only: −1 ease off … +1 tackle harder. */
  tackle?: number;
  /** Player instructions only: extra pull toward the man he's marking. */
  mark?: number;
  /** Player instructions only: free to roam from position. */
  roam?: boolean;
}

export interface RoleInfo {
  label: string;
  positions: Position[];
  blurb: string;
  effects: RoleEffects;
}

export const ROLES: Record<RoleId, RoleInfo> = {
  goalkeeper: { label: "Goalkeeper", positions: ["GK"], blurb: "Stays on his line and distributes safely.", effects: {} },
  sweeper_keeper: {
    label: "Sweeper keeper",
    positions: ["GK"],
    blurb: "Plays higher to sweep behind a high line and starts attacks short.",
    effects: { sweep: 0.05, playmake: 0.5 },
  },
  defender: { label: "Defender", positions: ["CB"], blurb: "Holds the line and clears danger.", effects: {} },
  ball_playing_defender: {
    label: "Ball-playing defender",
    positions: ["CB"],
    blurb: "Steps out with the ball and looks for progressive passes.",
    effects: { playmake: 1, carry: 1.2 },
  },
  stopper: {
    label: "Stopper",
    positions: ["CB"],
    blurb: "Steps up aggressively to engage forwards before they turn.",
    effects: { press: 4, dxDef: 0.02 },
  },
  full_back: {
    label: "Full-back",
    positions: ["LB", "RB"],
    blurb: "Balanced: supports attacks occasionally, defends first.",
    effects: { overlap: true, runs: 0.6 },
  },
  wing_back: {
    label: "Wing-back",
    positions: ["LB", "RB"],
    blurb: "Bombs forward, provides width and crosses. Leaves space behind.",
    effects: { dx: 0.08, wide: 0.5, overlap: true, runs: 1.3, cross: 1.25, dxDef: 0.02 },
  },
  inverted_full_back: {
    label: "Inverted full-back",
    positions: ["LB", "RB"],
    blurb: "Tucks into midfield in possession to add a passer and protect against counters.",
    effects: { tuck: 0.55, dx: 0.04, playmake: 0.6 },
  },
  anchor: {
    label: "Anchor",
    positions: ["DM"],
    blurb: "Sits in front of the defence and screens. Rarely goes forward.",
    effects: { dx: -0.05, dxDef: -0.02, carry: 0.7, shoot: 0.6 },
  },
  deep_playmaker: {
    label: "Deep-lying playmaker",
    positions: ["DM", "CM"],
    blurb: "Dictates from deep with long, progressive passes.",
    effects: { dx: -0.03, playmake: 1.4 },
  },
  ball_winner: {
    label: "Ball-winning midfielder",
    positions: ["DM", "CM"],
    blurb: "Hunts the ball and presses relentlessly. Tires faster.",
    effects: { press: 5, dxDef: 0.03 },
  },
  box_to_box: {
    label: "Box-to-box",
    positions: ["CM"],
    blurb: "Covers every blade of grass and arrives late in the box.",
    effects: { boxRuns: 1, runs: 0.4 },
  },
  playmaker: {
    label: "Playmaker",
    positions: ["CM", "AM"],
    blurb: "Looks for the killer ball; everything goes through him.",
    effects: { playmake: 1.3, shoot: 0.85 },
  },
  carrier: {
    label: "Ball carrier",
    positions: ["CM", "DM"],
    blurb: "Drives forward with the ball to break lines.",
    effects: { carry: 1.5, dx: 0.02 },
  },
  advanced_playmaker: {
    label: "Advanced playmaker",
    positions: ["AM"],
    blurb: "Finds pockets between the lines and creates chances.",
    effects: { playmake: 1.2, carry: 1.1 },
  },
  shadow_striker: {
    label: "Shadow striker",
    positions: ["AM"],
    blurb: "Breaks from midfield into the box like a second striker.",
    effects: { dx: 0.06, runs: 1.3, boxRuns: 3, shoot: 1.25 },
  },
  wide_midfielder: {
    label: "Wide midfielder",
    positions: ["LM", "RM"],
    blurb: "Works the flank in both directions and delivers crosses.",
    effects: { cross: 1.15, runs: 0.6 },
  },
  winger: {
    label: "Winger",
    positions: ["LM", "RM", "LW", "RW"],
    blurb: "Hugs the touchline, beats his man and crosses.",
    effects: { wide: 0.6, carry: 1.25, cross: 1.4, runs: 0.8, boxRuns: 0 },
  },
  inside_forward: {
    label: "Inside forward",
    positions: ["LW", "RW", "LM", "RM"],
    blurb: "Cuts inside onto his stronger foot to shoot.",
    effects: { tuck: 0.4, carry: 1.2, shoot: 1.3, cross: 0.6, runs: 1.1, boxRuns: 2 },
  },
  poacher: {
    label: "Poacher",
    positions: ["ST"],
    blurb: "Lives on the shoulder of the last defender and finishes chances.",
    effects: { runs: 1.5, boxRuns: 4, shoot: 1.2, carry: 0.8 },
  },
  target_man: {
    label: "Target man",
    positions: ["ST"],
    blurb: "Holds the ball up and wins headers from long balls and crosses.",
    effects: { hold: 2, aerial: 1.6, runs: 0.5, boxRuns: 4 },
  },
  false_nine: {
    label: "False nine",
    positions: ["ST"],
    blurb: "Drops deep to link play, dragging centre-backs out of position.",
    effects: { dx: -0.15, playmake: 1.1, runs: 0.3, boxRuns: 1, carry: 1.15 },
  },
};

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

export const DEFAULT_ROLE: Record<Position, RoleId> = {
  GK: "goalkeeper",
  CB: "defender",
  LB: "full_back",
  RB: "full_back",
  DM: "anchor",
  CM: "box_to_box",
  AM: "advanced_playmaker",
  LM: "wide_midfielder",
  RM: "wide_midfielder",
  LW: "winger",
  RW: "winger",
  ST: "poacher",
};

export function rolesFor(pos: Position): RoleId[] {
  return ROLE_IDS.filter((r) => ROLES[r].positions.includes(pos));
}

/** Use `role` if it suits `pos`, otherwise that position's default. */
export function validRole(role: RoleId | undefined, pos: Position): RoleId {
  return role && ROLES[role]?.positions.includes(pos) ? role : DEFAULT_ROLE[pos];
}

export function roleEffects(role: RoleId | undefined): RoleEffects {
  return (role && ROLES[role]?.effects) || {};
}

/**
 * A role as it actually plays out: scaled by how well the player knows it
 * (an unfamiliar inverted full-back only half-inverts) and adjusted by his
 * individual instructions.
 */
export function effectiveRole(role: RoleId, roleFam: number, pi?: PlayerInstructions): RoleEffects {
  const base = roleEffects(role);
  const k = 0.4 + 0.6 * Math.max(0, Math.min(1, roleFam));
  const add = (v: number | undefined) => (v === undefined ? undefined : v * k);
  const mul = (v: number | undefined) => (v === undefined ? undefined : 1 + (v - 1) * k);
  const fx: RoleEffects = {
    dx: add(base.dx),
    dxDef: add(base.dxDef),
    tuck: add(base.tuck),
    wide: add(base.wide),
    runs: add(base.runs),
    overlap: base.overlap,
    boxRuns: base.boxRuns,
    carry: mul(base.carry),
    shoot: mul(base.shoot),
    cross: mul(base.cross),
    playmake: add(base.playmake),
    hold: add(base.hold),
    aerial: mul(base.aerial),
    press: add(base.press),
    sweep: add(base.sweep),
  };
  if (!pi) return fx;
  const x = (v: number | undefined, d: number) => (v ?? 1) * d;
  if (pi.shooting) fx.shoot = x(fx.shoot, pi.shooting === "more" ? 1.35 : 0.65);
  if (pi.dribbling) fx.carry = x(fx.carry, pi.dribbling === "more" ? 1.4 : 0.6);
  if (pi.crossing) fx.cross = x(fx.cross, pi.crossing === "more" ? 1.5 : 0.6);
  if (pi.passing) fx.direct = pi.passing === "direct" ? 1 : -1;
  if (pi.runs === "hold") {
    fx.runs = (fx.runs ?? 0) * 0.3;
    fx.dx = (fx.dx ?? 0) - 0.03;
    fx.overlap = false;
  } else if (pi.runs === "forward") {
    fx.runs = Math.max(0.6, (fx.runs ?? 0) * 1.5);
    fx.dx = (fx.dx ?? 0) + 0.03;
  }
  if (pi.width === "narrow") fx.tuck = Math.min(1, (fx.tuck ?? 0) + 0.4);
  else if (pi.width === "wide") fx.wide = Math.min(1, (fx.wide ?? 0) + 0.5);
  if (pi.pressing) fx.press = (fx.press ?? 0) + (pi.pressing === "more" ? 4 : -4);
  if (pi.tackling) fx.tackle = pi.tackling === "hard" ? 1 : -1;
  if (pi.markTight) fx.mark = 0.25;
  if (pi.roam) fx.roam = true;
  return fx;
}

// ───────────── shouts & team talks ─────────────

export type ShoutId = "encourage" | "demand" | "calm" | "push" | "focus";

export const SHOUTS: Record<ShoutId, { label: string; blurb: string }> = {
  encourage: { label: "Encourage", blurb: "Lifts players whose heads have dropped." },
  demand: { label: "Demand more", blurb: "More pressing and effort. Tires players and raises foul risk." },
  calm: { label: "Calm down", blurb: "Composure up, fewer rash challenges, slower tempo." },
  push: { label: "Push higher", blurb: "Squeeze up and commit more players forward." },
  focus: { label: "Concentrate", blurb: "Tighter marking and positioning. Good for seeing out a lead." },
};

export type TalkTone = "praise" | "demand" | "calm" | "encourage";

export const TALKS: Record<TalkTone, { label: string; line: string }> = {
  praise: { label: "Praise", line: "Great work out there. Keep doing exactly this." },
  demand: { label: "Demand more", line: "That's not good enough. I expect more from every one of you." },
  calm: { label: "Stay calm", line: "Keep your heads. Stick to the plan and it will come." },
  encourage: { label: "Encourage", line: "You're better than this lot. Go out and show it." },
};

/**
 * How one player reacts to a team talk (morale change), from the match
 * situation and his personality. Deterministic so live matches replay.
 */
export function talkReaction(
  tone: TalkTone,
  ctx: { scoreDiff: number; rating: number; aggression: number; consistency: number; morale: number },
): number {
  const fiery = ctx.aggression >= 14;
  const steady = ctx.consistency >= 14;
  const playingWell = ctx.rating >= 6.8;
  let d = 0;
  switch (tone) {
    case "praise":
      d = ctx.scoreDiff >= 0 ? (playingWell ? 8 : 4) : -3; // praise while losing rings hollow
      if (ctx.scoreDiff > 1) d -= steady ? 0 : 3; // complacency risk
      break;
    case "demand":
      if (ctx.scoreDiff < 0) d = fiery ? 10 : steady ? 4 : 6;
      else d = playingWell ? -6 : fiery ? 3 : -2; // nobody likes a rollicking after a good half
      break;
    case "calm":
      d = ctx.scoreDiff === 0 || Math.abs(ctx.scoreDiff) === 1 ? (steady ? 3 : 6) : 2;
      if (fiery) d -= 1;
      break;
    case "encourage":
      d = ctx.morale < 55 ? 9 : ctx.scoreDiff < 0 ? 6 : 3;
      break;
  }
  return d;
}

export function reactionLabel(d: number): string {
  if (d >= 8) return "Fired up";
  if (d >= 4) return "Motivated";
  if (d > 0) return "Focused";
  if (d === 0) return "Unmoved";
  if (d > -5) return "Unconvinced";
  return "Annoyed";
}
