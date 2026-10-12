import { ATTRIBUTE_KEYS, GK_KEYS, POSITION_WEIGHTS, TRAINABILITY, TRAINING_FOCUS } from "./constants";
import { averageForm, currentAbility } from "./ratings";
import { hashString, type Rng } from "./rng";
import type { AttributeKey, CoachArea, Player, StaffMember, StaffRole, TrainingFocus, TrainingIntensity } from "./types";

/**
 * Player development: growth toward potential, experience, decline, injury
 * setbacks and personality. See docs/DEPTH_PLAN.md §1 for the model and the
 * calibration targets (checked with scripts/longrun.ts).
 */

export const COACH_AREAS: CoachArea[] = ["attacking", "technical", "defending", "tactical", "physical", "goalkeeping"];

/** Which coaching area trains each attribute. */
export const AREA_OF: Record<AttributeKey, CoachArea> = {
  finishing: "attacking",
  longShots: "attacking",
  offTheBall: "attacking",
  crossing: "attacking",
  penalties: "attacking",
  composure: "attacking",
  passing: "technical",
  dribbling: "technical",
  firstTouch: "technical",
  technique: "technical",
  freeKicks: "technical",
  vision: "technical",
  flair: "technical",
  tackling: "defending",
  marking: "defending",
  heading: "defending",
  bravery: "defending",
  concentration: "defending",
  positioning: "tactical",
  decisions: "tactical",
  workRate: "tactical",
  teamwork: "tactical",
  anticipation: "tactical",
  leadership: "tactical",
  pace: "physical",
  acceleration: "physical",
  stamina: "physical",
  strength: "physical",
  agility: "physical",
  balance: "physical",
  jumping: "physical",
  naturalFitness: "physical",
  goalkeeping: "goalkeeping",
  handling: "goalkeeping",
  oneOnOnes: "goalkeeping",
  aerialReach: "goalkeeping",
  kicking: "goalkeeping",
};

type AttrClass = "physical" | "technical" | "mental";
const CLASS_OF: Record<AttributeKey, AttrClass> = {
  pace: "physical",
  acceleration: "physical",
  stamina: "physical",
  strength: "physical",
  agility: "physical",
  balance: "physical",
  jumping: "physical",
  naturalFitness: "physical",
  passing: "technical",
  dribbling: "technical",
  finishing: "technical",
  longShots: "technical",
  tackling: "technical",
  marking: "technical",
  heading: "technical",
  crossing: "technical",
  firstTouch: "technical",
  freeKicks: "technical",
  penalties: "technical",
  technique: "technical",
  goalkeeping: "technical",
  handling: "technical",
  oneOnOnes: "technical",
  aerialReach: "technical",
  kicking: "technical",
  positioning: "mental",
  vision: "mental",
  composure: "mental",
  decisions: "mental",
  workRate: "mental",
  anticipation: "mental",
  bravery: "mental",
  concentration: "mental",
  flair: "mental",
  leadership: "mental",
  offTheBall: "mental",
  teamwork: "mental",
};

/** Age at which each class starts to decline (goalkeepers +3). */
const DECLINE_ONSET: Record<AttrClass, number> = { physical: 29, technical: 31, mental: 33 };

const EXPERIENCE_KEYS = ATTRIBUTE_KEYS.filter((k) => TRAINABILITY[k] === "experience");

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Map a 1–20 rating to a multiplier: `lo` at 1, `hi` at 20. */
export const factor = (v: number, lo: number, hi: number) => lo + ((clamp(v, 1, 20) - 1) / 19) * (hi - lo);

/** CA points per week at age `age` before any multipliers. */
export function ageBase(age: number): number {
  const table: Record<number, number> = { 15: 0.4, 16: 0.4, 17: 0.38, 18: 0.36, 19: 0.3, 20: 0.25, 21: 0.2, 22: 0.17, 23: 0.13, 24: 0.09, 25: 0.06, 26: 0.035, 27: 0.015 };
  if (age < 15) return 0.4;
  return table[age] ?? 0;
}

