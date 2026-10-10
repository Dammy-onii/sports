import { FORMATIONS, FORMATION_IDS } from "./constants";
import { hashString } from "./rng";
import { DEFAULT_ROLE, ROLES, rolesFor, validRole } from "./roles";
import type { FormationId, Player, RoleId, TacticalFamiliarity, TeamInstructions } from "./types";

/**
 * Tactical familiarity: how well a squad knows its formation, its instruction
 * settings and each player his role. See docs/DEPTH_PLAN.md §2.
 */

export const INSTRUCTION_KEYS: (keyof TeamInstructions)[] = ["mentality", "pressing", "defensiveLine", "width", "tempo", "directness"];

/** Anything once learned never drops below this. */
const FLOOR = 25;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A club that has drilled one system for a while (AI clubs, new careers). */
export function initialFamiliarity(formation: FormationId, ins: TeamInstructions, level = 85): TacticalFamiliarity {
  const fam: TacticalFamiliarity = { formation: {}, instructions: {} as TacticalFamiliarity["instructions"] };
  for (const f of FORMATION_IDS) fam.formation[f] = f === formation ? level : 30;
  for (const k of INSTRUCTION_KEYS) {
    // the current level is well known, neighbours partly, extremes barely
    fam.instructions[k] = [1, 2, 3, 4, 5].map((lvl) => clamp(level - Math.abs(lvl - ins[k]) * 22, 20, 100));
  }
  return fam;
}

/** Familiarity (0–1) of the six current instruction levels. */
export function instructionFamiliarity(fam: TacticalFamiliarity, ins: TeamInstructions): Record<keyof TeamInstructions, number> {
  const out = {} as Record<keyof TeamInstructions, number>;
  for (const k of INSTRUCTION_KEYS) out[k] = (fam.instructions[k]?.[ins[k] - 1] ?? FLOOR) / 100;
  return out;
}

export function formationFamiliarity(fam: TacticalFamiliarity, f: FormationId): number {
  return (fam.formation[f] ?? FLOOR) / 100;
}

/** Role experience a player starts with: older players have played more. */
export function initialRoleExp(p: Pick<Player, "id" | "age" | "positions">): Partial<Record<RoleId, number>> {
  const out: Partial<Record<RoleId, number>> = {};
  const base = clamp(20 + (p.age - 17) * 5, 15, 85);
  p.positions.forEach((pos, pi) => {
    const roles = rolesFor(pos);
    roles.forEach((r) => {
      const h = hashString(p.id + r) % 100;
      // the default role for his position is the one he knows best
      const known = r === DEFAULT_ROLE[pos] ? 1 : 0.45 + (h / 100) * 0.45;
      const v = Math.round(base * known * (pi === 0 ? 1 : 0.7));
      out[r] = Math.max(out[r] ?? 0, v);
    });
  });
  return out;
}

/** 0–1 experience of a player in a role. Roles outside his positions are barely known. */
export function roleFamiliarity(p: Pick<Player, "roleExp" | "positions">, role: RoleId): number {
  const v = p.roleExp?.[role];
  if (v !== undefined) return v / 100;
  const fits = ROLES[role].positions.some((pos) => p.positions.includes(pos));
  return fits ? 0.3 : 0.1;
}

export interface FamiliarityBreakdown {
  overall: number;
  formation: number;
  instructions: Record<keyof TeamInstructions, number>;
  instructionsAvg: number;
  roles: number;
}

/** The team's overall familiarity (0–1): formation 35%, instructions 35%, roles 30%. */
export function teamFamiliarity(fam: TacticalFamiliarity, formation: FormationId, ins: TeamInstructions, roleFams: number[]): FamiliarityBreakdown {
  const f = formationFamiliarity(fam, formation);
  const insF = instructionFamiliarity(fam, ins);
  const insAvg = INSTRUCTION_KEYS.reduce((a, k) => a + insF[k], 0) / INSTRUCTION_KEYS.length;
  const roles = roleFams.length ? roleFams.reduce((a, b) => a + b, 0) / roleFams.length : 0.5;
  return { overall: f * 0.35 + insAvg * 0.35 + roles * 0.3, formation: f, instructions: insF, instructionsAvg: insAvg, roles };
}

/** Familiarity for a club's current tactic and XI. */
export function clubFamiliarity(
  club: { familiarity: TacticalFamiliarity; tactics: { formation: FormationId; instructions: TeamInstructions; lineup: string[]; roles?: RoleId[] } },
  players: Record<string, Player>,
): FamiliarityBreakdown {
  const slots = FORMATIONS[club.tactics.formation];
  const roleFams = club.tactics.lineup
    .map((id, i) => {
      const p = players[id];
      if (!p) return undefined;
      return roleFamiliarity(p, validRole(club.tactics.roles?.[i], slots[i].pos));
    })
    .filter((v): v is number => v !== undefined);
  return teamFamiliarity(club.familiarity, club.tactics.formation, club.tactics.instructions, roleFams);
}

