import type { RoleId, ShoutId, TalkTone } from "./roles";
export type { RoleId, ShoutId, TalkTone };

export type Position =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "DM"
  | "CM"
  | "AM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST";

export type AttributeKey =
  // technical
  | "crossing"
  | "dribbling"
  | "finishing"
  | "firstTouch"
  | "freeKicks"
  | "heading"
  | "longShots"
  | "marking"
  | "passing"
  | "penalties"
  | "tackling"
  | "technique"
  // mental
  | "anticipation"
  | "bravery"
  | "composure"
  | "concentration"
  | "decisions"
  | "flair"
  | "leadership"
  | "offTheBall"
  | "positioning"
  | "teamwork"
  | "vision"
  | "workRate"
  // physical
  | "acceleration"
  | "agility"
  | "balance"
  | "jumping"
  | "naturalFitness"
  | "pace"
  | "stamina"
  | "strength"
  // goalkeeping ("goalkeeping" is shot-stopping reflexes)
  | "goalkeeping"
  | "handling"
  | "oneOnOnes"
  | "aerialReach"
  | "kicking";

/** 1–20 scale. Stored as floats so training can make fractional progress. */
export type Attributes = Record<AttributeKey, number>;

/**
 * Hidden personality, 1–20. Not trainable. Shapes discipline, injuries and
 * match-to-match reliability.
 */
export interface Traits {
  /** Hot-headedness: more fouls, cards and reckless challenges. */
  aggression: number;
  /** Fragility: more likely to get injured, in matches and training. */
  injuryProneness: number;
  /** Steadiness: lower = bigger swings between good and bad days. */
  consistency: number;
  /** Dedication to the craft: the biggest driver of development, slows decline. */
  professionalism: number;
  /** Drive to succeed: development, and bouncing back from setbacks. */
  determination: number;
  /** Wants to reach the top: a little development, transfer interest, wage demands. */
  ambition: number;
  /** Big-match temperament: low = nervous on big occasions. */
  pressure: number;
  /** Attachment to the club: steadier mood, asks for less to stay. */
  loyalty: number;
  /** Settles quickly after a move. */
  adaptability: number;
  /** Fair play: keeps his head, argues less, rarely dives into reckless fouls. */
  sportsmanship: number;
}

/** One season of a player's career record. */
export interface CareerSeason {
  season: number;
  age: number;
  clubId: string;
  clubName: string;
  apps: number;
  goals: number;
  assists: number;
  /** Average match rating (0 if no appearances). */
  rating: number;
  ovr: number;
  /** Current ability on the 1–200 scale at season end. */
  ca: number;
}

/** Running totals for the current season (league matches). */
export interface SeasonStats {
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  fouls: number;
  offsides: number;
  saves: number;
  conceded: number;
  cleanSheets: number;
  /** Sum of match ratings, for the season average. */
  ratingSum: number;
  /** Metres covered. */
  distance: number;
  yellows: number;
  reds: number;
}

export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  age: number;
  /** Natural position plus secondary positions. */
  positions: Position[];
  attributes: Attributes;
  traits: Traits;
  /** Ceiling on the 1–200 ability scale. */
  potential: number;
  /** 0–100 */
  fitness: number;
  /** 0–100 */
  morale: number;
  /** 0–100 match rhythm: drops without games, rises with minutes and friendlies. */
  sharpness?: number;
  injuryWeeks: number;
  /** Rolling last-5 match ratings. */
  form: number[];
  season: SeasonStats;
  /** League matches still to serve on a ban. */
  suspension: number;
  shirt: number;
  contract: Contract;
  /** Squad status (what playing time he expects). */
  status: SquadStatus;
  /** Share of available minutes (0–1) in his club's recent matches, newest last. */
  minutesHistory: number[];
  /** Consecutive weeks unhappy (morale < 35). */
  unhappyWeeks: number;
  /** Has asked to leave. */
  transferRequest: boolean;
  promise?: Promise;
  /** Individual training focus (on top of the team plan). */
  focus?: TrainingFocus;
  /** A single trainable attribute to work on (strongest individual focus). */
  focusAttr?: AttributeKey;
  /** Learning a new position. */
  retrain?: { pos: Position; progress: number };
  /** Senior player mentoring this youngster. */
  mentorId?: string;
  loan?: Loan;
  /** Experience in each role he has played (0–100). */
  roleExp?: Partial<Record<RoleId, number>>;
  /** Season-by-season career record (oldest first). */
  history?: CareerSeason[];
  /** Weeks out with the current injury (for setbacks after long lay-offs). */
  injuryLength?: number;
  /** Relationship with the manager (0–100, 50 = neutral). */
  rapport?: number;
  /** How settled he is at the club (0–100); new signings start low. */
  settled?: number;
  /** When he joined the club: season. */
  joinedSeason?: number;
  /** Last four weekly training ratings (1–10), newest last. */
  training?: number[];
  /** Last week (calendar index) each conversation topic was used with him. */
  talks?: Partial<Record<string, number>>;
  /** Awards won ("Player of the Month 2" …). */
  awards?: string[];
  /** A one-match emotional boost from a conversation (fired up / calmed). */
  boost?: { conf: number; nerves: number; frus: number; week: number };
}