/** A staff member's skill (1–20), falling back to his overall rating, or poor if the post is empty. */
export function staffSkill(staff: Partial<Record<StaffRole, StaffMember>> | undefined, role: StaffRole, skill: string): number {
  const m = staff?.[role];
  if (!m) return 4;
  return (m.skills as Record<string, number> | undefined)?.[skill] ?? m.rating;
}

/** Specialist skills around an overall rating, stable for a given id. */
export function deriveSkills(id: string, rating: number, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const h = (hashString(id + k) % 1000) / 1000; // 0–1
    out[k] = clamp(Math.round(rating + (h - 0.5) * 8), 1, 20);
  }
  return out;
}

export interface DevContext {
  focus: TrainingFocus;
  intensity: TrainingIntensity;
  /** Coach skill per area (1–20). */
  coach: Record<CoachArea, number>;
  /** Training facilities 1–5. */
  facilities: number;
  /** Youth academy 1–5 (matters up to age 18). */
  academy: number;
  /** League tier the club plays in (1 = top). */
  tier: number;
  /** Match-specific preparation this week (costs some development time). */
  matchPrep: boolean;
  season: number;
  /** Youth coach rating (1–20), if the club has one: speeds under-20 development. */
  youthCoach?: number;
}

export interface DevResult {
  /** Change in current ability this week (can be negative). */
  delta: number;
  breakthrough?: boolean;
  setback?: string;
}

const INTENSITY_GROWTH: Record<TrainingIntensity, number> = { light: 0.75, normal: 1, intense: 1.2 };

/** Share of recent minutes (0–1) from the minutes history. */
function minutesShare(p: Player): number {
  const h = p.minutesHistory.slice(-6);
  return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
}

/** How much of each factor drives this player's development right now (for the UI). */
export function developmentFactors(p: Player, ctx: Omit<DevContext, "season">) {
  const t = p.traits;
  const m = minutesShare(p);
  const form = averageForm(p);
  const coachAvg = COACH_AREAS.filter((a) => a !== "goalkeeping" || p.positions[0] === "GK").reduce((a, k) => a + ctx.coach[k], 0) / (p.positions[0] === "GK" ? 6 : 5);
  return {
    age: ageBase(p.age) / 0.38,
    room: clamp(0.2 + (p.potential - currentAbility(p)) / 35, 0.1, 1.3),
    personality: factor(t.professionalism, 0.55, 1.45) * factor(t.determination, 0.85, 1.15) * factor(t.ambition, 0.92, 1.08),
    experience: (0.75 + 0.6 * m) * (ctx.tier === 1 ? 1.08 : 1) * (form === null ? 1 : form >= 7.2 ? 1.08 : form <= 6.2 ? 0.95 : 1),
    coaching: factor(coachAvg, 0.7, 1.3),
    facilities: (0.88 + (ctx.facilities - 1) * 0.06) * (p.age <= 18 ? 0.95 + (ctx.academy - 1) * 0.05 : 1) * (p.age <= 19 && ctx.youthCoach ? factor(ctx.youthCoach, 0.95, 1.15) : 1),
    training: INTENSITY_GROWTH[ctx.intensity] * (ctx.matchPrep ? 0.8 : 1),
    minutesShare: m,
  };
}

/** Season-long "trajectory": some players bloom, some stall (stable per player and season). */
function trajectory(p: Player, season: number) {
  return 0.75 + ((hashString(`${p.id}:${season}`) % 1000) / 1000) * 0.5;
}

/**
 * One week of development for a fit player. Mutates attributes, returns the
 * change in current ability.
 */
