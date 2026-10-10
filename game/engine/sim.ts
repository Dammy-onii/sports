import { FORMATIONS, GOAL_WIDTH, PITCH_LENGTH as L, PITCH_WIDTH as W } from "../constants";
import { familiarity } from "../ratings";
import { Rng, hashString } from "../rng";
import { effectiveRole, talkReaction, validRole } from "../roles";
import { roleFamiliarity, teamFamiliarity } from "../familiarity";
import type { AttributeKey, FormationId, Player, Position, ShoutId, TeamInstructions } from "../types";
import type {
  Flight,
  MPlayer,
  MatchCommand,
  MatchEvent,
  MatchEventType,
  MatchSetup,
  MatchState,
  PlayerMatchStats,
  Restart,
  ShotOutcome,
  Side,
  TeamSetup,
  TeamState,
} from "./types";
import { HEAT_COLS, HEAT_ROWS } from "./types";

export const ENGINE_VERSION = 2;
export const TICKS_PER_MINUTE = 60;
const HALF_TICKS = 45 * TICKS_PER_MINUTE;
const CY = W / 2;

// ───────────────────────────── helpers ─────────────────────────────

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy); // much faster than Math.hypot in V8
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Team-relative x: 0 = own goal line, 1 = opponent's goal line. */
const relX = (side: Side, x: number) => (side === 0 ? x / L : (L - x) / L);
const relY = (side: Side, y: number) => (side === 0 ? y / W : (W - y) / W);
const absX = (side: Side, rx: number) => (side === 0 ? rx * L : L - rx * L);
const absY = (side: Side, ry: number) => (side === 0 ? ry * W : W - ry * W);
const goalX = (attacking: Side) => (attacking === 0 ? L : 0);
const other = (s: Side): Side => (s === 0 ? 1 : 0);

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return { d: dist(px, py, ax + t * dx, ay + t * dy), t };
}

function emptyStats(): PlayerMatchStats {
  return {
    touches: 0, passes: 0, passesCompleted: 0, keyPasses: 0, shots: 0, shotsOnTarget: 0, goals: 0,
    assists: 0, xg: 0, tackles: 0, tacklesWon: 0, interceptions: 0, dribbles: 0, fouls: 0, saves: 0,
    conceded: 0, possessionLost: 0, offsides: 0, interceptChances: 0, interceptReads: 0, distance: 0, carryDistance: 0,
  };
}

/** Expected goals from location (open play, feet). */
export function xgAt(attacking: Side, x: number, y: number): number {
  const gx = goalX(attacking);
  const d = dist(x, y, gx, CY);
  const a1 = Math.atan2(CY - GOAL_WIDTH / 2 - y, Math.abs(gx - x));
  const a2 = Math.atan2(CY + GOAL_WIDTH / 2 - y, Math.abs(gx - x));
  const angle = Math.abs(a2 - a1);
  return 1 / (1 + Math.exp(-(-3.2 + 3.0 * angle - 0.06 * d)));
}

/** Shots under close attention are much worse chances. */
function pressureFactor(pressure: number): number {
  return pressure < 1 ? 0.3 : pressure < 2 ? 0.45 : pressure < 3.5 ? 0.65 : pressure < 6 ? 0.85 : 1;
}

/** Outfield opponents inside the triangle shooter → goal posts. */
function bodiesInCone(s: MatchState, c: MPlayer): number {
  const gx = goalX(c.side);
  let n = 0;
  for (const o of onPitch(s, other(c.side))) {
    if (o.pos === "GK") continue;
    const along = (o.x - c.x) / (gx - c.x || 1e-6);
    if (along <= 0.02 || along >= 1) continue;
    const halfWidth = (GOAL_WIDTH / 2) * along + 0.6;
    const lineY = c.y + (CY - c.y) * along;
    if (Math.abs(o.y - lineY) < halfWidth) n++;
  }
  return n;
}

/** Defenders crowding the shooter beyond the nearest one (a packed box). */
function crowd(s: MatchState, c: MPlayer): number {
  let n = 0;
  for (const o of onPitch(s, other(c.side))) if (o.pos !== "GK" && dist(o.x, o.y, c.x, c.y) < 4) n++;
  return Math.max(0, n - 1);
}

function shotQuality(s: MatchState, c: MPlayer, pressure: number): number {
  return xgAt(c.side, c.x, c.y) * pressureFactor(pressure) * Math.pow(0.72, bodiesInCone(s, c)) * Math.pow(0.82, crowd(s, c));
}

/** Rough "expected threat" of having the ball at a location. */
function threat(attacking: Side, x: number, y: number): number {
  const d = dist(x, y, goalX(attacking), CY);
  return 0.55 * Math.exp(-d / 12) + 0.03 * relX(attacking, x);
}

const SHOUT_ATTRS: Record<ShoutId, Partial<Record<AttributeKey, number>>> = {
  encourage: {},
  demand: { workRate: 1.04, tackling: 1.03, pace: 1.02 },
  calm: { composure: 1.05, decisions: 1.04 },
  push: {},
  focus: { marking: 1.05, positioning: 1.05 },
};


// ───────────────────────────── emotions ─────────────────────────────

type Feeling = Partial<Pick<MPlayer["emo"], "conf" | "nerves" | "frus">>;

/** Strongest leader on the pitch for a side: leaders steady everyone's emotions. */
const leaderCache = new WeakMap<MatchState, { tick: number; v: [number, number] }>();
function leadership(s: MatchState, side: Side): number {
  let c = leaderCache.get(s);
  if (!c || c.tick !== s.tick) {
    const v: [number, number] = [8, 8];
    for (const p of s.players) if (p.onPitch && p.attrs.leadership > v[p.side]) v[p.side] = p.attrs.leadership;
    c = { tick: s.tick, v };
    leaderCache.set(s, c);
  }
  return c.v[side];
}

/**
 * Move a player's emotions. Personality shapes how much: determination and
 * composure soften blows to confidence, big-match temperament sets nerves,
 * temperament and sportsmanship set frustration, and leaders calm everyone.
 */
function feel(s: MatchState, p: MPlayer, d: Feeling) {
  const t = traits(p);
  const calm = factor(leadership(s, p.side), 1.1, 0.8);
  const e = p.emo;
  if (d.conf) {
    const soften = d.conf < 0 ? factor((t.determination ?? 10) * 0.6 + p.attrs.composure * 0.4, 1.3, 0.6) : 1;
    e.conf = clamp(e.conf + d.conf * soften * (d.conf < 0 ? calm : 1), -1, 1);
  }
  if (d.nerves) e.nerves = clamp(e.nerves + d.nerves * (d.nerves > 0 ? factor(t.pressure ?? 10, 1.6, 0.4) * calm : 1), 0, 1);
  if (d.frus) {
    const fuse = d.frus > 0 ? factor(t.aggression, 0.6, 1.6) * factor(t.sportsmanship ?? 10, 1.25, 0.7) * calm : 1;
    e.frus = clamp(e.frus + d.frus * fuse, 0, 1);
  }
}

function teamFeel(s: MatchState, side: Side, d: Feeling, except?: MPlayer) {
  for (const p of onPitch(s, side)) if (p !== except) feel(s, p, d);
}

/** Starting emotions: morale, the occasion, the crowd and youth. */
function initialEmotions(s: MatchState) {
  for (const p of s.players) {
    const t = traits(p);
    const big = s.teams[p.side].bigMatch ? 0.28 : 0.08;
    const away = p.side === 1 ? 0.05 : 0;
    const young = p.naturalPositions && p.attrs.composure < 9 ? 0.06 : 0;
    p.emo.nerves = clamp((big + away + young) * factor(t.pressure ?? 10, 1.6, 0.4), 0, 0.8);
    p.emo.conf = clamp(((p.morale ?? 65) - 65) / 120, -0.3, 0.3);
    p.emo.frus = 0;
    // a word from the manager before the game
    if (p.boost) {
      p.emo.conf = clamp(p.emo.conf + p.boost.conf, -1, 1);
      p.emo.nerves = clamp(p.emo.nerves + p.boost.nerves, 0, 1);
      p.emo.frus = clamp(p.emo.frus + p.boost.frus, 0, 1);
    }
  }
}

const REACTIONS: { kind: string; test: (e: MPlayer["emo"]) => boolean }[] = [
  { kind: "losing_head", test: (e) => e.frus > 0.82 },
  { kind: "frustrated", test: (e) => e.frus > 0.62 },
  { kind: "rattled", test: (e) => e.nerves > 0.6 },
  { kind: "head_down", test: (e) => e.conf < -0.45 },
  { kind: "on_fire", test: (e) => e.conf > 0.6 },
];

/** Once a game-minute: emotions settle, late frustration builds, visible reactions. */
function emotionMinute(s: MatchState) {
  const minute = Math.floor(s.tick / 60);
  for (const side of [0, 1] as Side[]) {
    const diff = s.score[side] - s.score[other(side)];
    const steady = factor(leadership(s, side), 0.96, 0.92);
    for (const p of onPitch(s, side)) {
      const e = p.emo;
      e.conf *= 0.985;
      e.nerves *= steady;
      e.frus *= steady + 0.01;
      // chasing a game late on gets to the hot-heads
      if (minute >= 70 && diff < 0) feel(s, p, { frus: 0.012 * -diff });
      if (minute >= 80 && diff === 0 && s.teams[side].bigMatch) feel(s, p, { nerves: 0.01 });
      if (s.tick - e.shown < 900) continue;
      const r = REACTIONS.find((x) => x.test(e));
      if (r) {
        e.shown = s.tick;
        emit(s, "emotion", side, { player: p.id, text: r.kind });
      }
    }
  }
}

/** A short label for a player's state of mind (UI). */
export function emotionLabel(e: MPlayer["emo"]): { icon: string; label: string } | null {
  if (e.frus > 0.82) return { icon: "😡", label: "Losing his head" };
  if (e.frus > 0.55) return { icon: "😤", label: "Frustrated" };
  if (e.nerves > 0.55) return { icon: "😰", label: "Nervous" };
  if (e.conf > 0.5) return { icon: "🔥", label: "On fire" };
  if (e.conf > 0.25) return { icon: "🙂", label: "Confident" };
  if (e.conf < -0.4) return { icon: "😞", label: "Head's gone" };
  return null;
}

/** How each attribute is affected by the player's state (see eff). */
const enum K {
  Plain,
  Touch,
  Mind,
  Tactical,
  Decision,
  Tackle,
  Keeper,
}
const KEY_KIND = {} as Record<AttributeKey, K>;
for (const k of ["passing", "dribbling", "finishing", "firstTouch", "technique", "crossing", "longShots", "freeKicks", "penalties"] as AttributeKey[]) KEY_KIND[k] = K.Touch;
for (const k of ["composure", "concentration"] as AttributeKey[]) KEY_KIND[k] = K.Mind;
for (const k of ["positioning", "marking", "vision", "anticipation"] as AttributeKey[]) KEY_KIND[k] = K.Tactical;
for (const k of ["goalkeeping", "handling", "oneOnOnes", "aerialReach", "kicking"] as AttributeKey[]) KEY_KIND[k] = K.Keeper;
KEY_KIND.decisions = K.Decision;
KEY_KIND.tackling = K.Tackle;

export interface EffCache {
  tick: number;
  /** fatigue × home × form × morale × positional familiarity */
  base: number;
  touch: number;
  mind: number;
  tactical: number;
  tackle: number;
}

/**
 * A player's effective attribute right now: fatigue, home advantage, form,
 * morale, positional and tactical familiarity, shouts, emotions and match
 * sharpness. The per-player multipliers are cached once per tick.
 */
function eff(p: MPlayer, key: AttributeKey): number {
  let c = p.ec;
  const tick = p.ticksPlayed;
  if (!c || c.tick !== tick) {
    const fatigue = 0.7 + 0.3 * p.energy;
    const home = p.side === 0 ? 1.065 : 1; // home advantage
    const morale = 0.97 + ((p.morale ?? 65) / 100) * 0.05; // ~1.0 at normal morale
    const e = p.emo;
    const rust = 0.94 + 0.06 * p.sharp; // match sharpness
    // a team that knows its system reads the game better; so does a player who knows his role
    const tactical = (0.9 + 0.1 * p.teamFam) * (0.97 + 0.03 * p.roleFam);
    const mind = (1 - 0.08 * e.nerves - 0.03 * e.frus) * rust;
    c = {
      tick,
      base: fatigue * home * p.form * morale,
      // confidence lifts technique; nerves and frustration cloud judgement
      touch: (1 + 0.035 * e.conf) * rust,
      mind,
      tactical,
      tackle: 1 + 0.03 * e.frus,
    };
    p.ec = c;
  }
  const kind = KEY_KIND[key] ?? K.Plain;
  const fam = kind === K.Keeper ? 1 : 0.85 + 0.15 * p.fam;
  const shout = p.teamShout ? (SHOUT_ATTRS[p.teamShout][key] ?? 1) : 1;
  const k = kind === K.Touch ? c.touch : kind === K.Mind ? c.mind : kind === K.Tactical ? c.tactical : kind === K.Decision ? c.tactical * c.mind : kind === K.Tackle ? c.tackle : 1;
  return p.attrs[key] * c.base * fam * shout * k;
}

/** Team instructions as they play out on the pitch (touchline shouts adjust them). */
function insOf(team: TeamState): TeamInstructions {
  const i = team.instructions;
  const c = (v: number) => Math.max(1, Math.min(5, v));
  switch (team.shout) {
    case "demand":
      return { ...i, pressing: c(i.pressing + 1) };
    case "calm":
      return { ...i, tempo: c(i.tempo - 1) };
    case "push":
      return { ...i, mentality: c(i.mentality + 1), defensiveLine: c(i.defensiveLine + 1) };
    case "focus":
      return { ...i, mentality: c(i.mentality - 1) };
    default:
      return i;
  }
}

/** Hidden personality, with a neutral default for older saves. */
function traits(p: MPlayer) {
  return p.traits ?? { aggression: 10, injuryProneness: 10, consistency: 10 };
}

/** Map a 1–20 rating to a multiplier: `lo` at 1, ~1 at 10.5, `hi` at 20. */
function factor(v: number, lo: number, hi: number) {
  return lo + ((v - 1) / 19) * (hi - lo);
}

