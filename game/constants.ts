import type { AttributeKey, FormationId, Position, TeamInstructions, TrainingFocus } from "./types";

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const GOAL_WIDTH = 7.32;

export const ATTRIBUTE_GROUPS: { label: string; keys: AttributeKey[] }[] = [
  { label: "Technical", keys: ["crossing", "dribbling", "finishing", "firstTouch", "freeKicks", "heading", "longShots", "marking", "passing", "penalties", "tackling", "technique"] },
  { label: "Mental", keys: ["anticipation", "bravery", "composure", "concentration", "decisions", "flair", "leadership", "offTheBall", "positioning", "teamwork", "vision", "workRate"] },
  { label: "Physical", keys: ["acceleration", "agility", "balance", "jumping", "naturalFitness", "pace", "stamina", "strength"] },
  { label: "Goalkeeping", keys: ["goalkeeping", "handling", "oneOnOnes", "aerialReach", "kicking"] },
];

export const ATTRIBUTE_KEYS: AttributeKey[] = ATTRIBUTE_GROUPS.flatMap((g) => g.keys);

/** Goalkeeping-only attributes (outfield players are poor at them). */
export const GK_KEYS = new Set<AttributeKey>(["goalkeeping", "handling", "oneOnOnes", "aerialReach", "kicking"]);

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  crossing: "Crossing",
  dribbling: "Dribbling",
  finishing: "Finishing",
  firstTouch: "First Touch",
  freeKicks: "Free Kicks",
  heading: "Heading",
  longShots: "Long Shots",
  marking: "Marking",
  passing: "Passing",
  penalties: "Penalties",
  tackling: "Tackling",
  technique: "Technique",
  anticipation: "Anticipation",
  bravery: "Bravery",
  composure: "Composure",
  concentration: "Concentration",
  decisions: "Decisions",
  flair: "Flair",
  leadership: "Leadership",
  offTheBall: "Off the Ball",
  positioning: "Positioning",
  teamwork: "Teamwork",
  vision: "Vision",
  workRate: "Work Rate",
  acceleration: "Acceleration",
  agility: "Agility",
  balance: "Balance",
  jumping: "Jumping Reach",
  naturalFitness: "Natural Fitness",
  pace: "Pace",
  stamina: "Stamina",
  strength: "Strength",
  goalkeeping: "Reflexes",
  handling: "Handling",
  oneOnOnes: "One-on-ones",
  aerialReach: "Aerial Reach",
  kicking: "Kicking",
};

/**
 * How each attribute improves (docs/DEPTH_PLAN.md §5): trainable ones grow in
 * training, experience ones only through matches, age and mentoring, innate
 * ones are set at birth.
 */
export type Trainability = "trainable" | "experience" | "innate";
export const TRAINABILITY: Record<AttributeKey, Trainability> = {
  crossing: "trainable",
  dribbling: "trainable",
  finishing: "trainable",
  firstTouch: "trainable",
  freeKicks: "trainable",
  heading: "trainable",
  longShots: "trainable",
  marking: "trainable",
  passing: "trainable",
  penalties: "trainable",
  tackling: "trainable",
  technique: "trainable",
  anticipation: "trainable",
  bravery: "experience",
  composure: "experience",
  concentration: "experience",
  decisions: "trainable",
  flair: "innate",
  leadership: "experience",
  offTheBall: "trainable",
  positioning: "trainable",
  teamwork: "trainable",
  vision: "trainable",
  workRate: "trainable",
  acceleration: "trainable",
  agility: "trainable",
  balance: "trainable",
  jumping: "trainable",
  naturalFitness: "innate",
  pace: "trainable",
  stamina: "trainable",
  strength: "trainable",
  goalkeeping: "trainable",
  handling: "trainable",
  oneOnOnes: "trainable",
  aerialReach: "trainable",
  kicking: "trainable",
};