export function developWeek(p: Player, ctx: DevContext, rng: Rng): DevResult {
  const before = currentAbility(p);
  const isGK = p.positions[0] === "GK";
  const posW = POSITION_WEIGHTS[p.positions[0]];
  const teamFocus = new Set<AttributeKey>(TRAINING_FOCUS[ctx.focus].keys);
  const ownFocus = new Set<AttributeKey>(p.focus ? TRAINING_FOCUS[p.focus].keys : []);
  const f = developmentFactors(p, ctx);
  const res: DevResult = { delta: 0 };

  // ── growth toward potential ──
  const room = p.potential - before;
  if (room > 0 && ageBase(p.age) > 0) {
    let G = ageBase(p.age) * f.room * f.personality * f.experience * f.coaching * f.facilities * f.training * trajectory(p, ctx.season) * rng.range(0.6, 1.4);
    // a rare breakthrough for a dedicated young player getting games
    if (p.age <= 21 && p.traits.professionalism >= 12 && f.minutesShare >= 0.5 && rng.chance(0.004)) {
      G *= 6;
      res.breakthrough = true;
    }
    G = Math.min(G, room);
    const inc: Partial<Record<AttributeKey, number>> = {};
    let weighted = 0;
    let weightSum = 0;
    for (const k of ATTRIBUTE_KEYS) {
      const pw = posW[k] ?? 0;
      // only trainable attributes grow in training (experience and innate ones don't)
      if (TRAINABILITY[k] !== "trainable") continue;
      let w = 0.35 + pw / 3;
      if (teamFocus.has(k)) w *= 2;
      if (ownFocus.has(k)) w *= 2.5;
      if (p.focusAttr === k) w *= 4;
      const cls = CLASS_OF[k];
      if (cls === "physical") w *= p.age <= 23 ? 1.3 : p.age <= 26 ? 0.6 : 0.2;
      else if (cls === "technical") w *= p.age <= 26 ? 1 : 0.5;
      else w *= p.age <= 20 ? 0.7 : 1.1;
      w *= factor(ctx.coach[AREA_OF[k]], 0.7, 1.3);
      if (GK_KEYS.has(k) && !isGK) w = 0.01;
      w *= Math.max(0.02, 1 - p.attributes[k] / 21);
      const v = w * rng.range(0.6, 1.4);
      inc[k] = v;
      weighted += pw * v;
      weightSum += pw;
    }
    // scale so the position-weighted ability rises by exactly G
    const fullWeight = ATTRIBUTE_KEYS.reduce((a, k) => a + (posW[k] ?? 0), 0);
    void weightSum;
    const rawCA = fullWeight ? (weighted / fullWeight) * 10 : 0;
    const scale = rawCA > 0 ? G / rawCA : 0;
    for (const k of ATTRIBUTE_KEYS) p.attributes[k] = Math.min(20, p.attributes[k] + (inc[k] ?? 0) * scale);
  }

  // ── experience: only matches (and age) teach composure, concentration, bravery and leadership ──
  if (f.minutesShare > 0.15 && room > -5 && p.age >= 17) {
    const youth = p.age <= 23 ? 1.3 : p.age <= 29 ? 1 : 0.6;
    const k = 0.007 * f.minutesShare * youth * (ctx.tier === 1 ? 1.1 : 1);
    for (const a of EXPERIENCE_KEYS) {
      const extra = a === "leadership" ? (p.age >= 26 ? 1.4 : 0.6) : 1;
      p.attributes[a] = Math.min(20, p.attributes[a] + k * extra * rng.range(0.5, 1.5));
    }
  }
  // regulars keep reading the game better into their early thirties
  if (p.age >= 24 && p.age <= 31 && f.minutesShare > 0.3 && room > -5) {
    const k = 0.005 * f.minutesShare * factor(p.traits.professionalism, 0.7, 1.2);
    for (const a of ["decisions", "anticipation", "positioning"] as AttributeKey[]) p.attributes[a] = Math.min(20, p.attributes[a] + k * rng.range(0.5, 1.5));
  }

  // ── decline ──
  const keeperBonus = isGK ? 3 : 0;
  const care = factor(p.traits.professionalism, 1.4, 0.6) * factor(p.traits.injuryProneness, 0.85, 1.25);
  const body = factor(p.attributes.naturalFitness, 1.25, 0.75);
  for (const k of ATTRIBUTE_KEYS) {
    if (k === "flair" || k === "leadership") continue;
    const onset = DECLINE_ONSET[CLASS_OF[k]] + keeperBonus;
    if (p.age < onset) continue;
    const rate = 0.009 * (p.age - onset + 1) * care * (CLASS_OF[k] === "physical" ? body : 1);
    p.attributes[k] = Math.max(1, p.attributes[k] - rate * rng.range(0.5, 1.5));
  }

  res.delta = currentAbility(p) - before;
  return res;
}