/** Current match minute (1-based, includes stoppage time). */
export function minuteOf(s: MatchState): number {
  const inHalf = s.tick - s.halfStartTick;
  const base = s.half === 1 ? 0 : 45;
  return Math.min(base + Math.floor(inHalf / TICKS_PER_MINUTE) + 1, base + 45 + Math.ceil(s.stoppage[s.half - 1] / 60));
}

function emit(s: MatchState, type: MatchEventType, side: Side, extra: Partial<MatchEvent> = {}) {
  s.events.push({ tick: s.tick, minute: minuteOf(s), type, side, ...extra });
}

// Per-tick cache of on-pitch players (kept off the serialisable state).
const pitchCache = new WeakMap<MatchState, { tick: number; lists: [MPlayer[], MPlayer[]] }>();

function onPitch(s: MatchState, side: Side): MPlayer[] {
  let c = pitchCache.get(s);
  if (!c || c.tick !== s.tick) {
    const lists: [MPlayer[], MPlayer[]] = [[], []];
    for (const p of s.players) if (p.onPitch) lists[p.side].push(p);
    c = { tick: s.tick, lists };
    pitchCache.set(s, c);
  }
  return c.lists[side];
}

function invalidatePitch(s: MatchState) {
  pitchCache.delete(s);
}

// ───────────────────────────── creation ─────────────────────────────

function shortName(p: Player) {
  return p.lastName;
}

function buildTeam(setup: TeamSetup, side: Side, players: MPlayer[]): TeamState {
  const slots = FORMATIONS[setup.formation];
  const idx: number[] = [];
  const add = (p: Player, slot: number) => {
    const pos: Position = slot >= 0 ? slots[slot].pos : p.positions[0];
    const mp: MPlayer = {
      idx: players.length,
      id: p.id,
      side,
      name: `${p.firstName} ${p.lastName}`,
      shortName: shortName(p),
      shirt: p.shirt,
      slot,
      pos,
      naturalPositions: p.positions,
      attrs: { ...p.attributes },
      traits: { ...(p.traits ?? { aggression: 10, injuryProneness: 10, consistency: 10 }) },
      role: validRole(slot >= 0 ? setup.roles?.[slot] : undefined, pos),
      roleExp: p.roleExp ? { ...p.roleExp } : undefined,
      roleFam: 1,
      pi: undefined,
      oi: undefined,
      fx: {},
      teamFam: 0.85,
      morale: p.morale ?? 65,
      teamShout: null,
      fam: familiarity(p, pos),
      x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0,
      energy: clamp(p.fitness / 100, 0.4, 1),
      onPitch: slot >= 0,
      used: slot >= 0,
      subbedOff: false,
      yellow: 0,
      sentOff: false,
      injured: false,
      ticksPlayed: 0,
      duelCd: 0,
      hash: hashString(p.id),
      sprint: false,
      form: 1,
      spd: 0,
      emo: { conf: 0, nerves: 0, frus: 0, shown: -999 },
      rapport: p.rapport ?? 50,
      boost: p.boost ? { conf: p.boost.conf, nerves: p.boost.nerves, frus: p.boost.frus } : undefined,
      sharp: (p.sharpness ?? 90) / 100,
      st: emptyStats(),
    };
    players.push(mp);
    idx.push(mp.idx);
  };
  setup.lineup.slice(0, 11).forEach((p, i) => add(p, i));
  setup.bench.forEach((p) => add(p, -1));
  return {
    side,
    clubId: setup.clubId,
    name: setup.name,
    shortName: setup.shortName,
    colors: setup.colors,
    crest: setup.crest,
    formation: setup.formation,
    instructions: { ...setup.instructions },
    isAI: setup.isAI,
    playerIdx: idx,
    subsUsed: 0,
    form: 1,
    shout: null,
    setPieces: setup.setPieces,
    familiarity: setup.familiarity ? structuredClone(setup.familiarity) : undefined,
    fam: 0.85,
    pis: [...(setup.playerInstructions ?? [])],
    opposition: { ...(setup.opposition ?? {}) },
    prep: { ...(setup.prep ?? {}) },
    bigMatch: setup.bigMatch,
    manager: setup.manager,
    cohesion: ((setup.cohesion ?? 60) - 50) / 100,
    stats: { possessionTicks: 0, shots: 0, shotsOnTarget: 0, xg: 0, passes: 0, passesCompleted: 0, tackles: 0, fouls: 0, corners: 0, yellows: 0, reds: 0, saves: 0, offsides: 0 },
  };
}

export function createMatch(setup: MatchSetup, seed: number): MatchState {
  const rng = new Rng(seed);
  const players: MPlayer[] = [];
  const home = buildTeam(setup.home, 0, players);
  const away = buildTeam(setup.away, 1, players);
  for (const t of [home, away]) {
    t.form = clamp(1 + rng.normal() * 0.045, 0.9, 1.1);
    // inconsistent players swing further from the team's day either way
    const setupPlayers = [...(t.side === 0 ? setup.home : setup.away).lineup, ...(t.side === 0 ? setup.home : setup.away).bench];
    for (const i of t.playerIdx) {
      const spread = ((21 - traits(players[i]).consistency) / 20) * 0.07;
      const settled = (setupPlayers.find((p) => p.id === players[i].id)?.settled ?? 100) / 100;
      players[i].form = clamp(t.form * (1 + rng.normal() * spread) * (0.95 + 0.05 * settled), 0.82, 1.18);
    }
  }
  const kickoffSide: Side = rng.chance(0.5) ? 0 : 1;
  // instructions on individual opponents
  for (const t of [home, away]) {
    for (const i of (t.side === 0 ? away : home).playerIdx) players[i].oi = t.opposition[players[i].id];
  }
  const stoppage: [number, number] = [rng.int(0, 3) * 60 + rng.int(0, 59), rng.int(1, 5) * 60 + rng.int(0, 59)];
  const s: MatchState = {
    engineVersion: ENGINE_VERSION,
    seed,
    rngState: rng.getState(),
    tick: 0,
    half: 1,
    halfStartTick: 0,
    halfLength: HALF_TICKS + stoppage[0],
    phase: "dead",
    deadTimer: 3,
    restart: { type: "kickoff", side: kickoffSide, x: L / 2, y: CY },
    teams: [home, away],
    players,
    ball: { x: L / 2, y: CY, px: L / 2, py: CY, z: 0, owner: null, flight: null },
    possession: kickoffSide,
    holdTimer: 0,
    dribbleTo: null,
    lastPass: null,
    score: [0, 0],
    events: [],
    commands: [],
    kickoffSide,
    stoppage,
    analytics: {
      heat: players.map(() => new Array(HEAT_COLS * HEAT_ROWS).fill(0)),
      links: {},
      pos: players.map(() => [0, 0, 0] as [number, number, number]),
      momentum: [],
    },
  };
  refreshTeam(s, 0);
  refreshTeam(s, 1);
  initialEmotions(s);
  resetForKickoff(s);
  for (const p of s.players) {
    p.px = p.x;
    p.py = p.y;
  }
  emit(s, "kickoff", kickoffSide);
  return s;
}

/**
 * Recompute what depends on the tactic: each player's role as it plays out
 * (role familiarity + instructions) and the team's tactical familiarity.
 */
function refreshTeam(s: MatchState, side: Side) {
  const team = s.teams[side];
  const fams: number[] = [];
  for (const i of team.playerIdx) {
    const p = s.players[i];
    p.pi = p.slot >= 0 ? team.pis[p.slot] : undefined;
    p.roleFam = roleFamiliarity({ roleExp: p.roleExp, positions: p.naturalPositions }, p.role);
    p.fx = effectiveRole(p.role, p.roleFam, p.pi);
    if (p.onPitch) fams.push(p.roleFam);
  }
  team.fam = team.familiarity ? teamFamiliarity(team.familiarity, team.formation, team.instructions, fams).overall : 0.85;
  for (const i of team.playerIdx) s.players[i].teamFam = team.fam;
}

function resetForKickoff(s: MatchState) {
  for (const p of s.players) p.spd = 0;
  for (const side of [0, 1] as Side[]) {
    const slots = FORMATIONS[s.teams[side].formation];
    for (const p of onPitch(s, side)) {
      const slot = slots[p.slot];
      const rx = Math.min(slot.x * 0.8, 0.46);
      p.x = absX(side, rx);
      p.y = absY(side, slot.y);
      p.tx = p.x;
      p.ty = p.y;
    }
  }
  s.ball = { x: L / 2, y: CY, px: L / 2, py: CY, z: 0, owner: null, flight: null };
}

// ───────────────────────────── commands ─────────────────────────────

export function applyCommand(s: MatchState, cmd: MatchCommand): boolean {
  const team = s.teams[cmd.side];
  if (s.phase === "fulltime") return false;
  if (cmd.type === "instructions") {
    team.instructions = { ...cmd.instructions };
    refreshTeam(s, cmd.side);
    s.commands.push({ tick: s.tick, cmd });
    emit(s, "tactics", cmd.side);
    return true;
  }
  if (cmd.type === "formation") {
    changeFormation(s, cmd.side, cmd.formation);
    refreshTeam(s, cmd.side);
    s.commands.push({ tick: s.tick, cmd });
    emit(s, "tactics", cmd.side);
    return true;
  }
  if (cmd.type === "sub") {
    const ok = makeSub(s, cmd.side, cmd.outId, cmd.inId);
    if (ok) s.commands.push({ tick: s.tick, cmd });
    return ok;
  }
  if (cmd.type === "pi") {
    if (cmd.slot < 0 || cmd.slot > 10) return false;
    team.pis[cmd.slot] = cmd.pi ?? undefined;
    refreshTeam(s, cmd.side);
    s.commands.push({ tick: s.tick, cmd });
    return true;
  }
  if (cmd.type === "oi") {
    const target = s.players.find((x) => x.id === cmd.playerId && x.side !== cmd.side);
    if (!target) return false;
    if (cmd.oi) team.opposition[cmd.playerId] = cmd.oi;
    else delete team.opposition[cmd.playerId];
    target.oi = cmd.oi ?? undefined;
    s.commands.push({ tick: s.tick, cmd });
    return true;
  }
  if (cmd.type === "role") {
    const p = onPitch(s, cmd.side).find((x) => x.slot === cmd.slot);
    if (!p) return false;
    p.role = validRole(cmd.role, p.pos);
    refreshTeam(s, cmd.side);
    s.commands.push({ tick: s.tick, cmd });
    return true;
  }
  if (cmd.type === "shout") {
    setShout(s, cmd.side, cmd.shout);
    if (cmd.shout === "encourage") {
      // lifts players whose heads have dropped (once per shout)
      for (const i of team.playerIdx) {
        const p = s.players[i];
        if (p.morale < 60) p.morale = Math.min(100, p.morale + 6);
      }
    }
    s.commands.push({ tick: s.tick, cmd });
    return true;
  }
  if (cmd.type === "teamTalk") {
    // before kick-off (tick 0) or at half-time, once each
    if (s.tick === 0) {
      if (team.preTalk) return false;
      giveTeamTalk(s, cmd.side, cmd.tone, true);
      s.commands.push({ tick: s.tick, cmd });
      return true;
    }
    if (s.phase !== "halftime" || team.talk) return false;
    giveTeamTalk(s, cmd.side, cmd.tone);
    s.commands.push({ tick: s.tick, cmd });
    return true;
  }
  return false;
}

/** Half-time team talk: each player reacts by situation and personality. */
function giveTeamTalk(s: MatchState, side: Side, tone: TeamState["talk"] & string, preMatch = false) {
  const team = s.teams[side];
  if (preMatch) team.preTalk = tone;
  else team.talk = tone;
  const big = team.bigMatch ? 1.4 : 1;
  const diff = s.score[side] - s.score[other(side)];
  for (const i of team.playerIdx) {
    const p = s.players[i];
    const d = talkReaction(tone, {
      scoreDiff: diff,
      rating: p.used ? playerRating(s, p) : 6.5,
      aggression: traits(p).aggression,
      consistency: traits(p).consistency,
      morale: p.morale,
    });
    // talks land better with players who trust you
    const trust = 0.7 + (p.rapport / 100) * 0.6;
    p.morale = clamp(p.morale + d * big * trust, 0, 100);
    // a talk that lands lifts belief; one that misses frustrates
    if (d > 0) p.emo.conf = clamp(p.emo.conf + d * 0.02, -1, 1);
    else if (d < 0) p.emo.frus = clamp(p.emo.frus - d * 0.03, 0, 1);
    if (tone === "calm") p.emo.nerves *= 0.6;
  }
  emit(s, "talk", side, { text: tone });
}

/** Morale change each player would get from a talk (for the UI preview). */
export function previewTeamTalk(s: MatchState, side: Side, tone: TeamState["talk"] & string): Record<string, number> {
  const out: Record<string, number> = {};
  const diff = s.score[side] - s.score[other(side)];
  for (const i of s.teams[side].playerIdx) {
    const p = s.players[i];
    out[p.id] = talkReaction(tone, {
      scoreDiff: diff,
      rating: p.used ? playerRating(s, p) : 6.5,
      aggression: traits(p).aggression,
      consistency: traits(p).consistency,
      morale: p.morale,
    });
  }
  return out;
}

export const MAX_SUBS = 5;

function makeSub(s: MatchState, side: Side, outId: string, inId: string): boolean {
  const team = s.teams[side];
  if (team.subsUsed >= MAX_SUBS) return false;
  const out = team.playerIdx.map((i) => s.players[i]).find((p) => p.id === outId);
  const inn = team.playerIdx.map((i) => s.players[i]).find((p) => p.id === inId);
  if (!out || !inn || !out.onPitch || inn.onPitch || inn.used || out.sentOff) return false;
  inn.slot = out.slot;
  inn.pos = out.pos;
  inn.role = validRole(out.role, out.pos);
  inn.fam = familiarity({ positions: inn.naturalPositions }, inn.pos);
  inn.onPitch = true;
  inn.used = true;
  inn.x = out.x;
  inn.y = clamp(out.y, 0, W);
  inn.px = inn.x;
  inn.py = inn.y;
  out.onPitch = false;
  out.subbedOff = true;
  // hooked early for no obvious reason: he sulks
  if (!out.injured && s.tick < 60 * 60) out.emo.frus = clamp(out.emo.frus + 0.5, 0, 1);
  invalidatePitch(s);
  out.slot = -1;
  team.subsUsed++;
  if (s.ball.owner === out.idx) s.ball.owner = inn.idx;
  if (s.ball.flight?.receiver === out.idx) s.ball.flight.receiver = inn.idx;
  refreshTeam(s, side);
  emit(s, "sub", side, { player: inn.id, other: out.id });
  return true;
}