/** How much each attribute matters for a position (relative weights). */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  GK: { goalkeeping: 6, handling: 3, oneOnOnes: 2, aerialReach: 2, positioning: 2, agility: 1, concentration: 1, decisions: 1, kicking: 1, composure: 1 },
  CB: { tackling: 4, marking: 4, heading: 3, positioning: 3, strength: 2, jumping: 2, anticipation: 2, pace: 1, concentration: 1, bravery: 1, composure: 1, passing: 1 },
  LB: { pace: 3, tackling: 3, stamina: 2, marking: 2, crossing: 2, positioning: 2, workRate: 2, acceleration: 1, passing: 1, teamwork: 1, dribbling: 1 },
  RB: { pace: 3, tackling: 3, stamina: 2, marking: 2, crossing: 2, positioning: 2, workRate: 2, acceleration: 1, passing: 1, teamwork: 1, dribbling: 1 },
  DM: { tackling: 3, positioning: 3, passing: 3, marking: 2, anticipation: 2, decisions: 2, workRate: 2, stamina: 1, teamwork: 1, strength: 1, concentration: 1 },
  CM: { passing: 4, vision: 3, decisions: 3, firstTouch: 2, stamina: 2, workRate: 2, teamwork: 1, technique: 1, tackling: 1, composure: 1, longShots: 1 },
  AM: { vision: 4, passing: 3, technique: 2, firstTouch: 2, dribbling: 2, flair: 2, composure: 2, offTheBall: 1, longShots: 1, finishing: 1, decisions: 1, agility: 1 },
  LM: { pace: 3, stamina: 2, crossing: 3, passing: 2, dribbling: 2, workRate: 2, acceleration: 1, teamwork: 1, technique: 1, vision: 1, tackling: 1 },
  RM: { pace: 3, stamina: 2, crossing: 3, passing: 2, dribbling: 2, workRate: 2, acceleration: 1, teamwork: 1, technique: 1, vision: 1, tackling: 1 },
  LW: { dribbling: 4, pace: 3, acceleration: 2, agility: 2, finishing: 2, crossing: 1, technique: 1, flair: 1, firstTouch: 1, offTheBall: 1 },
  RW: { dribbling: 4, pace: 3, acceleration: 2, agility: 2, finishing: 2, crossing: 1, technique: 1, flair: 1, firstTouch: 1, offTheBall: 1 },
  ST: { finishing: 5, offTheBall: 3, composure: 3, firstTouch: 2, heading: 2, strength: 1, jumping: 1, pace: 1, acceleration: 1, anticipation: 1 },
};

/** Which positions a player can cover reasonably when out of position. */
export const POSITION_NEIGHBOURS: Record<Position, Position[]> = {
  GK: [],
  CB: ["DM", "LB", "RB"],
  LB: ["LM", "CB"],
  RB: ["RM", "CB"],
  DM: ["CM", "CB"],
  CM: ["DM", "AM"],
  AM: ["CM", "ST", "LW", "RW"],
  LM: ["LW", "LB", "CM"],
  RM: ["RW", "RB", "CM"],
  LW: ["LM", "AM", "ST"],
  RW: ["RM", "AM", "ST"],
  ST: ["AM", "LW", "RW"],
};

