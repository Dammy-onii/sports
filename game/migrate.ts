import { initialBoard } from "./board";
import { totalRounds } from "./competition";
import { buildCalendar } from "./cup";
import { generateStaff, newContract, staffLevel, withSkills } from "./economy";
import { initialFamiliarity, initialRoleExp } from "./familiarity";
import { resetDevStarts } from "./progress";
import { dedupeShortNames, emptySeason, hashTraits, randomTraits } from "./generate";
import { Rng, hashString } from "./rng";
import { SAVE_VERSION, type SaveGame } from "./save";
import { autoStatuses } from "./squad";
import { defaultStadium } from "./club";
import { hashManager } from "./managers";
import { currentAbility } from "./ratings";
import { appointStaff } from "./staff";
import type { Club, League, Player } from "./types";

/** Deterministic traits for players created before traits existed. */
function backfillTraits(p: Record<string, unknown>) {
  if (!p.traits) p.traits = randomTraits(new Rng(hashString(String(p.id))));
}

/**
 * Upgrade an older save to the current schema. Each step handles one version
 * bump so saves from any past version can be loaded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateSave(input: any): SaveGame | null {
  if (!input || typeof input !== "object" || typeof input.version !== "number") return null;
  const save = input;
  if (save.version > SAVE_VERSION) return null;

  if (save.version < 2) {
    for (const p of Object.values(save.players ?? {}) as Record<string, unknown>[]) {
      const season = (p.season ?? {}) as Record<string, number>;
      p.season = { yellows: 0, reds: 0, ...season };
      p.suspension ??= 0;
    }
    save.liveMatch = null;
    save.version = 2;
  }

  if (save.version < 3) {
    // single league → one-division pyramid; transfer market state
    const league = save.league ?? save.leagues?.[0];
    delete save.league;
    save.leagues ??= [{ ...league, tier: 1 }];
    save.transferList = [];
    save.offers = [];
    save.transferLog = [];
    save.history = (save.history ?? []).map((h: Record<string, unknown>) => ({ tier: 1, leagueName: league.name, ...h }));
    save.version = 3;
  }

  if (save.version < 4) {
    for (const p of Object.values(save.players ?? {}) as Record<string, unknown>[]) backfillTraits(p);
    const setup = save.liveMatch?.setup;
    if (setup) for (const t of [setup.home, setup.away]) for (const p of [...t.lineup, ...t.bench]) backfillTraits(p);
    save.version = 4;
  }

  if (save.version < 5) {
    // richer season stats
    for (const p of Object.values(save.players ?? {}) as Record<string, unknown>[]) p.season = { ...emptySeason(), ...(p.season as object) };
    const setup = save.liveMatch?.setup;
    if (setup) for (const t of [setup.home, setup.away]) for (const p of [...t.lineup, ...t.bench]) p.season = { ...emptySeason(), ...p.season };
    save.version = 5;
  }

  if (save.version < 6) migrateTo6(save);
  if (save.version < 7) migrateTo7(save);
  if (save.version < 8) migrateTo8(save);
  if (save.version < 9) migrateTo9(save);

  // older worlds could give two clubs the same short name; harmless to re-run
  if (save.clubs) dedupeShortNames(save.clubs);
  // Optional presentation/staff fields are additive to v9. Preserve old coach effects.
  for (const club of Object.values(save.clubs ?? {}) as Club[]) {
    for (const member of Object.values(club.staff ?? {})) {
      if (!member) continue;
      if (member.role === "fitnessCoach") member.skills = { physical: member.rating, recovery: member.rating, ...member.skills };
      if (!member.history?.length) appointStaff(member, club, save.leagues?.[0]?.season ?? 1, (save.calendarIndex ?? 0) + 1);
    }
  }
  for (const member of save.staffMarket ?? []) {
    member.history ??= [];
    if (member.role === "fitnessCoach") member.skills = { physical: member.rating, recovery: member.rating, ...member.skills };
  }
  return save as SaveGame;
}

/**
 * v9 (Phase D2): AI managers for every AI club (with familiarity in the
 * formations they know), and the squad, calendar, club, analysis and media
 * state added in D2.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateTo9(save: any) {
  const season = save.leagues?.[0]?.season ?? 1;
  for (const c of Object.values(save.clubs) as Club[]) {
    if (c.isUser || c.manager) continue;
    c.manager = hashManager(c, season);
    c.manager.formations.slice(1).forEach((f, i) => (c.familiarity.formation[f] = Math.max(c.familiarity.formation[f] ?? 0, 70 - i * 10)));
  }
  for (const c of Object.values(save.clubs) as Club[]) c.cohesion ??= 60;
  for (const p of Object.values(save.players) as Player[]) {
    p.joinedSeason ??= season - (hashString(p.id + "joined") % Math.max(1, Math.min(8, p.age - 16)));
    p.rapport ??= 50;
    p.settled ??= 100;
  }
  for (const c of Object.values(save.clubs) as Club[]) c.stadium ??= defaultStadium(c);
  save.board.transferBudget ??= Math.max(0, Math.round((save.clubs[save.userClubId].balance * 0.3) / 50_000) * 50_000);
  if (!save.staffMarket.some((m: { role: string }) => m.role === "analyst")) {
    const rng = new Rng(hashString(save.id + "staff9"));
    for (const role of ["gkCoach", "fitnessCoach", "analyst", "youthCoach"] as const) {
      for (let i = 0; i < 2; i++) save.staffMarket.push(generateStaff(rng, role, staffLevel(save.clubs[save.userClubId].reputation) + rng.normal() * 3 + i));
    }
  }
  save.requests ??= [];
  // press conferences changed shape (one question → three)
  save.press = null;
  save.pressNext = null;
  save.fans ??= 60;
  save.awards ??= [];
  save.mindGames = null;
  save.preseason ??= { plans: {}, friendlies: [] };
  save.callUps ??= [];
  save.dynamics ??= { lastMeeting: -10, meetings: 0, lastXI: [] };
  save.version = 9;
}

/** v7 position weights (16 attributes), kept so migration can re-anchor potential. */
const V7_WEIGHTS: Record<string, Record<string, number>> = {
  GK: { goalkeeping: 10, positioning: 3, composure: 2, decisions: 2, passing: 1, strength: 1 },
  CB: { tackling: 4, marking: 4, heading: 3, positioning: 3, strength: 3, pace: 2, composure: 1, decisions: 1, passing: 1 },
  LB: { pace: 3, tackling: 3, marking: 2, stamina: 3, passing: 2, positioning: 2, workRate: 2, dribbling: 1 },
  RB: { pace: 3, tackling: 3, marking: 2, stamina: 3, passing: 2, positioning: 2, workRate: 2, dribbling: 1 },
  DM: { tackling: 3, positioning: 3, passing: 3, marking: 2, stamina: 2, decisions: 2, workRate: 2, strength: 1 },
  CM: { passing: 4, vision: 3, decisions: 3, stamina: 2, workRate: 2, tackling: 1, dribbling: 1, composure: 1, longShots: 1 },
  AM: { passing: 3, vision: 4, dribbling: 3, composure: 2, longShots: 2, finishing: 2, decisions: 2 },
  LM: { pace: 3, stamina: 3, passing: 3, dribbling: 2, workRate: 2, vision: 1, tackling: 1 },
  RM: { pace: 3, stamina: 3, passing: 3, dribbling: 2, workRate: 2, vision: 1, tackling: 1 },
  LW: { pace: 4, dribbling: 4, finishing: 2, passing: 2, composure: 1, vision: 1 },
  RW: { pace: 4, dribbling: 4, finishing: 2, passing: 2, composure: 1, vision: 1 },
  ST: { finishing: 5, composure: 3, positioning: 3, pace: 2, heading: 2, strength: 2, dribbling: 1 },
};