/** Re-map on-pitch players onto a new formation's slots (best fit, greedy). */
function changeFormation(s: MatchState, side: Side, formation: FormationId) {
  const team = s.teams[side];
  const oldSlots = FORMATIONS[team.formation];
  team.formation = formation;
  // slot-based instructions don't carry over to a new shape
  team.pis = [];
  const slots = FORMATIONS[formation];
  const active = onPitch(s, side);
  const free = new Set(slots.map((_, i) => i));
  // keep slot count consistent if a player was sent off (fewer than 11)
  const order = [...active].sort((a, b) => (a.pos === "GK" ? -1 : b.pos === "GK" ? 1 : 0));
  for (const p of order) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of free) {
      const f = familiarity({ positions: p.naturalPositions }, slots[i].pos);
      // prefer keeping similar pitch location
      const cur = oldSlots[p.slot] ?? slots[i];
      const proximity = -Math.abs(cur.y - slots[i].y) * 0.3;
      const sc = f + proximity;
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    if (best >= 0) {
      free.delete(best);
      p.slot = best;
      p.pos = slots[best].pos;
      p.role = validRole(p.role, p.pos);
      p.fam = familiarity({ positions: p.naturalPositions }, p.pos);
    }
  }
}

// ───────────────────────────── positioning ─────────────────────────────

function offsideLine(s: MatchState, attacking: Side): number {
  // second-last defender in attacker-relative coordinates
  const defs = onPitch(s, other(attacking)).map((p) => relX(attacking, p.x)).sort((a, b) => b - a);
  const second = defs[1] ?? 0.5;
  return Math.max(second, relX(attacking, s.ball.x), 0.5);
}

