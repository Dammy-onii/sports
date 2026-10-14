import type { WordId } from "./words";
import type { RoleEffects } from "../roles";
import type { AttributeKey, Attributes, Traits, ClubColors, CrestDesign, FormationId, OppInstruction, Player, PlayerInstructions, Position, RoleId, SetPieces, ShoutId, TacticalFamiliarity, TalkTone, TeamInstructions } from "../types";

export type Side = 0 | 1; // 0 = home (attacks +x), 1 = away (attacks -x)

export interface TeamSetup {
  clubId: string;
  name: string;
  shortName: string;
  colors: ClubColors;
  crest?: CrestDesign;
  formation: FormationId;
  instructions: TeamInstructions;
  /** Players in lineup order (11) followed by bench. */
  lineup: Player[];
  bench: Player[];
  /** AI makes subs / tactical changes for this side. */
  isAI: boolean;
  /** Role per lineup slot. */
  roles?: RoleId[];
  setPieces?: SetPieces;
  /** What the squad knows of its tactics (missing = treated as well drilled). */
  familiarity?: TacticalFamiliarity;
  /** Player instructions per lineup slot. */
  playerInstructions?: (PlayerInstructions | undefined)[];
  /** How this side treats individual opponents (by player id). */
  opposition?: Record<string, OppInstruction>;
  /** Match-specific training done in the build-up. */
  prep?: MatchPrepEffects;
  /** Derby, cup tie or title decider: team talks hit harder. */
  bigMatch?: boolean;
  /** The AI manager in the dugout (drives in-match adaptation). */
  manager?: DugoutManager;
  /** Team cohesion 0–100. */
  cohesion?: number;
}

export interface DugoutManager {
  name: string;
  style: string;
  adaptability: number;
  knowledge: number;
  formations: FormationId[];
}

export interface MatchPrepEffects {
  setPiecesAttack?: boolean;
  setPiecesDefence?: boolean;
  opposition?: boolean;
}

export interface MatchSetup {
  home: TeamSetup;
  away: TeamSetup;
}

export interface PlayerMatchStats {
  touches: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  xg: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  dribbles: number;
  fouls: number;
  saves: number;
  conceded: number;
  possessionLost: number;
  offsides: number;
  /** Times this player was the nearest defender to a misplaced pass. */
  interceptChances: number;
  /** ...and how often they read it and won it. */
  interceptReads: number;
  /** Metres covered. */
  distance: number;
  /** Metres covered with the ball at feet. */
  carryDistance: number;
}

export interface MPlayer {
  idx: number;
  id: string;
  side: Side;
  name: string;
  shortName: string;
  shirt: number;
  /** Formation slot index; -1 when on bench / off. */
  slot: number;
  pos: Position;
  naturalPositions: Position[];
  attrs: Attributes;
  traits: Traits;
  role: RoleId;
  /** Experience per role (0–100), so mid-match role changes use the right familiarity. */
  roleExp?: Partial<Record<RoleId, number>>;
  /** 0–1 experience in his current role. */
  roleFam: number;
  /** Individual instructions for his slot. */
  pi?: PlayerInstructions;
  /** How the opposition has been told to treat him. */
  oi?: OppInstruction;
  /** Role effects after role familiarity and player instructions (recomputed on change). */
  fx: RoleEffects;
  /** Mirror of the team's tactical familiarity (0–1). */
  teamFam: number;
  /** 0–100; affects performance slightly and reacts to team talks. */
  morale: number;
  /** Mirror of the team's active shout (read by the attribute model). */
  teamShout: ShoutId | null;
  fam: number;
  x: number;
  y: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  energy: number;
  onPitch: boolean;
  used: boolean; // has appeared (for minutes / bench eligibility)
  subbedOff: boolean;
  yellow: number;
  sentOff: boolean;
  injured: boolean;
  ticksPlayed: number;
  /** Ticks until this player can attempt another tackle. */
  duelCd: number;
  /** Stable hash of the id (timing of runs, idle drift). */
  hash: number;
  /** Making a run this tick (sprints instead of jogging). Transient. */
  sprint: boolean;
  /** Copied from team form. */
  form: number;
  /** Current running speed (m/s): players carry momentum, acceleration builds it. */
  spd: number;
  /** In-match emotions (see docs/DEPTH_PLAN.md §6). */
  emo: Emotions;
  /** An active word from the touchline: attribute multipliers until he's played `until` seconds. */
  word?: { id: string; until: number; mult: Partial<Record<AttributeKey, number>> };
  /** Played-seconds marks of recent words (nagging wears thin). */
  wordsAt?: number[];
  /** Match sharpness 0–1 (rhythm from playing regularly). */
  sharp: number;
  /** Relationship with the manager (0–100): how well talks land. */
  rapport: number;
  /** Pre-match emotional boost from a conversation. */
  boost?: { conf: number; nerves: number; frus: number };
  /** Per-tick cache of attribute multipliers (engine-internal). */
  ec?: { tick: number; base: number; touch: number; mind: number; tactical: number; tackle: number };
  st: PlayerMatchStats;
}

export interface Emotions {
  /** −1 (shot to pieces) … +1 (on fire). */
  conf: number;
  /** 0 (calm) … 1 (rattled). */
  nerves: number;
  /** 0 (cool) … 1 (seeing red). */
  frus: number;
  /** Tick of the last visible reaction (so commentary doesn't repeat). */
  shown: number;
}

export interface TeamStats {
  possessionTicks: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  fouls: number;
  corners: number;
  yellows: number;
  reds: number;
  saves: number;
  offsides: number;
}