export interface Contract {
  /** Weekly wage. */
  wage: number;
  /** Last season of the deal (expires at that season's end). */
  expires: number;
}

export type SquadStatus = "key" | "regular" | "rotation" | "backup" | "prospect";

export interface Promise {
  kind: "playtime";
  /** Calendar index until which it is judged. */
  until: number;
  made: number;
}

export interface Loan {
  fromClubId: string;
  /** Last season of the loan. */
  untilSeason: number;
  /** Fraction of wages paid by the borrowing club. */
  wageShare: number;
}

export type StaffRole = "assistant" | "coach" | "scout" | "physio" | "gkCoach" | "fitnessCoach" | "analyst" | "youthCoach";

/** Areas a coach can be good at (1–20 each). */
export type CoachArea = "attacking" | "defending" | "technical" | "tactical" | "physical" | "goalkeeping";
export type StaffSkill = CoachArea | "judging" | "motivating";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  /** 1–20 */
  rating: number;
  /** Weekly wage. */
  wage: number;
  /** Specialist skills (coaches and assistants). Missing = the overall rating. */
  skills?: Partial<Record<StaffSkill, number>>;
}

export type ManagerStyle = "attacking" | "possession" | "counter" | "defensive" | "pressing";

/** An AI club's manager: how he sets up, adapts and reacts (docs/DEPTH_PLAN.md §7). */
export interface AIManager {
  name: string;
  style: ManagerStyle;
  /** 1–20: how often and how readily he changes things in a match. */
  adaptability: number;
  /** 1–20: how good his changes are. */
  knowledge: number;
  /** Formations he knows, favourite first. */
  formations: FormationId[];
  /** 1–20: how long the board gives him (low = quickly sacked). */
  patience: number;
  /** Season he was appointed. */
  since: number;
  /** What he remembers of opponents' setups: clubId → last formation and mentality. */
  memory: Record<string, { formation: FormationId; mentality: number }>;
}

export interface Stadium {
  name: string;
  capacity: number;
  /** Average ticket price (£). */
  ticketPrice: number;
  /** An expansion being built. */
  expansion?: { seats: number; weeksLeft: number };
  /** Last home attendance. */
  lastAttendance?: number;
}

export interface ClubColors {
  primary: string;
  secondary: string;
}

export type FormationId = "4-4-2" | "4-3-3" | "4-2-3-1" | "3-5-2" | "5-3-2";

/** 1–5 sliders. 3 is neutral. */
export interface TeamInstructions {
  mentality: number;
  pressing: number;
  defensiveLine: number;
  width: number;
  tempo: number;
  directness: number;
}

export type CornerRoutine = "mixed" | "near" | "far" | "short";

/** Designated set-piece takers (player ids) and corner routine. */
export interface SetPieces {
  penalty?: string;
  freeKick?: string;
  corner?: string;
  cornerRoutine: CornerRoutine;
}