function weightedCA(attrs: Record<string, number>, weights: Record<string, number>) {
  let sum = 0;
  let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    sum += (attrs[k] ?? 10) * w;
    total += w;
  }
  return total ? (sum / total) * 10 : 0;
}

/**
 * The 21 new attributes, derived from the old 16 with stable per-player
 * variation, so existing players feel the same but gain detail.
 */
export function deriveNewAttributes(p: Player) {
  const a = p.attributes as unknown as Record<string, number>;
  const isGK = p.positions[0] === "GK";
  const n = (salt: string, spread: number) => (((hashString(p.id + salt) % 1000) / 1000) * 2 - 1) * spread;
  const set = (k: string, v: number) => {
    if (a[k] === undefined) a[k] = Math.max(1, Math.min(20, Math.round(v * 10) / 10));
  };
  set("crossing", a.passing * 0.7 + a.dribbling * 0.3 + n("cr", 1.8));
  set("firstTouch", (a.passing + a.dribbling) / 2 + n("ft", 1.5));
  set("technique", (a.passing + a.dribbling + a.firstTouch) / 3 + n("te", 1.2));
  set("freeKicks", isGK ? 3 + n("fk", 2) : (a.longShots + a.technique) / 2 + n("fk", 2.5));
  set("penalties", isGK ? 4 + n("pe", 2) : a.finishing + n("pe", 2.5));
  set("anticipation", (a.positioning + a.decisions) / 2 + n("an", 1.5));
  set("bravery", (a.strength + a.tackling) / 2 + n("br", 2.5));
  set("concentration", (a.composure + a.positioning) / 2 + n("co", 1.5));
  set("flair", a.dribbling * 0.5 + a.vision * 0.3 + 2 + n("fl", 3));
  set("leadership", 6 + (p.age - 17) * 0.35 + n("le", 3));
  set("offTheBall", (a.positioning + a.decisions + a.finishing) / 3 + n("ob", 1.5));
  set("teamwork", a.workRate + n("tw", 1.5));
  set("acceleration", a.pace + n("ac", 1.5));
  set("agility", (a.pace + a.dribbling) / 2 + n("ag", 1.5));
  set("balance", (a.strength + a.dribbling) / 2 + n("ba", 1.5));
  set("jumping", (a.heading + a.strength) / 2 + n("ju", 1.5));
  set("naturalFitness", a.stamina + n("nf", 2.5));
  set("handling", isGK ? a.goalkeeping + n("ha", 1.5) : 1 + Math.abs(n("ha", 3)));
  set("oneOnOnes", isGK ? a.goalkeeping + n("oo", 1.5) : 1 + Math.abs(n("oo", 3)));
  set("aerialReach", isGK ? a.goalkeeping + n("ar", 1.5) : 1 + Math.abs(n("ar", 3)));
  set("kicking", isGK ? a.passing + 2 + n("ki", 2) : 1 + Math.abs(n("ki", 3)));
}

