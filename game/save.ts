import type { MatchReport } from "./analysis";
import type { MatchCommand, MatchSetup } from "./engine/types";
import type { Attributes, Club, Fixture, InboxMessage, League, OppInstruction, Player, StaffMember, Tactics, TrainingPlan } from "./types";

export const SAVE_VERSION = 9;

/** A career match that has been started but not finished (resumable). */
export interface LiveMatch {
  fixtureId: string;
  seed: number;
  /** Setup frozen at kick-off so later squad changes can't alter the replay. */
  setup: MatchSetup;
  commands: { tick: number; cmd: MatchCommand }[];
  tick: number;
}

/** An AI club's bid for one of the user's players. */
export interface TransferOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  fee: number;
  /** Last round (inclusive) the offer can be accepted in. */
  expiresRound: number;
}

export interface TransferRecord {
  season: number;
  round: number;
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
}

export interface SeasonHistory {
  season: number;
  position: number;
  points: number;
  champion: string;
  tier: number;
  leagueName: string;
  outcome?: "champions" | "promoted" | "relegated" | "sacked";
  clubName?: string;
}

/** One week of the season: a league round, a cup round, or the Super Cup. */
export type CalendarSlot =
  | { kind: "league"; round: number }
  | { kind: "cup"; round: number }
  | { kind: "super" }
  | { kind: "preseason"; week: number }
  | { kind: "intl"; n: number };

/** What the user does in a pre-season week. */
export type PreseasonPlan = { kind: "friendly"; opponentId: string; home: boolean } | { kind: "camp" } | { kind: "rest" };

export interface CupRound {
  name: string;
  fixtures: Fixture[];
}

export interface Cup {
  id: string;
  name: string;
  season: number;
  rounds: CupRound[];
  /** Clubs still in it. */
  alive: string[];
  /** Seeded clubs that skip the first round. */
  byes: string[];
  winnerId?: string;
}

export interface BoardState {
  /** 0–100. Below 15 late in a season gets you sacked. */
  confidence: number;
  objective: { label: string; targetPos: number; tier: number };
  /** Weekly wage budget the board allows. */
  wageBudget: number;
  /** Money the board lets you spend on fees this season. */
  transferBudget?: number;
  /** When each kind of request was last made (calendar index). */
  asked?: Partial<Record<string, number>>;
}

export interface Trophy {
  season: number;
  name: string;
  clubName: string;
}

export interface ManagerProfile {
  name: string;
  /** 0–100: affects job offers and players' willingness to join. */
  reputation: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  trophies: Trophy[];
  clubs: { clubId: string; name: string; from: number; to?: number }[];
  /** Manager of the Month and similar. */
  awards?: string[];
}

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  kind: "result" | "transfer" | "table" | "board" | "cup" | "injury" | "youth" | "staff";
  text: string;
}

export type PressTone = "confident" | "cautious" | "fiery" | "praise" | "critical" | "deflect" | "mindgames";

export interface PressQuestion {
  topic: "form" | "opponent" | "player" | "rumour" | "result" | "referee" | "occasion";
  text: string;
  playerId?: string;
  options: { tone: PressTone; label: string }[];
}

/** A press conference: before or after a match, three questions. */
export interface PressConference {
  kind: "pre" | "post";
  fixtureId: string;
  questions: PressQuestion[];
  /** Index of the next unanswered question. */
  answered: number;
  /** What each answer did (shown as you go). */
  outcomes: string[];
}

export interface Award {
  season: number;
  /** e.g. "Player of the Month", "Golden Boot". */
  name: string;
  /** Month number within the season, for monthly awards. */
  month?: number;
  leagueId?: string;
  playerId?: string;
  playerName?: string;
  clubId: string;
  /** "8 goals", "7.62 avg" … */
  detail: string;
}

export interface Delegation {
  selection: boolean;
  training: boolean;
  press: boolean;
  youth: boolean;
}

export interface Onboarding {
  tactics: boolean;
  training: boolean;
  match: boolean;
  scouting: boolean;
  transfers: boolean;
  dismissed: boolean;
}