/** Individual instructions for one position slot. Missing = the role's default. */
export interface PlayerInstructions {
  shooting?: "less" | "more";
  dribbling?: "less" | "more";
  passing?: "shorter" | "direct";
  crossing?: "less" | "more";
  runs?: "hold" | "forward";
  width?: "narrow" | "wide";
  pressing?: "less" | "more";
  tackling?: "soft" | "hard";
  markTight?: boolean;
  roam?: boolean;
}

/** Instructions on how to treat one opposing player. */
export interface OppInstruction {
  markTight?: boolean;
  press?: "more" | "less";
  tackle?: "hard" | "soft";
}

/** How well the squad knows a system (0–100 per entry). */
export interface TacticalFamiliarity {
  formation: Partial<Record<FormationId, number>>;
  /** Per instruction: familiarity with each level 1–5 (index 0–4). */
  instructions: Record<keyof TeamInstructions, number[]>;
}

export interface Tactics {
  formation: FormationId;
  instructions: TeamInstructions;
  /** Player ids in formation-slot order (11). */
  lineup: string[];
  bench: string[];
  /** Role per formation slot (defaults per position when missing). */
  roles?: RoleId[];
  setPieces?: SetPieces;
  /** Player instructions per formation slot. */
  playerInstructions?: (PlayerInstructions | undefined)[];
}

export type CrestShape = "shield" | "round" | "diamond" | "classic";
export type CrestPattern = "plain" | "stripes" | "halves" | "hoops" | "sash" | "chevron";

export interface CrestDesign {
  shape: CrestShape;
  pattern: CrestPattern;
}

export interface Club {
  id: string;
  crest?: CrestDesign;
  name: string;
  shortName: string;
  colors: ClubColors;
  reputation: number;
  balance: number;
  isUser: boolean;
  tactics: Tactics;
  staff: Partial<Record<StaffRole, StaffMember>>;
  /** Youth academy quality 1–5. */
  academy: number;
  /** Local rival (derbies). */
  rivalId?: string;
  /** Training ground quality 1–5 (development speed). */
  facilities: { training: number };
  /** Team cohesion 0–100: how well the squad knows each other. */
  cohesion?: number;
  stadium?: Stadium;
  /** The AI manager (absent for the user's club). */
  manager?: AIManager;
  familiarity: TacticalFamiliarity;
}

export type TrainingFocus =
  | "balanced"
  | "attacking"
  | "defending"
  | "physical"
  | "technical"
  | "tactical";

export type TrainingIntensity = "light" | "normal" | "intense";

export type MatchPrepFocus = "none" | "familiarity" | "setPiecesAttack" | "setPiecesDefence" | "opposition";

export interface TrainingPlan {
  focus: TrainingFocus;
  intensity: TrainingIntensity;
  /** Match-specific preparation for the coming fixture (costs some development). */
  matchPrep?: MatchPrepFocus;
}

export interface Fixture {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  result?: MatchResultSummary;
}

export interface MatchResultSummary {
  homeGoals: number;
  awayGoals: number;
  scorers: { playerId: string; minute: number; side: "home" | "away" }[];
  seed: number;
  /** Knockout ties level after 90 minutes go to penalties. */
  penalties?: [number, number];
  /** Team stats [home, away] for league comparisons. */
  stats?: { xg: [number, number]; shots: [number, number]; onTarget: [number, number]; possession: number; corners: [number, number] };
}

export interface League {
  id: string;
  /** 1 = top division. */
  tier: number;
  name: string;
  season: number;
  clubIds: string[];
  fixtures: Fixture[];
  /** Next round to be played (0-based). */
  currentRound: number;
}

/** Something the user can do straight from an inbox message. */
export type InboxAction =
  | { kind: "offer"; offerId: string }
  | { kind: "youth" }
  | { kind: "contract"; playerId: string }
  | { kind: "unhappy"; playerId: string }
  | { kind: "press" }
  | { kind: "report"; reportId: string }
  | { kind: "player"; playerId: string }
  | { kind: "link"; href: string; label: string };

export interface InboxMessage {
  id: string;
  round: number;
  title: string;
  body: string;
  read: boolean;
  action?: InboxAction;
  /** Short category label shown on the message. */
  tag?: string;
}