/**
 * v8: 37 attributes (from 16), new personality (pressure, loyalty,
 * adaptability, sportsmanship) and match sharpness. Potential keeps the same
 * headroom above current ability under the new position weights. The v3
 * engine replays live matches differently, so one in progress is dropped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateTo8(save: any) {
  const all: Player[] = [...(Object.values(save.players) as Player[]), ...((save.youthIntake?.players as Player[]) ?? [])];
  for (const p of all) {
    const pos = p.positions[0];
    const oldCA = weightedCA(p.attributes as unknown as Record<string, number>, V7_WEIGHTS[pos] ?? {});
    deriveNewAttributes(p);
    const newCA = currentAbility(p);
    p.potential = Math.max(Math.round(newCA), Math.min(200, Math.round(p.potential + (newCA - oldCA))));
    p.traits = { ...hashTraits(p.id), ...p.traits };
    p.sharpness ??= 85;
  }
  save.liveMatch = null;
  resetDevStarts(save as SaveGame);
  save.version = 8;
}

/**
 * v7: personality (professionalism, determination, ambition), role
 * experience, career history, training facilities, tactical familiarity,
 * staff skills, match preparation and the development log. An in-progress
 * live match is dropped because the v2 engine would replay it differently.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateTo7(save: any) {
  for (const p of Object.values(save.players) as Player[]) {
    p.traits = { ...hashTraits(p.id), ...p.traits };
    p.roleExp ??= initialRoleExp(p);
    p.history ??= [];
  }
  for (const c of Object.values(save.clubs) as Club[]) {
    c.facilities ??= { training: Math.max(1, Math.min(5, Math.round(1 + c.reputation / 25))) };
    c.familiarity ??= initialFamiliarity(c.tactics.formation, c.tactics.instructions, c.isUser ? 75 : 85);
    for (const m of Object.values(c.staff ?? {})) if (m) withSkills(m);
  }
  for (const m of save.staffMarket ?? []) withSkills(m);
  save.prep = null;
  save.dev = {};
  save.liveMatch = null;
  resetDevStarts(save as SaveGame);
  save.version = 7;
}

/**
 * v6: contracts, squad status, staff, academy, rivals, calendar & cup,
 * scouting, board, manager profile, news, reports and sync metadata.
 * A save migrated mid-season finishes that season without a cup; the cup
 * starts next season.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateTo6(save: any) {
  const leagues = save.leagues as League[];
  const season = leagues[0].season;
  const tierOf = (clubId: string) => leagues.find((l) => l.clubIds.includes(clubId))?.tier ?? 1;
  const players = save.players as Record<string, Player>;
  const clubs = save.clubs as Record<string, Club>;

  for (const p of Object.values(players)) {
    const rng = new Rng(hashString(p.id + "v6"));
    p.contract ??= newContract(p, season, tierOf(p.clubId), rng);
    p.minutesHistory ??= [];
    p.unhappyWeeks ??= 0;
    p.transferRequest ??= false;
  }
  for (const club of Object.values(clubs)) {
    const rng = new Rng(hashString(club.id + "v6"));
    const squad = Object.values(players).filter((p) => p.clubId === club.id);
    const statuses = autoStatuses(squad);
    for (const p of squad) p.status ??= statuses[p.id];
    club.staff ??= Object.fromEntries(
      (["assistant", "coach", "scout", "physio"] as const).map((role) => [role, generateStaff(rng, role, staffLevel(club.reputation) + rng.normal() * 2)]),
    );
    club.academy ??= Math.max(1, Math.min(5, Math.round(1 + club.reputation / 25)));
  }
  for (const l of leagues) {
    for (let i = 0; i + 1 < l.clubIds.length; i += 2) {
      clubs[l.clubIds[i]].rivalId ??= l.clubIds[i + 1];
      clubs[l.clubIds[i + 1]].rivalId ??= l.clubIds[i];
    }
  }

  // finish the current season's league; the cup starts next season
  save.calendar = buildCalendar(totalRounds(leagues[0]), 0, false);
  save.calendarIndex = Math.min(leagues[0].currentRound, save.calendar.length);
  save.cup = { id: `cup_${season}`, name: "Cup", season, rounds: [], alive: [], byes: [] };
  save.superCup = null;
  save.knowledge = {};
  save.scouting = { assignments: [], queue: [] };
  save.shortlist = [];
  const userLeague = leagues.find((l) => l.clubIds.includes(save.userClubId)) ?? leagues[0];
  const wages = Object.values(players).filter((p) => p.clubId === save.userClubId).reduce((a, p) => a + p.contract.wage, 0);
  save.board = initialBoard(userLeague, clubs, save.userClubId, wages);
  save.manager = {
    name: save.managerName,
    reputation: 40,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    trophies: [],
    clubs: [{ clubId: save.userClubId, name: clubs[save.userClubId].name, from: 1 }],
  };
  save.jobOffers = null;
  save.news = [];
  save.reports = [];
  save.youthIntake = null;
  save.press = null;
  save.delegation = { selection: false, training: false, press: false, youth: false };
  save.onboarding = { tactics: true, training: true, match: true, scouting: false, transfers: true, dismissed: false };
  save.presets = [];
  const rng = new Rng(hashString(save.id + "market"));
  save.staffMarket = (["assistant", "coach", "scout", "physio"] as const).flatMap((role) =>
    [0, 1, 2].map((i) => generateStaff(rng, role, staffLevel(clubs[save.userClubId].reputation) + rng.normal() * 3 + i)),
  );
  save.ledger = [];
  save.sync = { deviceId: `dev_${hashString(save.id).toString(36)}`, revision: 0 };
  save.version = 6;
}