export interface TeamState {
  side: Side;
  clubId: string;
  name: string;
  shortName: string;
  colors: ClubColors;
  crest?: CrestDesign;
  formation: FormationId;
  instructions: TeamInstructions;
  isAI: boolean;
  playerIdx: number[];
  subsUsed: number;
  /** Match-day performance multiplier (on/off days), ~0.94–1.06. */
  form: number;
  stats: TeamStats;
  /** Active touchline shout. */
  shout: ShoutId | null;
  /** Tick a shout last moved the players' emotions (repeating it straight away does nothing more). */
  shoutAt?: number;
  setPieces?: SetPieces;
  /** Half-time team talk given (tone), if any. */
  talk?: TalkTone;
  /** Pre-match team talk given, if any. */
  preTalk?: TalkTone;
  familiarity?: TacticalFamiliarity;
  /** Overall tactical familiarity right now (0–1). */
  fam: number;
  /** Player instructions per formation slot. */
  pis: (PlayerInstructions | undefined)[];
  /** Instructions on opposing players (by id). */
  opposition: Record<string, OppInstruction>;
  prep: MatchPrepEffects;
  bigMatch?: boolean;
  manager?: DugoutManager;
  /** Tick of the AI manager's last tactical review. */
  aiReview?: number;
  /** Link-up edge from cohesion (−0.5 … +0.5). */
  cohesion: number;
}

export type FlightKind = "pass" | "long" | "cross" | "shot" | "clear";

export interface Flight {
  kind: FlightKind;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  dur: number;
  passer: number;
  /** Who will receive when the flight lands (null → loose ball). */
  receiver: number | null;
  /** Resolved outcome for shots, applied on arrival. */
  shot?: ShotOutcome;
  /** Out of play on landing. */
  out?: Restart;
}

export interface ShotOutcome {
  shooter: number;
  result: "goal" | "saved" | "held" | "wide" | "blocked";
  xg: number;
  header: boolean;
  penalty: boolean;
  corner: boolean;
  /** Came from a corner or direct free kick. */
  setPiece?: boolean;
}

export type RestartType = "kickoff" | "throwin" | "goalkick" | "corner" | "freekick" | "penalty";

export interface Restart {
  type: RestartType;
  side: Side;
  x: number;
  y: number;
}

export interface BallState {
  x: number;
  y: number;
  px: number;
  py: number;
  /** Height (0–1) for rendering arcs. */
  z: number;
  owner: number | null;
  flight: Flight | null;
}

export type MatchEventType =
  | "kickoff"
  | "goal"
  | "shot_saved"
  | "shot_wide"
  | "shot_blocked"
  | "foul"
  | "yellow"
  | "red"
  | "corner"
  | "freekick"
  | "penalty"
  | "sub"
  | "injury"
  | "halftime"
  | "fulltime"
  | "tactics"
  | "chance"
  | "tackle"
  | "big_save"
  | "offside"
  | "shout"
  | "talk"
  | "heavy_touch"
  | "claim"
  | "emotion"
  | "word";

export interface MatchEvent {
  tick: number;
  minute: number;
  type: MatchEventType;
  side: Side;
  player?: string;
  other?: string;
  xg?: number;
  header?: boolean;
  penalty?: boolean;
  /** Shots: where it was taken from (team-relative, 0–1, attacking right). */
  x?: number;
  y?: number;
  setPiece?: boolean;
  score?: [number, number];
  text?: string;
}

export type MatchCommand =
  | { type: "instructions"; side: Side; instructions: TeamInstructions }
  | { type: "formation"; side: Side; formation: FormationId }
  | { type: "sub"; side: Side; outId: string; inId: string }
  | { type: "role"; side: Side; slot: number; role: RoleId }
  | { type: "shout"; side: Side; shout: ShoutId | null }
  | { type: "teamTalk"; side: Side; tone: TalkTone }
  | { type: "pi"; side: Side; slot: number; pi: PlayerInstructions | null }
  | { type: "oi"; side: Side; playerId: string; oi: OppInstruction | null }
  | { type: "word"; side: Side; playerId: string; word: WordId };

/** Data recorded during the match for analysis views. */
export interface MatchAnalytics {
  /** Per player idx: visits per cell of a 12×8 grid (team-relative, attacking right). */
  heat: number[][];
  /** "passerIdx-receiverIdx" → completed passes. */
  links: Record<string, number>;
  /** Per player idx: summed team-relative x, y and sample count (average position). */
  pos: [number, number, number][];
  /** Per minute: home attacking threat minus away (momentum). */
  momentum: number[];
}

export const HEAT_COLS = 12;
export const HEAT_ROWS = 8;

export type Phase = "play" | "dead" | "halftime" | "fulltime";

export interface MatchState {
  engineVersion: number;
  seed: number;
  rngState: number;
  tick: number;
  half: 1 | 2;
  halfStartTick: number;
  halfLength: number; // ticks incl. stoppage for current half
  phase: Phase;
  deadTimer: number;
  restart: Restart | null;
  teams: [TeamState, TeamState];
  players: MPlayer[];
  ball: BallState;
  possession: Side;
  holdTimer: number;
  dribbleTo: { x: number; y: number } | null;
  lastPass: { passer: number; receiver: number; tick: number } | null;
  score: [number, number];
  events: MatchEvent[];
  commands: { tick: number; cmd: MatchCommand }[];
  kickoffSide: Side;
  /** Seconds of stoppage per half, decided at kickoff of each half. */
  stoppage: [number, number];
  analytics: MatchAnalytics;
}