export interface ScoutAssignment {
  id: string;
  kind: "position" | "league" | "youth";
  value: string;
}

export interface SyncMeta {
  /** Random id of the device that created this copy. */
  deviceId: string;
  /** Incremented on every save; used to detect conflicts when syncing. */
  revision: number;
  /** Revision last confirmed by the cloud (Phase 2). */
  syncedRevision?: number;
}

/** Preparation for the user's next fixture. */
export interface MatchPrep {
  fixtureId: string;
  /** How to treat individual opposing players. */
  opposition: Record<string, OppInstruction>;
}

/** Development log for one of the user's players. */
export interface DevLog {
  /** Attributes when the season started (or when he joined). */
  start: Attributes;
  startCA: number;
  /** [season * 100 + week, current ability] — newest last. */
  points: [number, number][];
}

/** A player who wants a word with the manager. */
export interface PlayerRequest {
  id: string;
  playerId: string;
  kind: "playtime" | "contract" | "bid" | "settling" | "criticism";
  week: number;
  text: string;
  options: { key: string; label: string }[];
}

export interface SaveGame {
  version: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  seed: number;
  /** Advances every time randomness is consumed outside matches. */
  rngState: number;
  userClubId: string;
  managerName: string;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  /** The pyramid, top tier first. All divisions share season and round. */
  leagues: League[];
  training: TrainingPlan;
  inbox: InboxMessage[];
  /** Minutes played in the last round, used for training development. */
  lastMinutes: Record<string, number>;
  history: SeasonHistory[];
  liveMatch?: LiveMatch | null;
  /** User players listed for sale. */
  transferList: string[];
  offers: TransferOffer[];
  transferLog: TransferRecord[];
  /** The season's weeks in order, and where we are. */
  calendar: CalendarSlot[];
  calendarIndex: number;
  cup: Cup;
  superCup?: Fixture | null;
  /** 0–100 scouting knowledge per player (own squad is always known). */
  knowledge: Record<string, number>;
  scouting: { assignments: ScoutAssignment[]; queue: string[] };
  shortlist: string[];
  board: BoardState;
  manager: ManagerProfile;
  /** Set when the board sacks you: clubs offering a job. */
  jobOffers: string[] | null;
  news: NewsItem[];
  /** Last few user match reports. */
  reports: MatchReport[];
  youthIntake: { players: Player[]; decideBy: number } | null;
  press: PressConference | null;
  /** A second conference waiting (e.g. pre-match after a post-match). */
  pressNext?: PressConference | null;
  delegation: Delegation;
  onboarding: Onboarding;
  /** Saved user tactics. */
  presets: { name: string; tactics: Tactics }[];
  /** Coaches/scouts/physios/assistants available to hire. */
  staffMarket: StaffMember[];
  /** Weekly finance lines for the user's club (newest first). */
  ledger: { season: number; week: number; label: string; amount: number }[];
  sync: SyncMeta;
  /** Opposition instructions for the next match. */
  prep: MatchPrep | null;
  /** Weekly development log for the user's squad. */
  dev: Record<string, DevLog>;
  /** Players asking to talk to you. */
  requests: PlayerRequest[];
  /** Pre-season plan per week (index into the pre-season), and friendlies played. */
  preseason: { plans: Record<number, PreseasonPlan>; friendlies: Fixture[] };
  /** Season analytics: a compact log of the user's matches. */
  analytics?: import("./analytics").SeasonAnalytics;
  /** Supporters' mood (0–100): crowds, the board and press reaction. */
  fans?: number;
  /** Awards won across the game world. */
  awards?: Award[];
  /** A pre-match mind game played on the next opponent: how it landed. */
  mindGames?: { fixtureId: string; landed: boolean } | null;
  /** Players away on international duty this week. */
  callUps: string[];
  /** Squad dynamics bookkeeping. */
  dynamics: { lastMeeting: number; meetings: number; lastXI: string[] };
}