export interface FormationSlot {
  pos: Position;
  /** 0 = own goal line, 1 = opponent goal line (team-relative). */
  x: number;
  /** 0 = left touchline, 1 = right touchline (from the team's attacking view). */
  y: number;
}

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  "4-4-2": [
    { pos: "GK", x: 0.03, y: 0.5 },
    { pos: "LB", x: 0.22, y: 0.14 },
    { pos: "CB", x: 0.19, y: 0.38 },
    { pos: "CB", x: 0.19, y: 0.62 },
    { pos: "RB", x: 0.22, y: 0.86 },
    { pos: "LM", x: 0.44, y: 0.14 },
    { pos: "CM", x: 0.41, y: 0.4 },
    { pos: "CM", x: 0.41, y: 0.6 },
    { pos: "RM", x: 0.44, y: 0.86 },
    { pos: "ST", x: 0.62, y: 0.4 },
    { pos: "ST", x: 0.62, y: 0.6 },
  ],
  "4-3-3": [
    { pos: "GK", x: 0.03, y: 0.5 },
    { pos: "LB", x: 0.22, y: 0.14 },
    { pos: "CB", x: 0.19, y: 0.38 },
    { pos: "CB", x: 0.19, y: 0.62 },
    { pos: "RB", x: 0.22, y: 0.86 },
    { pos: "CM", x: 0.4, y: 0.3 },
    { pos: "DM", x: 0.34, y: 0.5 },
    { pos: "CM", x: 0.4, y: 0.7 },
    { pos: "LW", x: 0.6, y: 0.16 },
    { pos: "ST", x: 0.64, y: 0.5 },
    { pos: "RW", x: 0.6, y: 0.84 },
  ],
  "4-2-3-1": [
    { pos: "GK", x: 0.03, y: 0.5 },
    { pos: "LB", x: 0.22, y: 0.14 },
    { pos: "CB", x: 0.19, y: 0.38 },
    { pos: "CB", x: 0.19, y: 0.62 },
    { pos: "RB", x: 0.22, y: 0.86 },
    { pos: "DM", x: 0.34, y: 0.4 },
    { pos: "DM", x: 0.34, y: 0.6 },
    { pos: "LW", x: 0.52, y: 0.16 },
    { pos: "AM", x: 0.5, y: 0.5 },
    { pos: "RW", x: 0.52, y: 0.84 },
    { pos: "ST", x: 0.65, y: 0.5 },
  ],
  "3-5-2": [
    { pos: "GK", x: 0.03, y: 0.5 },
    { pos: "CB", x: 0.19, y: 0.28 },
    { pos: "CB", x: 0.17, y: 0.5 },
    { pos: "CB", x: 0.19, y: 0.72 },
    { pos: "LM", x: 0.42, y: 0.1 },
    { pos: "CM", x: 0.38, y: 0.36 },
    { pos: "DM", x: 0.32, y: 0.5 },
    { pos: "CM", x: 0.38, y: 0.64 },
    { pos: "RM", x: 0.42, y: 0.9 },
    { pos: "ST", x: 0.62, y: 0.4 },
    { pos: "ST", x: 0.62, y: 0.6 },
  ],
  "5-3-2": [
    { pos: "GK", x: 0.03, y: 0.5 },
    { pos: "LB", x: 0.25, y: 0.1 },
    { pos: "CB", x: 0.18, y: 0.3 },
    { pos: "CB", x: 0.17, y: 0.5 },
    { pos: "CB", x: 0.18, y: 0.7 },
    { pos: "RB", x: 0.25, y: 0.9 },
    { pos: "CM", x: 0.4, y: 0.3 },
    { pos: "CM", x: 0.38, y: 0.5 },
    { pos: "CM", x: 0.4, y: 0.7 },
    { pos: "ST", x: 0.6, y: 0.4 },
    { pos: "ST", x: 0.6, y: 0.6 },
  ],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export const DEFAULT_INSTRUCTIONS: TeamInstructions = {
  mentality: 3,
  pressing: 3,
  defensiveLine: 3,
  width: 3,
  tempo: 3,
  directness: 3,
};

export const INSTRUCTION_LABELS: Record<keyof TeamInstructions, { label: string; low: string; high: string }> = {
  mentality: { label: "Mentality", low: "Defensive", high: "Attacking" },
  pressing: { label: "Pressing", low: "Stand off", high: "Gegenpress" },
  defensiveLine: { label: "Defensive line", low: "Deep", high: "High" },
  width: { label: "Width", low: "Narrow", high: "Wide" },
  tempo: { label: "Tempo", low: "Patient", high: "Quick" },
  directness: { label: "Passing", low: "Short", high: "Direct" },
};

export const TRAINING_FOCUS: Record<TrainingFocus, { label: string; keys: AttributeKey[] }> = {
  balanced: { label: "Balanced", keys: [] },
  attacking: { label: "Attacking", keys: ["finishing", "longShots", "offTheBall", "crossing", "penalties"] },
  defending: { label: "Defending", keys: ["tackling", "marking", "heading", "positioning", "anticipation"] },
  physical: { label: "Physical", keys: ["pace", "acceleration", "stamina", "strength", "agility", "balance", "jumping"] },
  technical: { label: "Technical", keys: ["passing", "dribbling", "firstTouch", "technique", "freeKicks", "goalkeeping", "handling", "kicking"] },
  tactical: { label: "Tactical", keys: ["positioning", "decisions", "workRate", "teamwork", "vision", "anticipation"] },
};