/** Players sorted by distance to a point (distances computed once). */
function byDistance(ps: MPlayer[], x: number, y: number): MPlayer[] {
  return ps
    .map((p) => ({ p, d: (p.x - x) ** 2 + (p.y - y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.p);
}

function distCompare(x: number, y: number) {
  return (a: MPlayer, b: MPlayer) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2);
}

function updateTargets(s: MatchState) {
  const ball = s.ball;
  for (const p of s.players) p.sprint = false;
  const lines: [number, number] = [offsideLine(s, 0), offsideLine(s, 1)];
  const focusX = ball.flight ? ball.flight.toX : ball.x;
  const focusY = ball.flight ? ball.flight.toY : ball.y;

  for (const side of [0, 1] as Side[]) {
    const team = s.teams[side];
    const ins = insOf(team);
    const slots = FORMATIONS[team.formation];
    const attacking = s.possession === side;
    const bx = relX(side, focusX);
    const by = relY(side, focusY);
    const line = attacking ? lines[side] : 1;

    for (const p of onPitch(s, side)) {
      const slot = slots[p.slot] ?? slots[0];
      let tx: number;
      let ty: number;
      const jitter = Math.sin(s.tick * 0.07 + (p.hash % 100)) * 0.005;
      const role = p.fx;
      if (slot.pos === "GK") {
        tx = 0.012 + clamp(bx, 0, 1) * (attacking ? 0.07 : 0.03) + (role.sweep ?? 0) * clamp(bx * 1.5, 0, 1);
        ty = 0.5 + (by - 0.5) * 0.25;
      } else if (attacking) {
        const push = (ins.mentality - 3) * 0.035;
        const forward = slot.x > 0.55 ? 0.05 : 0;
        // positive role shifts push up before the offside cap; dropping deep (false nine) applies after it
        tx = slot.x * 0.95 + (bx - 0.3) * 0.55 + push + forward + Math.max(0, role.dx ?? 0) + jitter;
        const gamble = 0.985 - ((20 - eff(p, "offTheBall")) / 20) * 0.07 - (eff(p, "pace") / 20) * 0.03;
        const mistime = Math.sin(s.tick * 0.031 + (p.hash % 50)) > gamble ? 0.02 : 0;
        tx = Math.min(tx, line - 0.005 + mistime, 0.89) + Math.min(0, role.dx ?? 0);
        const widthF = 1 + (ins.width - 3) * 0.08;
        ty = 0.5 + (slot.y - 0.5) * widthF * 1.08 + (by - 0.5) * 0.12 + jitter;
        // inverted / inside roles tuck in; wingers and wing-backs hug the line
        if (role.tuck) ty = lerp(ty, 0.5, role.tuck * 0.6);
        if (role.wide) ty = lerp(ty, ty < 0.5 ? 0.04 : 0.96, role.wide * 0.6);
        // roaming players drift into pockets of space
        if (role.roam) {
          tx += Math.sin(s.tick * 0.017 + (p.hash % 71)) * 0.04;
          ty += Math.cos(s.tick * 0.013 + (p.hash % 61)) * 0.09;
        }
      } else {
        // Defend as a block anchored on a back-line height that tracks the ball.
        const lineShift = (ins.defensiveLine - 3) * 0.035;
        let lineH = clamp(bx * 0.62 + 0.04 + lineShift + (ins.mentality - 3) * 0.01, 0.075, 0.42);
        lineH = Math.max(0.06, Math.min(lineH, bx - 0.02));
        // a defensive mentality keeps the block tight: midfield sits on the back line
        const compact = 0.78 - (ins.defensiveLine - 3) * 0.04 - (3 - ins.mentality) * 0.06;
        tx = lineH + (slot.x - 0.2) * compact + (role.dxDef ?? 0) + jitter * 0.5;
        // narrower and more ball-side the closer the ball is to our goal
        const wf = 0.5 + clamp(bx, 0, 1) * 0.35;
        ty = 0.5 + (slot.y - 0.5) * wf + (by - 0.5) * 0.4 + jitter;
        // an unfamiliar system: players drift from their spots, and in a high
        // line an unsure defender steps out of line now and then
        const loose = (1 - p.teamFam) * factor(eff(p, "teamwork"), 1.3, 0.7);
        if (loose > 0.05) {
          tx += Math.sin(s.tick * 0.013 + (p.hash % 97)) * loose * 0.03;
          ty += Math.cos(s.tick * 0.011 + (p.hash % 89)) * loose * 0.03;
          const back = slot.pos === "CB" || slot.pos === "LB" || slot.pos === "RB";
          if (back && ins.defensiveLine >= 4 && Math.sin(s.tick * 0.02 + (p.hash % 53)) > 0.85 - loose * 0.6) tx -= loose * 0.04;
        }
      }
      p.tx = absX(side, clamp(tx, 0.01, 0.97));
      p.ty = absY(side, clamp(ty, 0.03, 0.97));
    }

    // Defending: press + mark
    if (!attacking && !ball.flight) {
      const defenders = onPitch(s, side).filter((p) => p.pos !== "GK");
      const sorted = byDistance(defenders, ball.x, ball.y);
      const ballDanger = 1 - relX(side, ball.x); // 1 near own goal
      const pressTrigger = 0.35 + (ins.pressing - 1) * 0.16; // how far up the pitch we engage
      // opposition instructions on the man on the ball
      const carrier = ball.owner !== null ? s.players[ball.owner] : undefined;
      const oiPress = carrier && carrier.side !== side ? carrier.oi?.press : undefined;
      const near0 = sorted[0] ? dist(sorted[0].x, sorted[0].y, ball.x, ball.y) : Infinity;
      const engage = oiPress === "more" ? near0 < 22 : oiPress === "less" ? ballDanger > 0.75 || near0 < 4 : ballDanger > 1 - pressTrigger || near0 < 8;
      if (sorted[0] && engage) {
        sorted[0].tx = ball.x;
        sorted[0].ty = ball.y;
        sorted[0].sprint = true;
      }
      // close down: anyone within the engage radius steps toward the carrier, goal side
      // pressing sets how high you engage; around your own box everyone closes down
      const nearBox = ballDanger > 0.7;
      const engageR = 6 + (nearBox ? Math.max(ins.pressing, 4) : ins.pressing) * 1.5 + (1 - relX(side, ball.x)) * 6;
      const goalSideX = side === 0 ? -1.2 : 1.2;
      let engaged = 1;
      // a press only works if everyone knows when to jump; instructions can add a man
      const teamwork = defenders.reduce((a, d) => a + d.attrs.teamwork, 0) / Math.max(1, defenders.length);
      const maxPress = Math.max(1, (ins.pressing >= 4 || nearBox ? 3 : 2) - (team.fam < 0.6 ? 1 : 0) - (teamwork < 8 ? 1 : 0) + (oiPress === "more" ? 1 : 0) - (oiPress === "less" ? 1 : 0));
      for (const d of sorted.slice(1)) {
        if (engaged >= maxPress) break;
        if (dist(d.x, d.y, ball.x, ball.y) < engageR + (d.fx.press ?? 0)) {
          d.tx = ball.x + goalSideX;
          d.ty = ball.y;
          d.sprint = true;
          engaged++;
        }
      }
      // recovery runs: anyone caught upfield of the ball sprints back goal-side
      for (const d of defenders) {
        if (relX(side, d.x) > relX(side, ball.x) + 0.08 && relX(side, d.tx) < relX(side, d.x) - 0.04) d.sprint = true;
      }
      // zonal marking: nudge toward the nearest attacker, goal side
      const attackers = onPitch(s, other(side));
      // tight-marking instructions: the nearest free defender shadows his man in our half
      const prepK = team.prep.opposition ? 1.3 : 1;
      const shadows = new Map<number, MPlayer>();
      for (const a of attackers) {
        if (!a.oi?.markTight || relX(a.side, a.x) < 0.45) continue;
        const free = sorted.slice(1).filter((d) => !shadows.has(d.idx));
        const d = free.sort(distCompare(a.x, a.y))[0];
        if (d) shadows.set(d.idx, a);
      }
      for (const d of sorted.slice(1)) {
        let near: MPlayer | undefined = shadows.get(d.idx);
        let nd = 14;
        if (!near) {
          for (const a of attackers) {
            const dd = dist(d.tx, d.ty, a.x, a.y);
            if (dd < nd) {
              nd = dd;
              near = a;
            }
          }
        }
        if (near) {
          const danger = 1 - relX(side, near.x); // 1 = attacker on our goal line
          let k = (0.25 + (eff(d, "marking") / 20) * 0.35) * (danger > 0.7 ? 1.5 : 1) + (d.fx.mark ?? 0);
          // late on, tired and unfocused defenders lose their man
          if (s.tick > 70 * 60) k *= factor(eff(d, "concentration"), 0.78, 1) * (0.85 + 0.15 * d.energy);
          if (shadows.has(d.idx)) k = Math.max(k, Math.min(0.95, 0.7 * prepK));
          const goalSide = side === 0 ? -1.5 : 1.5;
          d.tx = lerp(d.tx, near.x + goalSide, k);
          d.ty = lerp(d.ty, near.y, k);
        }
      }
    }
  }

  // Off-ball runs: forwards attack the last line in timed bursts, full-backs overlap.
  if (s.phase === "play") {
    const side = s.possession;
    const bx = relX(side, focusX);
    const by = relY(side, focusY);
    const line = lines[side];
    for (const p of onPitch(s, side)) {
      if (p.idx === ball.owner || p.pos === "GK") continue;
      const h = p.hash;
      const role = p.fx;
      const isFullBack = p.pos === "LB" || p.pos === "RB";
      if (!isFullBack && (role.runs ?? 0) > 0 && bx > 0.35) {
        // hard-working forwards make longer, more frequent runs; roles set how often
        const period = 20 + (h % 10);
        if ((s.tick + h) % period < (3 + Math.round((eff(p, "workRate") + eff(p, "offTheBall")) / 10)) * (role.runs ?? 0)) {
          const ry = relY(side, p.y);
          const channel = ry < 0.5 ? 0.36 : 0.64;
          p.tx = absX(side, Math.min(line - 0.004, 0.9));
          p.ty = absY(side, lerp(ry, channel, 0.5));
          p.sprint = true;
        }
      }
      if (isFullBack && role.overlap && bx > 0.5 && eff(p, "workRate") >= 9) {
        const left = p.pos === "LB";
        if ((left ? by < 0.4 : by > 0.6) && (s.tick + h) % 30 < 12 * (role.runs ?? 1)) {
          p.tx = absX(side, Math.min(bx + 0.08, line - 0.004, 0.88));
          p.ty = absY(side, left ? 0.05 : 0.95);
          p.sprint = true;
        }
      }
    }
  }

  // Support play: the two nearest team-mates offer a short option in space
  if (ball.owner !== null && !ball.flight && s.phase === "play") {
    const c = s.players[ball.owner];
    // roamers count as closer: they look for the ball
    const roamBias = (m: MPlayer) => (m.fx.roam ? 64 : 0);
    const mates = onPitch(s, c.side)
      .filter((m) => m.idx !== c.idx && m.pos !== "GK")
      .sort((a, b) => (a.x - c.x) ** 2 + (a.y - c.y) ** 2 - roamBias(a) - ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 - roamBias(b)))
      .slice(0, 2);
    const opps = onPitch(s, other(c.side));
    for (const m of mates) {
      let dx = m.tx - c.x;
      let dy = m.ty - c.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const want = 8 + eff(m, "offTheBall") * 0.3; // 8–14 m away
      dx = (dx / len) * want;
      dy = (dy / len) * want;
      let tx = c.x + dx;
      let ty = c.y + dy;
      // step away from the nearest opponent to open the lane
      let near: MPlayer | undefined;
      let nd = 6;
      for (const o of opps) {
        const d = dist(o.x, o.y, tx, ty);
        if (d < nd) {
          nd = d;
          near = o;
        }
      }
      if (near) {
        const ax = tx - near.x;
        const ay = ty - near.y;
        const al = Math.sqrt(ax * ax + ay * ay) || 1;
        tx += (ax / al) * (6 - nd) * 0.8;
        ty += (ay / al) * (6 - nd) * 0.8;
      }
      m.tx = clamp(tx, 1, L - 1);
      m.ty = clamp(ty, 1, W - 1);
    }
  }

  // Box runs: when the ball is wide in the final third, forwards attack the box
  if (!ball.flight && s.phase === "play") {
    const side = s.possession;
    const bx = relX(side, ball.x);
    const by = relY(side, ball.y);
    if (bx > 0.66 && Math.abs(by - 0.5) > 0.2) {
      const line = lines[side];
      const runners = onPitch(s, side)
        .filter((p) => p.idx !== ball.owner && (p.fx.boxRuns ?? 0) > 0)
        .sort((a, b) => (b.fx.boxRuns ?? 0) - (a.fx.boxRuns ?? 0) || relX(side, b.x) - relX(side, a.x))
        .slice(0, 3);
      // near post, penalty spot, far post (relative to the ball side)
      const nearY = by < 0.5 ? 0.42 : 0.58;
      const farY = by < 0.5 ? 0.6 : 0.4;
      const spots = [
        { x: 0.93, y: nearY },
        { x: 0.89, y: 0.5 },
        { x: 0.92, y: farY },
      ];
      runners.forEach((p, i) => {
        const sp = spots[i];
        p.tx = absX(side, Math.min(sp.x, line + 0.004));
        p.ty = absY(side, sp.y);
      });
    }
  }

  // Loose ball: nearest of each team chases
  if (ball.owner === null && !ball.flight && s.phase === "play") {
    for (const side of [0, 1] as Side[]) {
      const ps = onPitch(s, side);
      let best: MPlayer | undefined;
      let bd = Infinity;
      for (const p of ps) {
        const d = dist(p.x, p.y, ball.x, ball.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        best.tx = ball.x;
        best.ty = ball.y;
      }
    }
  }

  // Receiver runs to the ball's landing point
  if (ball.flight && ball.flight.receiver !== null) {
    const r = s.players[ball.flight.receiver];
    r.tx = ball.flight.toX;
    r.ty = ball.flight.toY;
  }

  // Carrier follows dribble target
  if (ball.owner !== null && s.dribbleTo) {
    const c = s.players[ball.owner];
    c.tx = s.dribbleTo.x;
    c.ty = s.dribbleTo.y;
  }
}

function movePlayers(s: MatchState) {
  for (const p of s.players) {
    p.px = p.x;
    p.py = p.y;
    if (!p.onPitch) continue;
    p.ticksPlayed++;
    if (p.duelCd > 0) p.duelCd--;
    const d = dist(p.x, p.y, p.tx, p.ty);
    // with the ball: quicker when running into space, slower when closed down
    const carrying = s.ball.owner === p.idx;
    const space = carrying ? nearestOpponent(s, p).d : 0;
    const max = (4.8 + (eff(p, "pace") / 20) * 3.6) * (carrying ? (space > 6 ? 0.8 : 0.62) : 1);
    const urgent = p.sprint || s.ball.owner === p.idx || s.ball.flight?.receiver === p.idx || dist(p.tx, p.ty, s.ball.x, s.ball.y) < 1;
    // jog to position, sprint when it matters, and stand still once in place
    const want = urgent ? max : d < 1.5 ? 0 : Math.min(max * 0.55, d * 0.32 + 0.5);
    // pace is top speed; acceleration is how quickly he gets there
    const accel = 1.8 + (eff(p, "acceleration") / 20) * 2.4;
    const speed = want > p.spd ? Math.min(want, p.spd + accel) : want;
    p.spd = speed;
    if (d > 0.01 && speed > 0) {
      const step = Math.min(d, speed);
      p.x += ((p.tx - p.x) / d) * step;
      p.y += ((p.ty - p.y) / d) * step;
    }
    p.x = clamp(p.x, -1, L + 1);
    p.y = clamp(p.y, -1, W + 1);
    const moved = speed > 0 ? Math.min(d, speed) : 0;
    p.st.distance += moved;
    if (s.ball.owner === p.idx) p.st.carryDistance += moved;
    const drain = 0.000058 * (1.5 - p.attrs.stamina / 20) * (0.45 + moved / 4.5) * (p.teamShout === "demand" ? 1.12 : 1) * factor(p.attrs.naturalFitness, 1.06, 0.94);
    p.energy = clamp(p.energy - drain, 0.2, 1);
  }
}

// ───────────────────────────── on-ball decisions ─────────────────────────────

interface Option {
  kind: "shoot" | "pass" | "dribble";
  util: number;
  target?: MPlayer;
  pSuccess: number;
  isCross?: boolean;
  isLong?: boolean;
  dx?: number;
  dy?: number;
}

function nearestOpponent(s: MatchState, p: MPlayer): { opp?: MPlayer; d: number } {
  let opp: MPlayer | undefined;
  let d = Infinity;
  for (const o of onPitch(s, other(p.side))) {
    const dd = dist(o.x, o.y, p.x, p.y);
    if (dd < d) {
      d = dd;
      opp = o;
    }
  }
  return { opp, d };
}

/** Closest opponent standing in the carry path from the carrier to (tx, ty). */
function blockerInPath(s: MatchState, c: MPlayer, tx: number, ty: number): MPlayer | undefined {
  let best: MPlayer | undefined;
  let bd = Infinity;
  for (const o of onPitch(s, other(c.side))) {
    const seg = distToSegment(o.x, o.y, c.x, c.y, tx, ty);
    if (seg.d < 2.6 && (seg.t > 0 || seg.d < 1.2)) {
      const d = dist(o.x, o.y, c.x, c.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
  }
  return best;
}

function beatChance(c: MPlayer, o: MPlayer): number {
  return clamp(
    0.42 +
      (eff(c, "dribbling") - eff(o, "tackling")) * 0.021 +
      (eff(c, "acceleration") - eff(o, "acceleration")) * 0.005 +
      (eff(c, "pace") - eff(o, "pace")) * 0.004 +
      (eff(c, "agility") - eff(o, "balance")) * 0.006 +
      (eff(c, "flair") - 10) * 0.003,
    0.15,
    0.75,
  );
}

/** Winning the ball in the air: technique, spring, power and courage. */
function aerial(p: MPlayer) {
  return eff(p, "heading") * 0.6 + eff(p, "jumping") * 0.45 + eff(p, "strength") * 0.25 + eff(p, "bravery") * 0.1;
}

/** Where a pass to `m` should arrive: ahead of a runner (through ball) or just in front of him. */
function leadPoint(c: MPlayer, m: MPlayer): { x: number; y: number } {
  const dir = m.side === 0 ? 1 : -1;
  const d = dist(c.x, c.y, m.x, m.y);
  if (m.sprint && relX(m.side, m.x) > relX(c.side, c.x)) {
    return { x: absX(m.side, Math.min(relX(m.side, m.x) + 0.065, 0.94)), y: m.y };
  }
  return { x: clamp(m.x + dir * Math.min(3, d * 0.08), 0.5, L - 0.5), y: m.y };
}

function lossCost(s: MatchState, p: MPlayer) {
  // possession itself is worth something, wherever you lose it
  return threat(other(p.side), p.x, p.y) * 0.85 + 0.025;
}

function decide(s: MatchState, rng: Rng, c: MPlayer, forcePass = false): Option {
  const side = c.side;
  const ins = insOf(s.teams[side]);
  const opps = onPitch(s, other(side));
  const mates = onPitch(s, side).filter((m) => m.idx !== c.idx);
  const { d: pressure } = nearestOpponent(s, c);
  const options: Option[] = [];
  const loss = lossCost(s, c);
  const gx = goalX(side);
  const dGoal = dist(c.x, c.y, gx, CY);
  const passing = eff(c, "passing");
  const vision = eff(c, "vision");
  // confident players back themselves; nervous ones play safe
  const riskAppetite = (1 + (ins.mentality - 3) * 0.12) * (1 + 0.15 * c.emo.conf - 0.1 * c.emo.nerves);

  // Shoot
  if (!forcePass && dGoal < 33 && c.pos !== "GK") {
    const xg = shotQuality(s, c, pressure);
    const skill = dGoal > 18 ? eff(c, "longShots") : eff(c, "finishing");
    if (xg > 0.015) {
      // long-range shooters back themselves from distance
      const range = dGoal > 16 ? (1 + (skill - 8) * 0.06) * (1 + (eff(c, "flair") - 10) * 0.012) : 1;
      const util = xg * (1.08 + skill / 20) * range * riskAppetite * (c.fx.shoot ?? 1);
      options.push({ kind: "shoot", util, pSuccess: xg });
    }
  }

  // Passes
  const wide = Math.abs(c.y - CY) > 13 && relX(side, c.x) > 0.68;
  for (const m of mates) {
    const d = dist(c.x, c.y, m.x, m.y);
    if (d < 4 || d > 55) continue;
    if (c.pos === "GK" && relX(side, m.x) < 0.08) continue;
    let lane = Infinity;
    for (const o of opps) {
      const seg = distToSegment(o.x, o.y, c.x, c.y, m.x, m.y);
      if (seg.t > 0.05 && seg.d < lane) lane = seg.d;
    }
    let recv = Infinity;
    for (const o of opps) recv = Math.min(recv, dist(o.x, o.y, m.x, m.y));
    const isLong = d > 32;
    const inBox = relX(side, m.x) > 0.83 && Math.abs(m.y - CY) < 20;
    const isCross = wide && inBox;
    const laneRisk = lane < 1 ? 0.4 : lane < 2.5 ? 0.1 : lane < 4 ? 0.03 : 0;
    const recvRisk = recv < 1.5 ? 0.16 : recv < 3 ? 0.06 : 0;
    let p = 0.99 - d * 0.003 * (1.45 - passing / 20) - laneRisk * (1.1 - vision / 40) - recvRisk * 0.7 - (pressure < 2 ? 0.03 : 0);
    if (inBox && !isCross) p *= recv < 2 ? 0.5 : recv < 4 ? 0.75 : 0.95;
    if (isCross) p = 0.2 + eff(c, "crossing") * 0.006 + eff(c, "technique") * 0.002 - (recv < 2 ? 0.06 : 0);
    // tired minds lose focus late on
    if (s.tick > 75 * 60) p -= (1 - eff(c, "concentration") / 20) * 0.02;
    // a keeper's kicking decides how far and true his distribution goes
    if (c.pos === "GK" && d > 25) p += (eff(c, "kicking") - 10) * 0.012;
    // a squad that knows each other links up better
    if (!isLong && !isCross) p += s.teams[side].cohesion * 0.03;
    p = clamp(p, 0.04, 0.985);
    // a pass into a runner's path is worth where he'll collect it, but is harder to weight
    const lead = leadPoint(c, m);
    if (m.sprint && !isCross) p = clamp(p - 0.15 + (vision - 10) * 0.01 + (eff(c, "technique") - 10) * 0.004, 0.04, 0.92);
    let value = threat(side, lead.x, lead.y);
    if (isCross) value = xgAt(side, m.x, m.y) * 0.9 + 0.07;
    // open receivers can turn and progress
    value *= recv > 5 ? 1.15 : recv < 2 ? 0.8 : 1;
    let util = p * value * riskAppetite - (1 - p) * loss;
    const direct = c.fx.direct ?? 0;
    if (isLong) {
      p = clamp(p - 0.03 - (1 - eff(c, "technique") / 20) * 0.06, 0.04, 0.95);
      util = (p * value * riskAppetite - (1 - p) * loss) * (0.7 + (ins.directness - 3) * 0.15) * (1 + 0.35 * direct);
    } else util *= (1 - (ins.directness - 3) * 0.04) * (1 - 0.08 * direct);
    // tempo: quick teams favour forward passes; playmakers look for them too
    const forward = relX(side, m.x) - relX(side, c.x);
    util += forward * 0.012 * (ins.tempo - 2);
    const cr = c.fx;
    if (cr.playmake && forward > 0) util += forward * 0.012 * cr.playmake;
    if (isCross) util *= cr.cross ?? 1;
    // target men attract long balls and crosses
    const aerial = m.fx.aerial;
    if (aerial && (isLong || isCross)) util *= aerial;
    // players with flair try the killer ball
    if (m.sprint) util *= 1 + (eff(c, "flair") - 10) * 0.015;
    // vision: weaker players don't spot every option
    if (rng.next() > 0.55 + vision / 40) continue;
    // most players won't play the ball to a team-mate standing offside
    if (isOffside(s, c, m) && rng.chance(0.75 + vision / 80)) continue;
    options.push({ kind: "pass", util, target: m, pSuccess: p, isCross, isLong });
  }

  // Dribble / carry
  if (!forcePass && c.pos !== "GK") {
    const dir = side === 0 ? 1 : -1;
    const toCentre = relX(side, c.x) > 0.75 ? (CY - c.y) * 0.25 : 0;
    const { d: room } = nearestOpponent(s, c);
    const dx = c.x + dir * (room > 6 ? 10 : 7);
    const dy = clamp(c.y + toCentre + rng.range(-3, 3), 2, W - 2);
    const blocker = blockerInPath(s, c, dx, dy);
    const p = blocker ? beatChance(c, blocker) : 0.97;
    // taking a man on is risky: only confident dribblers fancy it
    const flair = blocker ? 0.15 + (eff(c, "dribbling") / 20) * 0.35 + (eff(c, "flair") / 20) * 0.15 : 1;
    // running into open grass is attractive; taking players on less so
    const open = !blocker && room > 6;
    const carryBias = (c.fx.carry ?? 1) * (1 + 0.2 * Math.max(0, c.emo.conf));
    const util =
      ((p * threat(side, dx, dy) - (1 - p) * loss * 1.6) * flair * (open ? 1.3 : 1) + (blocker ? 0 : open ? 0.006 : 0.002)) * carryBias;
    options.push({ kind: "dribble", util, pSuccess: p, dx, dy });
  }

  if (!options.length) {
    // nothing sensible: hoof it forward
    const fwd = mates.sort((a, b) => relX(side, b.x) - relX(side, a.x))[0];
    return { kind: "pass", util: 0, target: fwd, pSuccess: 0.35, isLong: true };
  }

  // Better decision makers pick the best option more reliably.
  const decisions = eff(c, "decisions");
  const tau = 0.006 + ((20 - decisions) / 20) * 0.02;
  const best = Math.max(...options.map((o) => o.util));
  const weights = options.map((o) => Math.exp((o.util - best) / tau));
  return options[rng.weighted(weights)];
}

// ───────────────────────────── actions ─────────────────────────────

function giveBall(s: MatchState, p: MPlayer, rng: Rng) {
  s.ball.owner = p.idx;
  s.ball.flight = null;
  s.ball.x = p.x;
  s.ball.y = p.y;
  s.ball.z = 0;
  s.possession = p.side;
  p.st.touches++;
  const tempo = insOf(s.teams[p.side]).tempo;
  // a target man holds the ball up for team-mates to join
  // a clean first touch buys time to play the next ball sooner
  s.holdTimer = Math.max(1, rng.int(2, 5) - Math.floor((tempo - 3) / 2) - (eff(p, "firstTouch") >= 15 ? 1 : 0)) + (p.fx.hold ?? 0);
  s.dribbleTo = null;
}

/** Is `m` in an offside position at the moment the ball is played by `c`? */
function isOffside(s: MatchState, c: MPlayer, m: MPlayer): boolean {
  const rm = relX(m.side, m.x);
  if (rm <= 0.5) return false;
  const defs = onPitch(s, other(m.side)).map((p) => relX(m.side, p.x)).sort((a, b) => b - a);
  const line = Math.max(defs[1] ?? 0.5, relX(c.side, c.x));
  return rm > line + 0.012; // ~1.3 m tolerance for "level"
}

function startPass(s: MatchState, rng: Rng, c: MPlayer, opt: Option) {
  const m = opt.target!;
  const team = s.teams[c.side];
  // flag goes up (assistants miss a few marginal ones)
  if (isOffside(s, c, m) && rng.chance(0.85)) {
    c.st.passes++;
    team.stats.passes++;
    team.stats.offsides++;
    m.st.offsides++;
    emit(s, "offside", c.side, { player: m.id });
    setRestart(s, { type: "freekick", side: other(c.side), x: clamp(m.x, 1, L - 1), y: clamp(m.y, 1, W - 1) }, 3);
    return;
  }
  const d = dist(c.x, c.y, m.x, m.y);
  c.st.passes++;
  team.stats.passes++;
  const speed = opt.isCross ? 17 : opt.isLong ? 19 : 15;
  const dur = Math.max(1, Math.round(d / speed));
  // lead the receiver (into his path if he's making a run)
  const lead = leadPoint(c, m);
  const flight: Flight = {
    kind: opt.isCross ? "cross" : opt.isLong ? "long" : "pass",
    fromX: c.x, fromY: c.y, toX: lead.x, toY: lead.y, t: 0, dur, passer: c.idx, receiver: m.idx,
  };

  if (rng.next() < opt.pSuccess) {
    const key = `${c.idx}-${m.idx}`;
    s.analytics.links[key] = (s.analytics.links[key] ?? 0) + 1;
    c.st.passesCompleted++;
    team.stats.passesCompleted++;
  } else {
    // find a likely interceptor near the lane
    let interceptor: MPlayer | undefined;
    let best = 3;
    let at = 0.5;
    for (const o of onPitch(s, other(c.side))) {
      const seg = distToSegment(o.x, o.y, c.x, c.y, m.x, m.y);
      if (seg.t > 0.1 && seg.d < best) {
        best = seg.d;
        interceptor = o;
        at = seg.t;
      }
    }
    c.st.possessionLost++;
    const reads = interceptor
      ? 0.42 + (eff(interceptor, "anticipation") / 20) * 0.22 + (eff(interceptor, "positioning") / 20) * 0.14 + (eff(interceptor, "decisions") / 20) * 0.06
      : 0;
    if (interceptor) interceptor.st.interceptChances++;
    if (interceptor && rng.chance(reads)) {
      interceptor.st.interceptReads++;
      if (best < 0.5) interceptor.st.interceptions++;
      // a defender stretching in his own area often turns it behind
      // composed defenders keep it in play; flustered ones turn it behind
      if (relX(c.side, interceptor.x) > 0.8 && rng.chance(factor(eff(interceptor, "composure"), 0.36, 0.08))) {
        flight.toX = goalX(c.side);
        flight.toY = clamp(interceptor.y, 1, W - 1);
        flight.receiver = null;
        flight.out = { type: "corner", side: c.side, x: goalX(c.side), y: interceptor.y < CY ? 0 : W };
        s.lastPass = { passer: c.idx, receiver: m.idx, tick: s.tick };
        s.ball.owner = null;
        s.ball.flight = flight;
        s.dribbleTo = null;
        return;
      }
      flight.toX = lerp(c.x, m.x, at);
      flight.toY = lerp(c.y, m.y, at);
      flight.receiver = interceptor.idx;
      flight.dur = Math.max(1, Math.round(dist(c.x, c.y, flight.toX, flight.toY) / speed));
    } else {
      // misplaced: loose ball somewhere near the target
      const off = rng.range(4, 10);
      const ang = rng.range(0, Math.PI * 2);
      flight.toX = m.x + Math.cos(ang) * off;
      flight.toY = m.y + Math.sin(ang) * off;
      flight.receiver = null;
      flight.out = outOfPlay(c.side, flight.toX, flight.toY);
      const clearer = nearestOpponent(s, m).opp;
      const behind = clearer ? factor(eff(clearer, "heading"), 0.42, 0.18) : 0.3;
      if (opt.isCross && !flight.out && rng.chance(behind)) {
        flight.toX = goalX(c.side) + (c.side === 0 ? 1 : -1);
        flight.out = { type: "corner", side: c.side, x: goalX(c.side), y: c.y < CY ? 0 : W };
      }
    }
  }
  s.lastPass = { passer: c.idx, receiver: m.idx, tick: s.tick };
  s.ball.owner = null;
  s.ball.flight = flight;
  s.dribbleTo = null;
}

/** If (x,y) is out of play after `lastTouch` side touched it, return the restart. */
function outOfPlay(lastTouch: Side, x: number, y: number): Restart | undefined {
  const opp = other(lastTouch);
  if (y < 0 || y > W) return { type: "throwin", side: opp, x: clamp(x, 1, L - 1), y: y < 0 ? 0 : W };
  if (x < 0 || x > L) {
    const endAttackedByLastTouch = (x > L && lastTouch === 0) || (x < 0 && lastTouch === 1);
    if (endAttackedByLastTouch) {
      return { type: "goalkick", side: opp, x: x > L ? L - 5.5 : 5.5, y: CY };
    }
    return { type: "corner", side: opp, x: x > L ? L : 0, y: y < CY ? 0 : W };
  }
  return undefined;
}

function goalkeeper(s: MatchState, side: Side): MPlayer | undefined {
  return onPitch(s, side).find((p) => p.pos === "GK");
}

function resolveShot(s: MatchState, rng: Rng, c: MPlayer, opts: { header?: boolean; penalty?: boolean; xg?: number; fromCorner?: boolean; freeKick?: boolean } = {}) {
  const side = c.side;
  const team = s.teams[side];
  const gk = goalkeeper(s, other(side));
  const { d: pressure } = nearestOpponent(s, c);
  const bodies = opts.penalty ? 0 : bodiesInCone(s, c);
  const baseXg = opts.xg ?? shotQuality(s, c, pressure);
  const xg = opts.header ? baseXg * 0.6 : baseXg;
  const dGoal = dist(c.x, c.y, goalX(side), CY);
  const technique = eff(c, "technique");
  const skill = opts.penalty
    ? eff(c, "penalties")
    : opts.freeKick
      ? eff(c, "freeKicks")
      : opts.header
        ? eff(c, "heading") * 0.7 + eff(c, "jumping") * 0.3
        : dGoal > 18
          ? eff(c, "longShots") * 0.75 + technique * 0.25
          : eff(c, "finishing") * 0.8 + technique * 0.2;
  const composure = eff(c, "composure");
  // one-on-one: just the keeper to beat from close range
  const oneOnOne = !opts.penalty && !opts.header && dGoal < 14 && bodies === 0;
  const gkSkill = gk
    ? opts.penalty || oneOnOne
      ? eff(gk, "goalkeeping") * 0.5 + eff(gk, "oneOnOnes") * 0.5
      : eff(gk, "goalkeeping") * 0.8 + eff(gk, "agility") * 0.2
    : 5;

  // the closest defender's positioning decides whether he gets a body in the way
  const blocker = nearestOpponent(s, c).opp;
  const reading = blocker && blocker.pos !== "GK" ? factor((eff(blocker, "positioning") + eff(blocker, "bravery")) / 2, 0.7, 1.3) : 1;
  const blockChance =
    opts.penalty || opts.header ? 0 : clamp(((pressure < 1.5 ? 0.3 : pressure < 3 ? 0.15 : 0.04) + bodies * 0.08) * reading, 0, 0.65);
  const nerve = 0.9 + composure / 100;
  const pGoal = clamp(xg * (0.7 + skill / 20) * (1.22 - gkSkill / 25) * nerve, 0.005, 0.95);
  // Recorded xG is the real chance of this shot going in, so xG and goals agree over time.
  const chance = pGoal * (1 - blockChance);

  c.st.shots++;
  c.st.xg += chance;
  // key pass: the ball that set up this shot
  if (!opts.penalty && s.lastPass && s.lastPass.receiver === c.idx && s.tick - s.lastPass.tick < 10 && s.players[s.lastPass.passer].side === c.side) {
    s.players[s.lastPass.passer].st.keyPasses++;
  }
  team.stats.shots++;
  team.stats.xg += chance;

  let result: ShotOutcome["result"];
  let corner = false;
  if (rng.chance(blockChance)) {
    result = "blocked";
    corner = rng.chance(blocker ? factor(eff(blocker, "composure"), 0.72, 0.48) : 0.6);
  } else {
    const pOnTarget = clamp(pGoal + (1 - pGoal) * (0.22 + skill / 70), 0, 0.98);
    const r = rng.next();
    if (r < pGoal) result = "goal";
    else if (r < pOnTarget) {
      // safe hands hold it; others parry, sometimes into danger
      result = gk && rng.chance(0.3 + eff(gk, "handling") / 40) ? "held" : "saved";
      // good keepers parry into safe areas instead of behind
      corner = result === "saved" && rng.chance(factor(gkSkill, 0.8, 0.3));
    } else result = "wide";
  }

  const gx = goalX(side);
  const onFrame = result === "goal" || result === "saved" || result === "held";
  const toY = onFrame ? CY + rng.range(-GOAL_WIDTH / 2 + 0.3, GOAL_WIDTH / 2 - 0.3) : CY + (rng.chance(0.5) ? 1 : -1) * rng.range(4.2, 9);
  const toX = result === "blocked" ? lerp(c.x, gx, 0.08) : result === "saved" || result === "held" ? (gk ? gk.x : gx) : gx + (side === 0 ? 1 : -1) * 0.8;
  s.ball.owner = null;
  s.ball.flight = {
    kind: "shot",
    fromX: c.x, fromY: c.y, toX, toY: result === "blocked" ? c.y : toY,
    t: 0, dur: Math.max(1, Math.round(dGoal / 28)), passer: c.idx, receiver: null,
    shot: { shooter: c.idx, result, xg: chance, header: !!opts.header, penalty: !!opts.penalty, corner, setPiece: !!opts.fromCorner || !!opts.freeKick },
  };
  s.dribbleTo = null;
}

function finishShot(s: MatchState, rng: Rng, f: Flight) {
  const sh = f.shot!;
  const c = s.players[sh.shooter];
  const side = c.side;
  // where the shot was taken from, for shot maps
  const loc = { x: Math.round(relX(side, f.fromX) * 1000) / 1000, y: Math.round(relY(side, f.fromY) * 1000) / 1000, setPiece: sh.setPiece || undefined };
  const opp = other(side);
  const team = s.teams[side];
  const gk = goalkeeper(s, opp);
  if (sh.result === "goal" || sh.result === "saved" || sh.result === "held") {
    c.st.shotsOnTarget++;
    team.stats.shotsOnTarget++;
  }
  switch (sh.result) {
    case "goal": {
      s.score[side]++;
      c.st.goals++;
      let assist: string | undefined;
      if (s.lastPass && s.lastPass.receiver === c.idx && s.tick - s.lastPass.tick < 15 && s.players[s.lastPass.passer].side === side) {
        const a = s.players[s.lastPass.passer];
        a.st.assists++;
        assist = a.id;
      }
      if (gk) gk.st.conceded++;
      for (const p of onPitch(s, opp)) if (p.pos !== "GK") p.st.conceded++;
      emit(s, "goal", side, { player: c.id, other: assist, xg: sh.xg, header: sh.header, penalty: sh.penalty, score: [...s.score] as [number, number], ...loc });
      // the scorer is buzzing, the side lifts; the other side sags
      feel(s, c, { conf: 0.3, nerves: -0.2 });
      if (assist) feel(s, s.players.find((p) => p.id === assist)!, { conf: 0.2 });
      teamFeel(s, side, { conf: 0.06, nerves: -0.12 }, c);
      teamFeel(s, opp, { conf: -0.07, frus: 0.06 });
      if (gk) feel(s, gk, { conf: -0.12 });
      setRestart(s, { type: "kickoff", side: opp, x: L / 2, y: CY }, 6);
      break;
    }
    case "saved":
    case "held": {
      if (gk) {
        gk.st.saves++;
        s.teams[opp].stats.saves++;
      }
      emit(s, sh.xg > 0.25 ? "big_save" : "shot_saved", side, { player: c.id, other: gk?.id, xg: sh.xg, header: sh.header, penalty: sh.penalty, ...loc });
      if (sh.xg > 0.25) {
        feel(s, c, { conf: sh.penalty ? -0.3 : -0.12, frus: 0.1 });
        if (gk) feel(s, gk, { conf: 0.15, nerves: -0.1 });
      }
      if (sh.corner) {
        setRestart(s, { type: "corner", side, x: goalX(side), y: f.toY < CY ? 0 : W }, 4);
      } else if (sh.result === "held" && gk) {
        giveBall(s, gk, rng);
        s.holdTimer = 3;
      } else {
        // parried into the area
        s.ball.x = clamp(f.toX + (side === 0 ? -1 : 1) * rng.range(6, 16), 1, L - 1);
        s.ball.y = clamp(f.toY + (rng.chance(0.5) ? 1 : -1) * rng.range(6, 18), 1, W - 1);
      }
      break;
    }
    case "wide":
      emit(s, "shot_wide", side, { player: c.id, xg: sh.xg, header: sh.header, penalty: sh.penalty, ...loc });
      // missing a sitter stings
      if (sh.xg > 0.2) feel(s, c, { conf: sh.penalty ? -0.35 : -0.15, frus: 0.08 });
      setRestart(s, { type: "goalkick", side: opp, x: goalX(side) + (side === 0 ? -5.5 : 5.5), y: CY }, 4);
      break;
    case "blocked":
      emit(s, "shot_blocked", side, { player: c.id, xg: sh.xg, ...loc });
      if (sh.corner) setRestart(s, { type: "corner", side, x: goalX(side), y: c.y < CY ? 0 : W }, 4);
      else {
        s.ball.x = clamp(c.x + (side === 0 ? -1 : 1) * rng.range(2, 8), 1, L - 1);
        s.ball.y = clamp(c.y + rng.range(-6, 6), 1, W - 1);
      }
      break;
  }
}

function setRestart(s: MatchState, r: Restart, timer: number) {
  s.phase = "dead";
  s.restart = r;
  s.deadTimer = timer;
  s.ball.owner = null;
  s.ball.flight = null;
  s.ball.x = r.x;
  s.ball.y = r.y;
  s.possession = r.side;
  s.dribbleTo = null;
  if (r.type === "corner") {
    s.teams[r.side].stats.corners++;
    emit(s, "corner", r.side);
  }
}

/** The designated set-piece taker, if he's on the pitch. */
/**
 * Who takes a set piece: the designated taker if he's on the pitch, otherwise
 * the best outfield player for it. Goalkeepers never take penalties, free
 * kicks or corners.
 */
function designated(s: MatchState, side: Side, kind: "penalty" | "freeKick" | "corner"): MPlayer {
  const outfield = onPitch(s, side).filter((p) => p.pos !== "GK");
  const pool = outfield.length ? outfield : onPitch(s, side);
  const id = s.teams[side].setPieces?.[kind];
  const chosen = id ? pool.find((p) => p.id === id) : undefined;
  if (chosen) return chosen;
  const score = (p: MPlayer) =>
    kind === "penalty" ? p.attrs.penalties * 2 + p.attrs.composure : kind === "freeKick" ? p.attrs.freeKicks * 2 + p.attrs.technique : p.attrs.crossing * 2 + p.attrs.technique;
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

function takeRestart(s: MatchState, rng: Rng) {
  const r = s.restart!;
  s.phase = "play";
  s.restart = null;
  const team = onPitch(s, r.side);
  if (r.type === "kickoff") {
    resetForKickoff(s);
    const st = team.filter((p) => p.pos !== "GK").sort((a, b) => dist(a.x, a.y, L / 2, CY) - dist(b.x, b.y, L / 2, CY))[0];
    st.x = L / 2;
    st.y = CY;
    giveBall(s, st, rng);
    s.holdTimer = 0;
    return;
  }
  if (r.type === "goalkick") {
    const gk = goalkeeper(s, r.side);
    if (gk) {
      gk.x = r.x;
      gk.y = r.y;
      giveBall(s, gk, rng);
      s.holdTimer = 0;
      return;
    }
  }
  if (r.type === "corner") {
    takeCorner(s, rng, r);
    return;
  }
  if (r.type === "penalty") {
    const taker = designated(s, r.side, "penalty");
    taker.x = r.x;
    taker.y = r.y;
    taker.px = taker.x;
    taker.py = taker.y;
    s.ball.x = r.x;
    s.ball.y = r.y;
    resolveShot(s, rng, taker, { penalty: true, xg: 0.76 });
    return;
  }
  // throw-in / free kick: nearest player takes it
  const taker = [...team].filter((p) => p.pos !== "GK" || r.type === "freekick").sort((a, b) => dist(a.x, a.y, r.x, r.y) - dist(b.x, b.y, r.x, r.y))[0];
  taker.x = r.x;
  taker.y = r.y;
  giveBall(s, taker, rng);
  s.holdTimer = 0;
  if (r.type === "freekick") {
    const dGoal = dist(r.x, r.y, goalX(r.side), CY);
    const best = designated(s, r.side, "freeKick");
    // a confident free-kick specialist goes for goal more often
    if (dGoal < 30 && rng.chance(factor(eff(best, "freeKicks"), 0.15, 0.75))) {
      best.x = r.x;
      best.y = r.y;
      s.ball.owner = best.idx;
      const drilled = (s.teams[r.side].prep.setPiecesAttack ? 1.1 : 1) * (s.teams[other(r.side)].prep.setPiecesDefence ? 0.9 : 1);
      resolveShot(s, rng, best, { xg: xgAt(r.side, r.x, r.y) * 0.75 * drilled, freeKick: true });
    }
  }
}

function takeCorner(s: MatchState, rng: Rng, r: Restart) {
  const side = r.side;
  const att = onPitch(s, side).filter((p) => p.pos !== "GK");
  const def = onPitch(s, other(side));
  const taker = designated(s, side, "corner");
  taker.x = r.x;
  taker.y = r.y;
  let routine = s.teams[side].setPieces?.cornerRoutine ?? "mixed";
  if (routine === "mixed") routine = rng.chance(0.5) ? "near" : "far";
  const toward = side === 0 ? -1 : 1; // from the goal line into the pitch

  const others = att.filter((p) => p !== taker);
  if (!others.length) {
    // nobody to aim at (a depleted side): just play it out
    giveBall(s, taker, rng);
    return;
  }
  if (routine === "short") {
    // play it short and build from there
    const mate = [...others].sort((a, b) => dist(a.x, a.y, r.x, r.y) - dist(b.x, b.y, r.x, r.y))[0];
    mate.x = clamp(r.x + toward * 6, 1, L - 1);
    mate.y = clamp(r.y + (r.y < CY ? 7 : -7), 1, W - 1);
    taker.st.passes++;
    taker.st.passesCompleted++;
    s.teams[side].stats.passes++;
    s.teams[side].stats.passesCompleted++;
    giveBall(s, mate, rng);
    return;
  }

  const near = routine === "near";
  // near post: quick flick-ons at the front; far post: big men attacking the back stick
  const targets = att.filter((p) => p !== taker);
  const power = near ? 2 : 4;
  const target = targets[rng.weighted(targets.map((p) => Math.pow(aerial(p), power)))];
  const marker = [...def].filter((p) => p.pos !== "GK").sort((a, b) => aerial(b) + b.attrs.marking - (aerial(a) + a.attrs.marking))[0];
  const gk = goalkeeper(s, other(side));
  const fromTop = r.y < CY;
  const spotX = goalX(side) + toward * (near ? rng.range(4, 7) : rng.range(7, 12));
  const spotY = CY + (near === fromTop ? -1 : 1) * rng.range(1, 5);
  target.x = spotX;
  target.y = spotY;
  if (marker) {
    marker.x = spotX + (side === 0 ? 0.8 : -0.8);
    marker.y = spotY + 0.5;
  }
  taker.st.passes++;
  s.teams[side].stats.passes++;
  const aH = aerial(target);
  const dH = marker ? aerial(marker) : 11;
  const gkClaim = gk ? (eff(gk, "aerialReach") / 20) * 0.18 * (near ? 0.7 : 1.2) : 0;
  const delivery = 0.75 + (eff(taker, "crossing") * 0.7 + eff(taker, "technique") * 0.3) / 80;
  // set pieces drilled in the build-up
  const drilled = (s.teams[side].prep.setPiecesAttack ? 1.12 : 1) * (s.teams[other(side)].prep.setPiecesDefence ? 0.88 : 1);
  const pWin = clamp((0.33 + (near ? 0.03 : 0) + (aH - dH) * (near ? 0.011 : 0.018)) * delivery * drilled, 0.1, 0.72);
  const roll = rng.next();
  if (roll < gkClaim && gk) {
    giveBall(s, gk, rng);
    gk.x = spotX;
    gk.y = spotY;
    s.holdTimer = 3;
    return;
  }
  if (roll < gkClaim + pWin * (1 - gkClaim)) {
    taker.st.passesCompleted++;
    s.teams[side].stats.passesCompleted++;
    s.lastPass = { passer: taker.idx, receiver: target.idx, tick: s.tick };
    s.ball.x = spotX;
    s.ball.y = spotY;
    resolveShot(s, rng, target, { header: true, fromCorner: true });
    return;
  }
  // cleared
  const clearer = marker ?? def[0];
  s.ball.owner = null;
  s.ball.flight = {
    kind: "clear", fromX: spotX, fromY: spotY,
    toX: spotX + (side === 0 ? -1 : 1) * rng.range(15, 35), toY: clamp(spotY + rng.range(-20, 20), 2, W - 2),
    t: 0, dur: 2, passer: clearer.idx, receiver: null,
  };
}

function tryTackle(s: MatchState, rng: Rng, c: MPlayer): boolean {
  // closest defender who is ready to challenge
  let opp: MPlayer | undefined;
  let best = 1.8;
  for (const o of onPitch(s, other(c.side))) {
    if (o.duelCd > 0) continue;
    const d = dist(o.x, o.y, c.x, c.y);
    if (d < best) {
      best = d;
      opp = o;
    }
  }
  if (!opp) return false;
  const ins = insOf(s.teams[opp.side]);
  const hard = tackleBias(s, opp, c);
  const attempt = (0.024 + (ins.pressing - 3) * 0.01 + (eff(opp, "workRate") / 20) * 0.02) * Math.max(0.4, 1 + 0.3 * hard);
  opp.duelCd = 6;
  if (!rng.chance(attempt)) return false;
  opp.st.tackles++;
  if (challengeFoul(s, rng, opp, c)) return true;
  const pWin = clamp(
    0.46 + (eff(opp, "tackling") - eff(c, "dribbling")) * 0.03 + (eff(opp, "strength") - eff(c, "balance")) * 0.006 + (eff(opp, "strength") - eff(c, "strength")) * 0.004 + 0.03 * hard,
    0.15,
    0.82,
  );
  if (rng.chance(pWin)) {
    duelLost(s, rng, opp, c);
    return true;
  }
  tacticalFoul(s, rng, opp, c);
  return false;
}

/**
 * How hard `opp` goes into challenges on `c`: his own instruction plus any
 * opposition instruction on `c` (−1 softer … +1 harder, more with analysis).
 */
function tackleBias(s: MatchState, opp: MPlayer, c: MPlayer): number {
  const oi = c.oi?.tackle === "hard" ? 1 : c.oi?.tackle === "soft" ? -1 : 0;
  const prepK = s.teams[opp.side].prep.opposition ? 1.3 : 1;
  return clamp((opp.fx.tackle ?? 0) + oi * prepK, -1.5, 1.5);
}

/** A beaten defender sometimes brings the runner down. */
function tacticalFoul(s: MatchState, rng: Rng, opp: MPlayer, c: MPlayer): boolean {
  const ownBox = relX(c.side, c.x) > 0.843 && Math.abs(c.y - CY) < 20.16;
  // hot-heads and streetwise defenders take one for the team
  const cynical = factor(traits(opp).aggression, 0.3, 1.8) * factor(eff(opp, "decisions"), 0.8, 1.2);
  if (!rng.chance((ownBox ? 0.04 : 0.16) * cynical)) return false;
  foul(s, rng, opp, c);
  return true;
}

/**
 * Every challenge risks a foul before it's won or lost: poor technique, a hot
 * temper, tired legs and a tricky opponent all make it more likely.
 */
function challengeFoul(s: MatchState, rng: Rng, opp: MPlayer, c: MPlayer): boolean {
  const ownBox = relX(c.side, c.x) > 0.843 && Math.abs(c.y - CY) < 20.16;
  const foulChance =
    0.14 *
    factor(eff(opp, "tackling"), 1.6, 0.45) *
    factor(traits(opp).aggression, 0.35, 1.85) *
    (1 + (1 - opp.energy) * 0.8) *
    factor((eff(c, "dribbling") + eff(c, "pace")) / 2, 0.8, 1.25) *
    (ownBox ? 0.3 : 1) *
    (opp.teamShout === "demand" ? 1.2 : opp.teamShout === "calm" ? 0.75 : 1) *
    Math.max(0.5, 1 + 0.35 * tackleBias(s, opp, c)) *
    (1 + 0.8 * opp.emo.frus);
  if (!rng.chance(foulChance)) return false;
  foul(s, rng, opp, c);
  return true;
}

/** Defender `opp` wins a clean duel with carrier `c`. */
function duelLost(s: MatchState, rng: Rng, opp: MPlayer, c: MPlayer) {
  opp.st.tacklesWon++;
  feel(s, opp, { conf: 0.04 });
  feel(s, c, { conf: -0.02, frus: 0.02 });
  s.teams[opp.side].stats.tackles++;
  c.st.possessionLost++;
  if (rng.chance(0.65)) giveBall(s, opp, rng);
  else {
    // ball runs loose
    s.ball.owner = null;
    s.ball.x = clamp(c.x + rng.range(-3, 3), 0.5, L - 0.5);
    s.ball.y = clamp(c.y + rng.range(-3, 3), 0.5, W - 0.5);
    s.dribbleTo = null;
  }
  if (rng.chance(0.08)) emit(s, "tackle", opp.side, { player: opp.id, other: c.id });
}

function foul(s: MatchState, rng: Rng, offender: MPlayer, victim: MPlayer) {
  const side = offender.side;
  offender.st.fouls++;
  s.teams[side].stats.fouls++;
  const vSide = victim.side;
  const inBox = relX(vSide, victim.x) > 0.843 && Math.abs(victim.y - CY) < 20.16;
  const dangerous = relX(vSide, victim.x) > 0.7;
  emit(s, "foul", side, { player: offender.id, other: victim.id });

  const temper = traits(offender).aggression;
  // booked players are more careful with the next challenge (if they're sensible)
  const careful = offender.yellow ? factor(eff(offender, "decisions"), 0.7, 0.2) : 1;
  const cardChance = (0.13 + (dangerous ? 0.08 : 0) + (inBox ? 0.1 : 0)) * factor(temper, 0.35, 1.8) * careful * (1 + 0.6 * offender.emo.frus);
  // the victim's temper flares; the offender's boils over if things aren't going his way
  feel(s, victim, { frus: 0.06 });
  if (rng.chance(0.001 * Math.pow(temper / 10.5, 2) * (1 + 1.1 * offender.emo.frus))) {
    sendOff(s, offender, "red");
  } else if (rng.chance(cardChance)) {
    offender.yellow++;
    s.teams[side].stats.yellows++;
    emit(s, "yellow", side, { player: offender.id });
    feel(s, offender, { frus: 0.12 });
    if (offender.yellow >= 2) sendOff(s, offender, "second");
  }

  // a player who has lost his head argues with the referee
  if (victim.emo.frus > 0.85 && !victim.sentOff && rng.chance(0.035 * factor(traits(victim).sportsmanship ?? 10, 1.6, 0.3))) {
    victim.yellow++;
    s.teams[vSide].stats.yellows++;
    emit(s, "yellow", vSide, { player: victim.id, text: "dissent" });
    if (victim.yellow >= 2) sendOff(s, victim, "second");
  }

  // fragile, tired players hit by a reckless challenge get hurt
  const hurt =
    0.018 * factor(traits(victim).injuryProneness, 0.3, 1.9) * factor(temper, 0.7, 1.4) * (1 + (1 - victim.energy) * 1.2);
  if (rng.chance(hurt)) {
    victim.injured = true;
    emit(s, "injury", vSide, { player: victim.id });
  }

  if (inBox) {
    const spot = goalX(vSide) + (vSide === 0 ? -11 : 11);
    emit(s, "penalty", vSide, { player: victim.id });
    setRestart(s, { type: "penalty", side: vSide, x: spot, y: CY }, 5);
  } else {
    if (dist(victim.x, victim.y, goalX(vSide), CY) < 30) emit(s, "freekick", vSide, { player: victim.id });
    setRestart(s, { type: "freekick", side: vSide, x: clamp(victim.x, 1, L - 1), y: clamp(victim.y, 1, W - 1) }, 3);
  }
}

function sendOff(s: MatchState, p: MPlayer, kind: "red" | "second") {
  p.sentOff = true;
  p.onPitch = false;
  invalidatePitch(s);
  s.teams[p.side].stats.reds++;
  emit(s, "red", p.side, { player: p.id, text: kind });
  if (s.ball.owner === p.idx) s.ball.owner = null;
  // down to ten: the side is rattled and angry
  teamFeel(s, p.side, { frus: 0.08, nerves: 0.06 });
}

/** Sample positions (heatmaps, average positions) and attacking momentum. */
function recordAnalytics(s: MatchState) {
  const a = s.analytics;
  if (s.tick % 3 === 0) {
    for (const p of s.players) {
      if (!p.onPitch) continue;
      const rx = clamp(relX(p.side, p.x), 0, 0.999);
      const ry = clamp(relY(p.side, p.y), 0, 0.999);
      a.heat[p.idx][Math.floor(ry * HEAT_ROWS) * HEAT_COLS + Math.floor(rx * HEAT_COLS)]++;
      const ps = a.pos[p.idx];
      ps[0] += rx;
      ps[1] += ry;
      ps[2]++;
    }
  }
  if (s.phase === "play") {
    const m = minuteOf(s) - 1;
    const side = s.possession;
    a.momentum[m] = (a.momentum[m] ?? 0) + (side === 0 ? 1 : -1) * threat(side, s.ball.x, s.ball.y);
  }
}

/** Non-contact injuries (hamstrings, calves): fragile and exhausted players are at risk. */
function muscleInjuries(s: MatchState, rng: Rng) {
  let total = 0;
  const risks: number[] = [];
  const field = [...onPitch(s, 0), ...onPitch(s, 1)];
  for (const p of field) {
    const r = p.injured ? 0 : 3e-7 * Math.pow(traits(p).injuryProneness / 10.5, 2) * (1 + 4 * (1 - p.energy) ** 2);
    risks.push(r);
    total += r;
  }
  if (!(rng.next() < total)) return;
  const p = field[rng.weighted(risks)];
  p.injured = true;
  emit(s, "injury", p.side, { player: p.id, text: "muscle" });
}

// ───────────────────────────── AI manager ─────────────────────────────

function aiManage(s: MatchState) {
  const minute = minuteOf(s);
  for (const side of [0, 1] as Side[]) {
    const team = s.teams[side];
    const ps = team.playerIdx.map((i) => s.players[i]);
    // Injuries: always replace, even for human sides (assistant manager)
    for (const p of ps.filter((x) => x.onPitch && x.injured)) {
      const bench = ps.filter((b) => !b.used && !b.onPitch);
      const rep = pickReplacement(bench, p.pos);
      if (rep && makeSub(s, side, p.id, rep.id)) continue;
      p.injured = false; // plays on
    }
    if (!team.isAI || s.tick % 60 !== 0) continue;
    const diff = s.score[side] - s.score[other(side)];
    if (team.manager) {
      aiReview(s, side, minute, diff);
      aiSubs(s, side, minute, diff);
      if (minute === 74 && diff < 0 && team.shout !== "push") setShout(s, side, "push");
      if (minute === 80 && diff > 0 && team.shout !== "focus") setShout(s, side, "focus");
      // tempers flaring: calm them down
      if (team.shout !== "calm" && onPitch(s, side).some((p) => p.emo.frus > 0.75) && team.manager.knowledge >= 8) setShout(s, side, "calm");
      continue;
    }
    if (minute === 65 && diff < 0 && team.instructions.mentality < 5) {
      team.instructions = { ...team.instructions, mentality: team.instructions.mentality + 1 };
      emit(s, "tactics", side);
    }
    if (minute === 80 && diff < 0 && team.instructions.mentality < 5) {
      team.instructions = { ...team.instructions, mentality: 5, pressing: Math.min(5, team.instructions.pressing + 1) };
      emit(s, "tactics", side);
    }
    if (minute === 82 && diff === 1 && team.instructions.mentality > 2) {
      team.instructions = { ...team.instructions, mentality: 2 };
      emit(s, "tactics", side);
    }
    // AI touchline shouts: chase the game or see it out
    if (minute === 74 && diff < 0 && team.shout !== "push") setShout(s, side, "push");
    if (minute === 80 && diff > 0 && team.shout !== "focus") setShout(s, side, "focus");
    if ((minute === 60 || minute === 70 || minute === 78) && team.subsUsed < MAX_SUBS) {
      const tired = ps.filter((p) => p.onPitch && p.pos !== "GK").sort((a, b) => a.energy - b.energy)[0];
      if (tired && tired.energy < 0.78) {
        const rep = pickReplacement(ps.filter((b) => !b.used && !b.onPitch), tired.pos);
        if (rep) makeSub(s, side, tired.id, rep.id);
      }
    }
  }
}

const ATTACKING_SHAPES: FormationId[] = ["4-3-3", "3-5-2", "4-2-3-1"];
const DEFENSIVE_SHAPES: FormationId[] = ["5-3-2", "4-4-2"];

/** Deterministic "does he make the right call" roll from the match clock (no RNG draw, so replays stay identical). */
function wiseCall(s: MatchState, side: Side, knowledge: number): boolean {
  return ((s.tick * 7919 + side * 104729) % 1000) / 1000 < 0.35 + (knowledge / 20) * 0.6;
}

function aiInstructions(s: MatchState, side: Side, patch: Partial<TeamInstructions>, why: string) {
  const team = s.teams[side];
  const next = { ...team.instructions };
  for (const [k, v] of Object.entries(patch) as [keyof TeamInstructions, number][]) next[k] = clamp(Math.round(v), 1, 5);
  if (JSON.stringify(next) === JSON.stringify(team.instructions)) return false;
  team.instructions = next;
  refreshTeam(s, side);
  emit(s, "tactics", side, { text: why });
  return true;
}

function aiFormation(s: MatchState, side: Side, f: FormationId, why: string) {
  const team = s.teams[side];
  if (team.formation === f) return false;
  changeFormation(s, side, f);
  refreshTeam(s, side);
  emit(s, "tactics", side, { text: why });
  return true;
}

/**
 * An AI manager reads the game every few minutes (more often if he's
 * adaptable, and right after goals) and reacts: numbers down, chasing or
 * protecting a lead, being outplayed, sterile possession, the opponent
 * going for it, a dangerous player. Better tactical knowledge, better calls.
 */
function aiReview(s: MatchState, side: Side, minute: number, diff: number) {
  const team = s.teams[side];
  const m = team.manager!;
  const o = other(side);
  const opp = s.teams[o];
  const interval = Math.round(16 - m.adaptability * 0.5) * 60;
  const lastGoal = [...s.events].reverse().find((e) => e.type === "goal");
  const reactToGoal = m.adaptability >= 8 && lastGoal && lastGoal.tick > (team.aiReview ?? 0) && s.tick - lastGoal.tick > 120;
  if (minute < 12 || (!reactToGoal && s.tick - (team.aiReview ?? 0) < interval)) return;
  team.aiReview = s.tick;
  const ins = team.instructions;
  const wise = wiseCall(s, side, m.knowledge);
  const mine = onPitch(s, side).length;
  const theirs = onPitch(s, o).length;
  const xgF = team.stats.xg;
  const xgA = opp.stats.xg;
  const poss = team.stats.possessionTicks / Math.max(1, team.stats.possessionTicks + opp.stats.possessionTicks);
  const knows = (list: FormationId[]) => m.formations.find((f) => list.includes(f));

  // a man down: tighten up
  if (mine < theirs && ins.mentality > 2) {
    aiInstructions(s, side, { mentality: ins.mentality - 1, defensiveLine: ins.defensiveLine - 1, pressing: ins.pressing - 1 }, "down to ten: tightening up");
    return;
  }
  // a man up: go for it
  if (mine > theirs && ins.mentality < 4 && diff <= 0) {
    aiInstructions(s, side, { mentality: ins.mentality + 1, width: ins.width + 1 }, "an extra man: pushing on");
    return;
  }
  // chasing the game
  if (diff < 0 && minute >= 55) {
    if (minute >= 72 && wise) {
      const shape = knows(ATTACKING_SHAPES);
      if (shape && !ATTACKING_SHAPES.includes(team.formation) && aiFormation(s, side, shape, `chasing it: switching to ${shape}`)) return;
    }
    aiInstructions(s, side, { mentality: ins.mentality + 1, pressing: minute >= 70 ? ins.pressing + 1 : ins.pressing, tempo: ins.tempo + (minute >= 70 ? 1 : 0) }, "chasing the game");
    return;
  }
  // protecting a lead
  if (diff > 0 && minute >= 70) {
    if (diff === 1 && minute >= 80 && wise) {
      const shape = knows(DEFENSIVE_SHAPES);
      if (shape && aiFormation(s, side, shape, `protecting the lead: switching to ${shape}`)) return;
    }
    if (ins.mentality > 2 || ins.defensiveLine > 2) {
      aiInstructions(s, side, { mentality: ins.mentality - 1, defensiveLine: ins.defensiveLine - 1, tempo: ins.tempo - 1 }, "seeing the game out");
      return;
    }
  }
  // being outplayed
  if (minute >= 25 && xgA - xgF > 0.8 && diff <= 0 && wise) {
    aiInstructions(s, side, { defensiveLine: ins.defensiveLine - 1, mentality: Math.max(2, ins.mentality - 1), pressing: ins.pressing + (opp.instructions.directness <= 2 ? 1 : 0) }, "being outplayed: closing the space");
    return;
  }
  // the opponent goes for it: hit them on the break
  if (opp.instructions.mentality >= 4 && ins.defensiveLine > 2 && wise) {
    aiInstructions(s, side, { defensiveLine: ins.defensiveLine - 1, tempo: ins.tempo + 1, directness: ins.directness + 1 }, "they've gone for it: counter-attacking");
    return;
  }
  // lots of the ball, little threat
  if (minute >= 35 && poss > 0.6 && team.stats.shots < 4 && diff <= 0 && wise) {
    aiInstructions(s, side, { tempo: ins.tempo + 1, width: ins.width + 1, directness: ins.directness + 1 }, "sterile possession: more urgency");
    return;
  }
  // a dangerous opponent: put a man on him
  const threat = (p: MPlayer) => p.st.dribbles + p.st.keyPasses * 2 + p.st.shots;
  const danger = onPitch(s, o).filter((p) => p.pos !== "GK").sort((a, b) => threat(b) - threat(a))[0];
  if (danger && threat(danger) >= 5 && !team.opposition[danger.id]?.markTight && m.knowledge >= 8) {
    team.opposition[danger.id] = { ...team.opposition[danger.id], markTight: true };
    danger.oi = team.opposition[danger.id];
    emit(s, "tactics", side, { text: `tight marking on ${danger.shortName}` });
  }
}

/** Tired legs off at the usual times; an extra attacker when chasing. */
function aiSubs(s: MatchState, side: Side, minute: number, diff: number) {
  const team = s.teams[side];
  if (team.subsUsed >= MAX_SUBS) return;
  const ps = team.playerIdx.map((i) => s.players[i]);
  const bench = ps.filter((b) => !b.used && !b.onPitch && !b.sentOff);
  if (minute === 64 && diff < 0) {
    const off = ps.filter((p) => p.onPitch && (p.pos === "CB" || p.pos === "DM" || p.pos === "LB" || p.pos === "RB")).sort((a, b) => playerRating(s, a) - playerRating(s, b))[0];
    const on = bench.filter((b) => ["ST", "AM", "LW", "RW"].includes(b.naturalPositions[0])).sort((a, b) => benchScore(b, "ST") - benchScore(a, "ST"))[0];
    if (off && on && makeSub(s, side, off.id, on.id)) return;
  }
  if (minute === 60 || minute === 70 || minute === 78) {
    const tired = ps.filter((p) => p.onPitch && p.pos !== "GK").sort((a, b) => a.energy - b.energy)[0];
    // a player who has lost his head comes off before he gets sent off
    const hothead = ps.find((p) => p.onPitch && p.yellow > 0 && p.emo.frus > 0.7);
    const target = hothead ?? (tired && tired.energy < 0.78 ? tired : undefined);
    if (target) {
      const rep = pickReplacement(bench, target.pos);
      if (rep) makeSub(s, side, target.id, rep.id);
    }
  }
}

function setShout(s: MatchState, side: Side, shout: ShoutId | null) {
  const team = s.teams[side];
  team.shout = shout;
  for (const i of team.playerIdx) s.players[i].teamShout = shout;
  const lift: Record<ShoutId, Feeling> = {
    encourage: { conf: 0.08 },
    demand: { frus: 0.06, conf: 0.03 },
    calm: { frus: -0.25, nerves: -0.15 },
    push: { conf: 0.03 },
    focus: { nerves: -0.06 },
  };
  if (shout) teamFeel(s, side, lift[shout]);
  emit(s, "shout", side, { text: shout ?? "none" });
}

function pickReplacement(bench: MPlayer[], pos: Position): MPlayer | undefined {
  return [...bench].sort((a, b) => benchScore(b, pos) - benchScore(a, pos))[0];
}

function benchScore(p: MPlayer, pos: Position) {
  const f = familiarity({ positions: p.naturalPositions }, pos);
  const keys = Object.keys(p.attrs) as AttributeKey[];
  const avg = keys.reduce((a, k) => a + p.attrs[k], 0) / keys.length;
  return avg * f;
}

// ───────────────────────────── main step ─────────────────────────────

export function isFinished(s: MatchState) {
  return s.phase === "fulltime";
}

/** Advance the simulation by one second of game time. */
export function stepMatch(s: MatchState): void {
  if (s.phase === "fulltime") return;
  const rng = new Rng(s.rngState);

  if (s.phase === "halftime") {
    // AI managers give their half-time team talk
    for (const t of s.teams) {
      if (t.isAI && !t.talk) {
        const diff = s.score[t.side] - s.score[other(t.side)];
        giveTeamTalk(s, t.side, diff < 0 ? "demand" : diff > 0 ? "praise" : "encourage");
      }
    }
    s.half = 2;
    s.halfStartTick = s.tick;
    s.halfLength = HALF_TICKS + s.stoppage[1];
    setRestart(s, { type: "kickoff", side: other(s.kickoffSide), x: L / 2, y: CY }, 2);
    resetForKickoff(s);
    for (const p of s.players) {
      p.px = p.x;
      p.py = p.y;
      p.energy = clamp(p.energy + 0.06, 0, 1); // half-time recovery
    }
    emit(s, "kickoff", other(s.kickoffSide));
    s.rngState = rng.getState();
    return;
  }

  s.tick++;
  s.ball.px = s.ball.x;
  s.ball.py = s.ball.y;

  // possession stat
  s.teams[s.possession].stats.possessionTicks++;

  if (s.phase === "dead") {
    updateTargets(s);
    if (s.restart?.type === "corner") positionForCorner(s, s.restart);
    movePlayers(s);
    s.deadTimer--;
    if (s.deadTimer <= 0 && s.restart) takeRestart(s, rng);
  } else {
    playTick(s, rng);
  }

  if (s.phase === "play") muscleInjuries(s, rng);
  if (s.tick % 60 === 0) emotionMinute(s);
  recordAnalytics(s);
  aiManage(s);

  // end of half
  if (s.tick - s.halfStartTick >= s.halfLength && s.phase === "play" && !s.ball.flight) {
    if (s.half === 1) {
      s.phase = "halftime";
      emit(s, "halftime", 0, { score: [...s.score] as [number, number] });
    } else {
      s.phase = "fulltime";
      emit(s, "fulltime", 0, { score: [...s.score] as [number, number] });
    }
  }
  s.rngState = rng.getState();
}

function positionForCorner(s: MatchState, r: Restart) {
  const side = r.side;
  const gx = goalX(side);
  const dir = side === 0 ? -1 : 1;
  for (const p of onPitch(s, side)) {
    if (p.pos === "GK") continue;
    const slot = FORMATIONS[s.teams[side].formation][p.slot];
    if (slot.x > 0.3) {
      p.tx = gx + dir * (6 + (p.hash % 8));
      p.ty = CY + ((p.hash % 15) - 7);
    }
  }
  for (const p of onPitch(s, other(side))) {
    if (p.pos === "GK") {
      p.tx = gx + dir * 1;
      p.ty = CY;
      continue;
    }
    p.tx = gx + dir * (4 + (p.hash % 9));
    p.ty = CY + ((p.hash % 17) - 8);
  }
}

function playTick(s: MatchState, rng: Rng) {
  const ball = s.ball;

  // 1. Ball in flight
  if (ball.flight) {
    const f = ball.flight;
    f.t++;
    const k = Math.min(1, f.t / f.dur);
    ball.x = lerp(f.fromX, f.toX, k);
    ball.y = lerp(f.fromY, f.toY, k);
    ball.z = f.kind === "long" || f.kind === "cross" || f.kind === "clear" ? Math.sin(k * Math.PI) : f.kind === "shot" ? Math.sin(k * Math.PI) * 0.3 : 0;
    updateTargets(s);
    movePlayers(s);
    if (k >= 1) {
      ball.flight = null;
      ball.z = 0;
      if (f.shot) {
        finishShot(s, rng, f);
      } else if (f.out) {
        setRestart(s, f.out, 3);
      } else if (f.receiver !== null) {
        let r = s.players[f.receiver];
        if (r.onPitch) {
          r.x = lerp(r.x, f.toX, 0.7);
          r.y = lerp(r.y, f.toY, 0.7);
          // tight marker can nick it as it arrives
          if (f.kind !== "cross" && r.side === s.players[f.passer].side) {
            const { opp, d } = nearestOpponent(s, r);
            if (opp && d < 2.2) {
              const control = eff(r, "firstTouch") * 0.6 + eff(r, "balance") * 0.2 + eff(r, "composure") * 0.2;
              const pSteal = clamp(0.3 + ((eff(opp, "marking") + eff(opp, "anticipation")) / 2 - control) * 0.02 + (f.kind === "long" ? 0.12 : 0), 0.08, 0.6);
              if (rng.chance(pSteal)) {
                opp.st.interceptions++;
                r.st.possessionLost++;
                r = opp;
              } else if (rng.chance(factor(eff(r, "firstTouch"), 0.09, 0.01))) {
                // a heavy touch under pressure: the ball runs loose
                r.st.possessionLost++;
                s.ball.owner = null;
                s.ball.x = clamp(r.x + (r.side === 0 ? 1 : -1) * rng.range(2, 4), 0.5, L - 0.5);
                s.ball.y = clamp(r.y + rng.range(-2, 2), 0.5, W - 0.5);
                s.dribbleTo = null;
                emit(s, "heavy_touch", r.side, { player: r.id });
                feel(s, r, { conf: -0.04 });
                updateTargets(s);
                movePlayers(s);
                return;
              }
            }
          }
          giveBall(s, r, rng);
          // first-time finish from a cross, contested by the nearest defender
          if (f.kind === "cross" && r.side === s.players[f.passer].side) {
            const { opp, d } = nearestOpponent(s, r);
            const contested = opp && d < 2.5;
            // the keeper may come and claim it
            const gk = goalkeeper(s, other(r.side));
            if (gk && rng.chance(factor(eff(gk, "aerialReach"), 0.04, 0.2))) {
              giveBall(s, gk, rng);
              emit(s, "claim", gk.side, { player: gk.id });
              updateTargets(s);
              movePlayers(s);
              return;
            }
            const win = !contested || rng.chance(clamp(0.45 + (aerial(r) - aerial(opp!)) * 0.022, 0.15, 0.75));
            if (win) {
              const header = rng.chance(0.6);
              // keep the finishing spot realistic (not on the goal line)
              const minDepth = 5 + rng.range(0, 6);
              const gx = goalX(r.side);
              if (Math.abs(gx - r.x) < minDepth) r.x = gx + (r.side === 0 ? -minDepth : minDepth);
              resolveShot(s, rng, r, { header });
            } else if (opp) {
              giveBall(s, opp, rng);
            }
          }
        }
      }
    }
    return;
  }

  // 2. Loose ball
  if (ball.owner === null) {
    updateTargets(s);
    movePlayers(s);
    let best: MPlayer | undefined;
    let bd = 1.6;
    for (const p of s.players) {
      if (!p.onPitch) continue;
      const d = dist(p.x, p.y, ball.x, ball.y) - rng.next() * 0.4;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) giveBall(s, best, rng);
    return;
  }

  // 3. Ball at feet
  const c = s.players[ball.owner];
  if (!c.onPitch) {
    ball.owner = null;
    return;
  }

  if (tryTackle(s, rng, c)) {
    updateTargets(s);
    movePlayers(s);
    return;
  }

  const { d: pressure } = nearestOpponent(s, c);
  if (s.holdTimer > 0 && pressure < 2.5 && rng.chance(0.3 + eff(c, "decisions") / 40)) s.holdTimer = 0;
  if (s.holdTimer > 0 && s.dribbleTo) {
    // A defender standing in the carry path blocks it: stop and pick a new option.
    const blocker = blockerInPath(s, c, s.dribbleTo.x, s.dribbleTo.y);
    if (blocker && blocker.duelCd === 0 && dist(blocker.x, blocker.y, c.x, c.y) < 2.2) {
      s.dribbleTo = null;
      s.holdTimer = 0;
    }
  }
  if (s.holdTimer > 0) {
    s.holdTimer--;
    if (!s.dribbleTo) {
      // with grass ahead, stride into it; under pressure, shield and edge forward
      const dir = c.side === 0 ? 1 : -1;
      const step = pressure > 7 && c.pos !== "GK" ? 4 + (eff(c, "dribbling") / 20) * 4 : 2;
      s.dribbleTo = { x: clamp(c.x + dir * step, 1, L - 1), y: c.y };
    }
  } else {
    const opt = decide(s, rng, c);
    if (opt.kind === "shoot") {
      resolveShot(s, rng, c);
    } else if (opt.kind === "pass" && opt.target) {
      startPass(s, rng, c, opt);
    } else {
      const blocker = blockerInPath(s, c, opt.dx!, opt.dy!);
      if (blocker) {
        blocker.st.tackles++;
        if (challengeFoul(s, rng, blocker, c)) {
          updateTargets(s);
          movePlayers(s);
          return;
        }
        if (rng.chance(beatChance(c, blocker))) {
          c.st.dribbles++;
          blocker.duelCd = 6; // beaten, needs to recover
          feel(s, c, { conf: 0.05 });
          feel(s, blocker, { conf: -0.04, frus: 0.05 });
          if (tacticalFoul(s, rng, blocker, c)) return;
        } else {
          duelLost(s, rng, blocker, c);
          updateTargets(s);
          movePlayers(s);
          return;
        }
      }
      s.dribbleTo = { x: clamp(opt.dx!, 1, L - 1), y: clamp(opt.dy!, 1, W - 1) };
      s.holdTimer = rng.int(2, 4);
    }
    if (relX(c.side, c.x) > 0.75 && rng.chance(0.03)) emit(s, "chance", c.side, { player: c.id });
  }

  updateTargets(s);
  movePlayers(s);
  if (ball.owner !== null) {
    const o = s.players[ball.owner];
    ball.x = o.x;
    ball.y = o.y;
    // carried over the line? Treat as out.
    const out = outOfPlay(o.side, o.x, o.y);
    if (out) setRestart(s, out, 3);
  }
}

// ───────────────────────────── full sim & results ─────────────────────────────

export function simulateMatch(setup: MatchSetup, seed: number, commands: { tick: number; cmd: MatchCommand }[] = []): MatchState {
  const s = createMatch(setup, seed);
  let ci = 0;
  const sorted = [...commands].sort((a, b) => a.tick - b.tick);
  let guard = 0;
  while (!isFinished(s) && guard++ < 20000) {
    while (ci < sorted.length && sorted[ci].tick <= s.tick) applyCommand(s, sorted[ci++].cmd);
    stepMatch(s);
  }
  return s;
}

/** 1–10 match rating. */
export function playerRating(s: MatchState, p: MPlayer): number {
  if (!p.used) return 0;
  const st = p.st;
  const gd = s.score[p.side] - s.score[other(p.side)];
  let r = 6.25;
  r += st.goals * 1.0 + st.assists * 0.6 + st.keyPasses * 0.15 + (st.shotsOnTarget - st.goals) * 0.08;
  r += st.tacklesWon * 0.035 + st.interceptions * 0.05 + st.dribbles * 0.03;
  r += st.saves * (p.pos === "GK" ? 0.3 : 0);
  r += st.passes ? (st.passesCompleted / st.passes - 0.78) * 1.5 : 0;
  r -= st.possessionLost * 0.02 + st.fouls * 0.05 + p.yellow * 0.3 + (p.sentOff ? 1.5 : 0);
  const defensive = p.pos === "GK" || p.pos === "CB" || p.pos === "LB" || p.pos === "RB" || p.pos === "DM";
  if (defensive) {
    r -= st.conceded * (p.pos === "GK" ? 0.35 : 0.2);
    if (s.score[other(p.side)] === 0 && p.ticksPlayed > 3600) r += 0.5;
  }
  r += gd > 0 ? 0.3 : gd < 0 ? -0.2 : 0;
  // compress the extremes: a 9 should be a rare, outstanding display
  if (r > 7) r = 7 + (r - 7) * 0.62;
  else if (r < 6) r = 6 - (6 - r) * 0.8;
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

export function displayMinute(s: MatchState): string {
  const inHalf = s.tick - s.halfStartTick;
  const base = s.half === 1 ? 0 : 45;
  const mins = Math.floor(inHalf / 60);
  if (mins >= 45) return `${base + 45}+${mins - 44}'`;
  return `${base + mins}'`;
}

export function clockString(s: MatchState): string {
  const inHalf = s.tick - s.halfStartTick;
  const base = s.half === 1 ? 0 : 45 * 60;
  const total = base + inHalf;
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