/**
 * Coming back from a long lay-off: the occasional permanent loss of pace or
 * stamina, and for very long injuries some of the ceiling. Determination halves the risk.
 */
export function returnFromInjury(p: Player, rng: Rng): string | undefined {
  const weeks = p.injuryLength ?? 0;
  p.injuryLength = 0;
  if (weeks < 8) return undefined;
  const resolve = factor(p.traits.determination, 1.4, 0.6);
  const notes: string[] = [];
  if (rng.chance(0.35 * resolve)) {
    p.attributes.pace = Math.max(1, p.attributes.pace - rng.range(0.3, 1));
    p.attributes.stamina = Math.max(1, p.attributes.stamina - rng.range(0.2, 0.8));
    notes.push("has lost a yard of pace");
  }
  if (weeks >= 12 && rng.chance(0.3 * resolve)) {
    p.potential = Math.max(Math.round(currentAbility(p)), p.potential - rng.int(3, 10));
    notes.push("may never quite reach the level he once could");
  }
  return notes.length ? notes.join(" and ") : undefined;
}

/** A senior pro's professionalism and determination slowly rub off on a youngster. */
export function mentorWeek(mentee: Player, mentor: Player) {
  const t = mentee.traits;
  const m = mentor.traits;
  if (m.professionalism > t.professionalism) t.professionalism = Math.min(20, t.professionalism + (m.professionalism - t.professionalism) * 0.004);
  if (m.determination > t.determination) t.determination = Math.min(20, t.determination + (m.determination - t.determination) * 0.004);
  const k = 0.01 + (m.consistency / 20) * 0.015;
  for (const key of ["composure", "decisions", "positioning"] as AttributeKey[]) {
    if (mentor.attributes[key] > mentee.attributes[key]) mentee.attributes[key] = Math.min(20, mentee.attributes[key] + k);
  }
  if (m.consistency > t.consistency) t.consistency = Math.min(20, t.consistency + 0.03);
}

/**
 * The coach's view of a player's potential, in stars: a range whose width
 * depends on how well he judges potential.
 */
export function coachPotentialStars(potentialStars: number, judging: number): [number, number] {
  const spread = ((20 - clamp(judging, 1, 20)) / 19) * 1.5;
  const lo = Math.max(0.5, Math.round((potentialStars - spread / 2) * 2) / 2);
  const hi = Math.min(5, Math.round((potentialStars + spread / 2) * 2) / 2);
  return [lo, hi];
}

/** Coach skills per area for a club (missing coach = poor). */
export function coachSkills(staff: Partial<Record<StaffRole, StaffMember>> | undefined): Record<CoachArea, number> {
  const skills = Object.fromEntries(COACH_AREAS.map((a) => [a, staffSkill(staff, "coach", a)])) as Record<CoachArea, number>;
  // specialist coaches take over their areas when they're better
  if (staff?.gkCoach) skills.goalkeeping = Math.max(skills.goalkeeping, staff.gkCoach.rating);
  if (staff?.fitnessCoach) skills.physical = Math.max(skills.physical, staffSkill(staff, "fitnessCoach", "physical"));
  return skills;
}