export function familiarityLabel(v: number): string {
  if (v >= 0.9) return "Fluid";
  if (v >= 0.75) return "Well drilled";
  if (v >= 0.6) return "Competent";
  if (v >= 0.45) return "Learning";
  if (v >= 0.3) return "Unfamiliar";
  return "Awkward";
}

/** Learning speed from a player's decision making (quick learners pick roles up faster). */
function learnRate(p: Player) {
  return 0.7 + (p.attributes.decisions / 20) * 0.6;
}

export interface FamiliarityWeek {
  /** Formation and instructions used in this week's match (if any). */
  played?: { formation: FormationId; instructions: TeamInstructions };
  /** Minutes in roles this week: [playerId, role, minutes]. */
  roleMinutes: [string, RoleId, number][];
  /** Training time on tactics: 0 = none, 1 = a tactical team focus, 1.5 = familiarity match prep. */
  tacticalTraining: number;
  /** Coach's tactical skill (1–20). */
  coachTactical: number;
  /** The club's current tactic (what training drills). */
  current: { formation: FormationId; instructions: TeamInstructions; lineup: string[]; roles?: RoleId[] };
}

function bump(arr: number[], level: number, amount: number) {
  for (let i = 0; i < 5; i++) {
    const d = Math.abs(i - (level - 1));
    const k = d === 0 ? 1 : d === 1 ? 0.5 : 0;
    if (k) arr[i] = clamp(arr[i] + amount * k, 0, 100);
  }
}

/** One week of learning and forgetting. Mutates the club's familiarity and players' role experience. */
export function weeklyFamiliarity(fam: TacticalFamiliarity, players: Record<string, Player>, w: FamiliarityWeek) {
  const coachF = 0.6 + (w.coachTactical / 20) * 0.8;
  const touchedForm = new Set<FormationId>();
  const touchedIns = new Set<string>();

  const gainFormation = (f: FormationId, amount: number) => {
    fam.formation[f] = clamp((fam.formation[f] ?? FLOOR) + amount * (1 - (fam.formation[f] ?? FLOOR) / 140), 0, 100);
    touchedForm.add(f);
  };
  const gainIns = (ins: TeamInstructions, amount: number) => {
    for (const k of INSTRUCTION_KEYS) {
      fam.instructions[k] ??= [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR];
      bump(fam.instructions[k], ins[k], amount * (1 - fam.instructions[k][ins[k] - 1] / 140));
      touchedIns.add(`${k}${ins[k]}`);
    }
  };

  if (w.played) {
    gainFormation(w.played.formation, 6);
    gainIns(w.played.instructions, 5);
  }
  if (w.tacticalTraining > 0) {
    gainFormation(w.current.formation, 4.5 * w.tacticalTraining * coachF);
    gainIns(w.current.instructions, 4.5 * w.tacticalTraining * coachF);
  }

  // forgetting what isn't used
  for (const f of FORMATION_IDS) {
    if (touchedForm.has(f)) continue;
    const v = fam.formation[f] ?? FLOOR;
    if (v > FLOOR) fam.formation[f] = Math.max(FLOOR, v - 1);
  }
  for (const k of INSTRUCTION_KEYS) {
    const arr = (fam.instructions[k] ??= [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR]);
    for (let i = 0; i < 5; i++) {
      if (touchedIns.has(`${k}${i + 1}`)) continue;
      if (arr[i] > FLOOR) arr[i] = Math.max(FLOOR, arr[i] - 1.5);
    }
  }

  // role experience: playing time, plus tactical training for the XI
  for (const [id, role, mins] of w.roleMinutes) {
    const p = players[id];
    if (!p || mins <= 0) continue;
    p.roleExp ??= initialRoleExp(p);
    const cur = p.roleExp[role] ?? roleFamiliarity(p, role) * 100;
    p.roleExp[role] = clamp(cur + (mins / 90) * 6 * learnRate(p) * (1 - cur / 130), 0, 100);
  }
  if (w.tacticalTraining > 0) {
    const slots = FORMATIONS[w.current.formation];
    w.current.lineup.forEach((id, i) => {
      const p = players[id];
      if (!p) return;
      const role = validRole(w.current.roles?.[i], slots[i].pos);
      p.roleExp ??= initialRoleExp(p);
      const cur = p.roleExp[role] ?? roleFamiliarity(p, role) * 100;
      p.roleExp[role] = clamp(cur + 2.5 * w.tacticalTraining * coachF * learnRate(p) * (1 - cur / 130), 0, 100);
    });
  }
}
