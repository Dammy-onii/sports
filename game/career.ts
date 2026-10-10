import { buildReport } from "./analysis";
import { initialBoard, seasonObjective, seasonReview, weeklyBoardReview } from "./board";
import { fixturesForRound, leagueTable, roundRobin, totalRounds } from "./competition";
import { advanceCup, buildCalendar, createCup, cupRoundCount, PRESEASON_WEEKS, shootout, tieWinner } from "./cup";
import { generateStaff, newContract, staffLevel, staffRating, weeklyCosts, weeklyIncome } from "./economy";
import { applyCommand, createMatch, isFinished, playerRating, simulateMatch, stepMatch } from "./engine";
import type { MatchSetup, MatchState, Side } from "./engine/types";
import { emptySeason, generateWorld, makeId } from "./generate";
import { isBigMatch, pushNews } from "./news";
import { delegatePress, fansAfterResult, matchNews, monthlyAwards, postMatchPress, preMatchPress, presentAwards, seasonAwards, transferRumours } from "./media";
import { formatMoney, overall } from "./ratings";
import { Rng, hashString } from "./rng";
import { TRAINING_FOCUS } from "./constants";
import { SAVE_VERSION, type CalendarSlot, type LiveMatch, type SaveGame } from "./save";
import { addKnowledge, weeklyScouting } from "./scouting";
import { matchSetupFor, type UserPrep } from "./setup";
import { autoStatuses, recordMinutes, weeklyMorale } from "./squad";
import { autoPickLineup, autoRoles, autoSetPieces, repairLineup } from "./tactics";
import { trainWeek } from "./training";
import { recordMatch } from "./analytics";
import { attendance, defaultStadium, seasonTransferBudget, stadiumWeek } from "./club";
import { CAMP_COST, friendlyFixture, internationalBreak, planFor, summerRust, weeklySharpness } from "./calendar";
import { generateRequests, weeklyDynamics } from "./dynamics";
import { STYLE_INFO, generateManager, rememberOpponent, shouldSack } from "./managers";
import { coachSkills, staffSkill } from "./development";
import { weeklyFamiliarity } from "./familiarity";
import { developmentReport, recordCareerSeason, recordDevWeek, resetDevStarts } from "./progress";
import { FREE_AGENT, aiTransferActivity, executeTransfer, expireOffers, generateOffers, isDeadlineWeek, returnLoans } from "./transfers";
import type { ClubColors, CrestDesign, Fixture, FormationId, InboxAction, InboxMessage, League, Player, RoleId, TalkTone, TeamInstructions, TrainingFocus } from "./types";
import { autoSignYouth, generateIntake, intakeSummary, topUpSquad } from "./youth";
import { talkReaction } from "./roles";

/** Clubs promoted / relegated between each pair of adjacent divisions. */
export const PROMOTION_PLACES = 2;

export interface NewCareerInput {
  managerName: string;
  clubName: string;
  shortName: string;
  colors: ClubColors;
  crest?: CrestDesign;
  formation: FormationId;
  seed?: number;
  /** Divisions in the pyramid (default 2). */
  divisions?: number;
  /** Tier the user starts in (default: the lowest). */
  startTier?: number;
}

export function newCareer(input: NewCareerInput): SaveGame {
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const divisions = input.divisions ?? 2;
  const world = generateWorld(
    seed,
    { name: input.clubName, shortName: input.shortName, colors: input.colors, crest: input.crest, formation: input.formation },
    { divisions, userTier: input.startTier ?? divisions },
  );
  const rng = new Rng(seed ^ 0x9e3779b9);
  const now = Date.now();
  const allClubs = Object.values(world.clubs);
  const cup = createCup(allClubs, 1, cupName(world.leagues[0]), rng);
  const userClub = world.clubs[world.userClubId];
  const save: SaveGame = {
    version: SAVE_VERSION,
    id: makeId("save", rng),
    createdAt: now,
    updatedAt: now,
    seed,
    rngState: rng.getState(),
    userClubId: world.userClubId,
    managerName: input.managerName,
    clubs: world.clubs,
    players: world.players,
    leagues: world.leagues,
    training: { focus: "balanced", intensity: "normal" },
    inbox: [],
    lastMinutes: {},
    history: [],
    liveMatch: null,
    transferList: [],
    offers: [],
    transferLog: [],
    calendar: buildCalendar(totalRounds(world.leagues[0]), cupRoundCount(allClubs.length), false, { preseason: PRESEASON_WEEKS, intl: true }),
    calendarIndex: 0,
    cup,
    superCup: null,
    knowledge: {},
    scouting: { assignments: [], queue: [] },
    shortlist: [],
    board: { confidence: 60, objective: { label: "", targetPos: 6, tier: 2 }, wageBudget: 0 },
    manager: {
      name: input.managerName,
      reputation: 40,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      trophies: [],
      clubs: [{ clubId: world.userClubId, name: userClub.name, from: 1 }],
    },
    jobOffers: null,
    news: [],
    reports: [],
    youthIntake: null,
    press: null,
    delegation: { selection: false, training: false, press: false, youth: false },
    onboarding: { tactics: false, training: false, match: false, scouting: false, transfers: false, dismissed: false },
    presets: [],
    staffMarket: [],
    ledger: [],
    sync: { deviceId: makeId("dev", rng), revision: 0 },
    prep: null,
    dev: {},
    requests: [],
    dynamics: { lastMeeting: -10, meetings: 0, lastXI: [] },
    preseason: { plans: {}, friendlies: [] },
    callUps: [],
    fans: 60,
    awards: [],
    mindGames: null,
    pressNext: null,
  };
  save.board = initialBoard(userLeague(save), save.clubs, save.userClubId, wageBill(save, save.userClubId));
  save.staffMarket = staffMarket(rng, userClub.reputation);
  save.board.transferBudget = seasonTransferBudget(save);
  userClub.tactics.setPieces = autoSetPieces(userClub.tactics.lineup.map((id) => save.players[id]));
  resetDevStarts(save);
  summerRust(save);
  const league = userLeague(save);
  pushMessage(save, {
    title: `Welcome to ${input.clubName}`,
    body: `The board's objective for this season: ${save.board.objective.label.toLowerCase()} in the ${league.name}. Set your tactics, plan training and good luck, ${input.managerName}.`,
    tag: "Board",
  });
  return save;
}

function cupName(top: League) {
  return top.name.replace(/ Premier Division$/, "") + " Cup";
}

function staffMarket(rng: Rng, reputation: number) {
  const out = [];
  for (const role of ["assistant", "coach", "scout", "physio", "gkCoach", "fitnessCoach", "analyst", "youthCoach"] as const) {
    for (let i = 0; i < (["assistant", "coach", "scout", "physio"].includes(role) ? 3 : 2); i++) out.push(generateStaff(rng, role, staffLevel(reputation) + rng.normal() * 3 + i));
  }
  return out;
}

export function pushMessage(save: SaveGame, m: { title: string; body: string; action?: InboxAction; tag?: string }) {
  const msg: InboxMessage = {
    id: `m_${currentSeason(save)}_${save.calendarIndex}_${save.inbox.length}_${hashString(m.title) % 1000}`,
    round: currentRound(save),
    title: m.title,
    body: m.body,
    read: false,
    action: m.action,
    tag: m.tag,
  };
  save.inbox = [msg, ...save.inbox].slice(0, 80);
}

export function squadOf(save: SaveGame, clubId: string): Player[] {
  return Object.values(save.players).filter((p) => p.clubId === clubId);
}

export function wageBill(save: SaveGame, clubId: string): number {
  let total = 0;
  for (const p of Object.values(save.players)) {
    if (p.clubId === clubId) total += p.contract.wage * (p.loan ? p.loan.wageShare : 1);
    else if (p.loan?.fromClubId === clubId) total += p.contract.wage * (1 - p.loan.wageShare);
  }
  return Math.round(total);
}

export function staffBill(save: SaveGame, clubId: string): number {
  return Object.values(save.clubs[clubId]?.staff ?? {}).reduce((a, s) => a + (s?.wage ?? 0), 0);
}

export function currentRound(save: SaveGame) {
  return save.leagues[0].currentRound;
}

export function currentSeason(save: SaveGame) {
  return save.leagues[0].season;
}

export function leagueOfClub(save: SaveGame, clubId: string): League {
  return save.leagues.find((l) => l.clubIds.includes(clubId)) ?? save.leagues[0];
}

export function userLeague(save: SaveGame): League {
  return leagueOfClub(save, save.userClubId);
}

export function isSeasonOver(save: SaveGame) {
  return save.calendarIndex >= save.calendar.length;
}

export function currentSlot(save: SaveGame): CalendarSlot | undefined {
  return save.calendar[save.calendarIndex];
}

export type Competition = "league" | "cup" | "super" | "friendly";

export interface SlotFixture {
  fixture: Fixture;
  comp: Competition;
  label: string;
}

/** Every fixture played this week, labelled by competition. */
export function slotFixtures(save: SaveGame, slot = currentSlot(save)): SlotFixture[] {
  if (!slot) return [];
  if (slot.kind === "league") {
    return save.leagues.flatMap((l) => fixturesForRound(l, slot.round).map((fixture) => ({ fixture, comp: "league" as const, label: `Matchday ${slot.round + 1}` })));
  }
  if (slot.kind === "cup") {
    const r = save.cup.rounds[slot.round];
    return (r?.fixtures ?? []).map((fixture) => ({ fixture, comp: "cup" as const, label: `${save.cup.name} · ${r.name}` }));
  }
  if (slot.kind === "preseason") {
    const f = friendlyFixture(save, slot.week);
    if (!f) return [];
    const opp = save.clubs[f.homeId === save.userClubId ? f.awayId : f.homeId];
    return [{ fixture: f, comp: "friendly" as const, label: `Pre-season friendly v ${opp?.name ?? "?"}` }];
  }
  if (slot.kind === "intl") return [];
  return save.superCup ? [{ fixture: save.superCup, comp: "super" as const, label: "Super Cup" }] : [];
}

export function userSlotFixture(save: SaveGame): SlotFixture | undefined {
  return slotFixtures(save).find((x) => x.fixture.homeId === save.userClubId || x.fixture.awayId === save.userClubId);
}

export function userFixture(save: SaveGame): Fixture | undefined {
  return userSlotFixture(save)?.fixture;
}

/** What this week is, from the user's point of view. */
export function weekLabel(save: SaveGame): string {
  const slot = currentSlot(save);
  if (!slot) return "Season complete";
  const mine = userSlotFixture(save);
  if (mine) return mine.label;
  if (slot.kind === "cup") return `${save.cup.name} week (you're not playing)`;
  if (slot.kind === "super") return "Super Cup week (you're not playing)";
  if (slot.kind === "preseason") {
    const plan = planFor(save, slot.week);
    return `Pre-season week ${slot.week + 1}: ${plan.kind === "camp" ? "training camp" : "rest and recovery"}`;
  }
  if (slot.kind === "intl") return "International break";
  return `Matchday ${slot.round + 1}`;
}

export function fixtureSeed(save: SaveGame, f: Fixture): number {
  return (hashString(f.id) ^ save.seed) >>> 0;
}

/** Keep the user's chosen XI but make it valid (injuries etc.). */
export function validateUserTactics(save: SaveGame) {
  const club = save.clubs[save.userClubId];
  const squad = squadOf(save, club.id);
  if (save.delegation.selection) {
    const picked = autoPickLineup(squad, club.tactics.formation);
    club.tactics = { ...club.tactics, ...picked, roles: autoRoles(save.players, club.tactics.formation, picked.lineup) };
    return;
  }
  const fixed = repairLineup(squad, club.tactics.formation, club.tactics.lineup, club.tactics.bench);
  club.tactics = { ...club.tactics, ...fixed };
}

function applyResult(save: SaveGame, f: Fixture, s: MatchState, rng: Rng, comp: Competition, minutes: Record<string, number>) {
  const knockout = comp === "cup" || comp === "super";
  const friendly = comp === "friendly";
  f.result = {
    homeGoals: s.score[0],
    awayGoals: s.score[1],
    seed: s.seed,
    scorers: s.events
      .filter((e) => e.type === "goal" && e.player)
      .map((e) => ({ playerId: e.player!, minute: e.minute, side: e.side === 0 ? ("home" as const) : ("away" as const) })),
    penalties: knockout && s.score[0] === s.score[1] ? shootout(s, rng) : undefined,
    stats: {
      xg: [Math.round(s.teams[0].stats.xg * 100) / 100, Math.round(s.teams[1].stats.xg * 100) / 100],
      shots: [s.teams[0].stats.shots, s.teams[1].stats.shots],
      onTarget: [s.teams[0].stats.shotsOnTarget, s.teams[1].stats.shotsOnTarget],
      possession: Math.round((s.teams[0].stats.possessionTicks / Math.max(1, s.teams[0].stats.possessionTicks + s.teams[1].stats.possessionTicks)) * 100),
      corners: [s.teams[0].stats.corners, s.teams[1].stats.corners],
    },
  };

  for (const mp of s.players) {
    const p = save.players[mp.id];
    if (!p) continue;
    if (!mp.used) continue;
    const mins = Math.round(mp.ticksPlayed / 60);
    minutes[p.id] = mins;
    save.lastMinutes[p.id] = mins;
    p.fitness = Math.max(30, Math.round(mp.energy * 100));
    // in-match morale (team talks, shouts) carries over partly
    p.morale = Math.max(0, Math.min(100, p.morale + (mp.morale - p.morale) * 0.5));
    // how he felt at the end carries into the week: pride, or anger (worse if hooked early)
    const hooked = mp.subbedOff && !mp.injured && mp.ticksPlayed < 60 * 60;
    p.morale = Math.max(0, Math.min(100, p.morale + mp.emo.conf * 8 - mp.emo.frus * 4 - (hooked ? 5 : 0)));
    const rating = playerRating(s, mp);
    // friendlies sharpen players and can injure them, but don't count toward the season
    if (friendly) {
      if (mp.injured) {
        p.injuryWeeks = Math.max(p.injuryWeeks, rng.int(1, 3));
        p.injuryLength = p.injuryWeeks;
      }
      continue;
    }
    p.form = [...p.form, rating].slice(-5);
    const ss = p.season;
    const st = mp.st;
    ss.apps++;
    ss.minutes += mins;
    ss.goals += st.goals;
    ss.assists += st.assists;
    ss.shots += st.shots;
    ss.shotsOnTarget += st.shotsOnTarget;
    ss.xg += st.xg;
    ss.passes += st.passes;
    ss.passesCompleted += st.passesCompleted;
    ss.keyPasses += st.keyPasses;
    ss.dribbles += st.dribbles;
    ss.tackles += st.tackles;
    ss.tacklesWon += st.tacklesWon;
    ss.interceptions += st.interceptions;
    ss.fouls += st.fouls;
    ss.offsides += st.offsides;
    ss.saves += st.saves;
    ss.conceded += mp.pos === "GK" ? st.conceded : 0;
    if (mp.pos === "GK" && s.score[1 - mp.side] === 0 && mins >= 60) ss.cleanSheets++;
    ss.ratingSum += rating;
    ss.distance += st.distance;
    // fragile players take longer to come back; a good physio helps
    if (mp.injured) {
      const physio = staffRating(save.clubs[p.clubId]?.staff, "physio");
      const worst = 3 + Math.round((p.traits?.injuryProneness ?? 10) / 5) - Math.floor(physio / 10);
      p.injuryWeeks = Math.max(p.injuryWeeks, rng.int(1, Math.max(1, worst)));
      p.injuryLength = p.injuryWeeks;
    }
    // Discipline: straight red = 3 games, second yellow = 1, every 5th booking = 1
    const before = p.season.yellows;
    p.season.yellows += mp.yellow;
    if (mp.sentOff) {
      p.season.reds++;
      const second = s.events.some((e) => e.type === "red" && e.player === mp.id && e.text === "second");
      p.suspension += second ? 1 : 3;
    }
    if (Math.floor(p.season.yellows / 5) > Math.floor(before / 5)) p.suspension += 1;
  }

  if (friendly) {
    for (const mp of s.players) if (mp.used && save.players[mp.id] && mp.side !== (f.homeId === save.userClubId ? 0 : 1)) addKnowledge(save, mp.id, 20);
    return;
  }
  const winnerId = knockout ? tieWinner(f) : undefined;
  [f.homeId, f.awayId].forEach((clubId, side) => {
    const club = save.clubs[clubId];
    const gf = s.score[side];
    const ga = s.score[1 - side];
    const won = knockout ? winnerId === clubId : gf > ga;
    const drew = !knockout && gf === ga;
    const derby = club.rivalId === (side === 0 ? f.awayId : f.homeId);
    const moraleDelta = (won ? 8 : drew ? 1 : -6) * (derby ? 1.5 : 1);
    for (const p of squadOf(save, clubId)) p.morale = Math.max(0, Math.min(100, p.morale + moraleDelta));
    club.reputation = Math.max(1, Math.min(100, club.reputation + (won ? 0.3 : drew ? 0 : -0.2)));
    if (clubId === save.userClubId) {
      const m = save.manager;
      m.played++;
      if (won) m.won++;
      else if (drew) m.drawn++;
      else m.lost++;
      m.reputation = Math.max(0, Math.min(100, m.reputation + (won ? 0.25 : drew ? 0 : -0.15)));
    }
  });

  // you learn a lot about players you face
  const userSide: Side | null = f.homeId === save.userClubId ? 0 : f.awayId === save.userClubId ? 1 : null;
  if (userSide !== null) {
    for (const mp of s.players) if (mp.side !== userSide && mp.used) addKnowledge(save, mp.id, 20);
  }
}

/**
 * Match setup for a fixture, including the user's preparation (opposition
 * instructions, match training) and whether it's a big occasion.
 */
export function fixtureSetup(save: SaveGame, f: Fixture, opts: { allAI?: boolean } = {}): MatchSetup {
  const home = save.clubs[f.homeId];
  const away = save.clubs[f.awayId];
  const userSide = f.homeId === save.userClubId ? "home" : f.awayId === save.userClubId ? "away" : null;
  const sf = slotFixtures(save).find((x) => x.fixture.id === f.id);
  const slot = currentSlot(save);
  const roundName = slot?.kind === "cup" ? save.cup.rounds[slot.round]?.name : undefined;
  const big = !!userSide && !!sf && !!isBigMatch(save, f, sf.comp, roundName);
  const prep: UserPrep | undefined =
    userSide !== null ? { side: userSide, opposition: save.prep?.fixtureId === f.id ? save.prep.opposition : {}, focus: save.training.matchPrep } : undefined;
  const setup = matchSetupFor(home, away, save.players, {
    homeAI: opts.allAI ? true : undefined,
    awayAI: opts.allAI ? true : undefined,
    prep,
    bigMatch: big || home.rivalId === away.id,
  });
  // pre-match mind games: their players feel it (or are fired up by it)
  if (userSide && save.mindGames?.fixtureId === f.id) {
    const theirs = userSide === "home" ? setup.away : setup.home;
    const lift = save.mindGames.landed ? { conf: -0.04, nerves: 0.1, frus: 0.04 } : { conf: 0.06, nerves: 0, frus: 0 };
    theirs.lineup = theirs.lineup.map((p) => ({ ...p, boost: { ...lift, week: save.calendarIndex } }));
  }
  return setup;
}

export function simulateFixture(save: SaveGame, f: Fixture): MatchState {
  return simulateMatch(fixtureSetup(save, f, { allAI: true }), fixtureSeed(save, f));
}

/** The assistant's training plan: fix the XI's weakest area, ease off when legs are tired. */
function delegatedTraining(save: SaveGame) {
  const club = save.clubs[save.userClubId];
  const xi = club.tactics.lineup.map((id) => save.players[id]).filter(Boolean);
  const avg = (keys: readonly string[]) => xi.reduce((a, p) => a + keys.reduce((b, k) => b + p.attributes[k as keyof Player["attributes"]], 0) / keys.length, 0) / Math.max(1, xi.length);
  const focuses: TrainingFocus[] = ["attacking", "defending", "physical", "technical", "tactical"];
  const weakest = focuses.sort((a, b) => avg(TRAINING_FOCUS[a].keys) - avg(TRAINING_FOCUS[b].keys))[0];
  const fitness = xi.reduce((a, p) => a + p.fitness, 0) / Math.max(1, xi.length);
  save.training = { focus: weakest, intensity: fitness < 80 ? "light" : "normal" };
}

export interface RoundOptions {
  /** Full-time team talk to the user's squad after a live match. */
  ftTalk?: TalkTone;
}

/**
 * Play out the current week: matches (league, cup or Super Cup), money,
 * training, morale, scouting, transfers, board, press and news. Returns a new
 * save (the input is not mutated).
 */
export function completeRound(input: SaveGame, userMatch?: MatchState, opts: RoundOptions = {}): SaveGame {
  const save: SaveGame = structuredClone(input);
  if (isSeasonOver(save) || save.jobOffers) return save;
  const rng = new Rng(save.rngState);
  const slot = currentSlot(save)!;
  save.lastMinutes = {};

  // AI clubs pick their best available XI and roles each week
  for (const club of Object.values(save.clubs)) {
    if (club.isUser) continue;
    topUpSquad(save, rng, club, currentSeason(save), leagueOfClub(save, club.id).tier, 18);
    const picked = autoPickLineup(squadOf(save, club.id), club.tactics.formation);
    club.tactics = { ...club.tactics, ...picked, roles: autoRoles(save.players, club.tactics.formation, picked.lineup) };
  }
  if (save.delegation.training) delegatedTraining(save);
  // can't name a side: the academy sends up emergency cover
  const userClub = save.clubs[save.userClubId];
  const before = squadOf(save, userClub.id).length;
  topUpSquad(save, rng, userClub, currentSeason(save), leagueOfClub(save, userClub.id).tier, 0);
  const called = squadOf(save, userClub.id).length - before;
  if (called > 0) pushMessage(save, { title: "Emergency call-ups", body: `You didn't have enough fit players, so ${called} youth-team player${called > 1 ? "s were" : " was"} promoted to the first team.`, tag: "Squad" });
  validateUserTactics(save);

  // Players banned going into this week serve one match of their ban.
  const serving = Object.values(save.players).filter((p) => p.suspension > 0);

  // A started-but-abandoned live match is finished from where it was left.
  const mine = userSlotFixture(save);
  if (!userMatch && save.liveMatch && mine && save.liveMatch.fixtureId === mine.fixture.id) {
    userMatch = finishLiveMatch(save.liveMatch, mine.fixture.homeId === save.userClubId ? 0 : 1);
  }
  save.liveMatch = null;
  // a conference left unanswered: the assistant fronts it
  if (save.press) delegatePress(save);
  if (save.pressNext) {
    save.press = save.pressNext;
    save.pressNext = null;
    delegatePress(save);
  }

  // who was where at the start of the week (to count new arrivals for cohesion)
  const startSquads = new Map<string, string>(Object.values(save.players).map((p) => [p.id, p.clubId]));
  // a pre-season friendly is stored now so its result is kept
  if (slot.kind === "preseason") {
    save.preseason.plans[slot.week] = planFor(save, slot.week);
    friendlyFixture(save, slot.week, true);
  }
  const minutes: Record<string, number> = {};
  const played = new Set<string>();
  // what each club actually played this week, for tactical familiarity
  const matchTactics: Record<string, { formation: FormationId; instructions: TeamInstructions; roleMinutes: [string, RoleId, number][] }> = {};
  let userSummary = "";
  let userReportId: string | undefined;
  for (const { fixture: f, comp, label } of slotFixtures(save, slot)) {
    if (f.result) continue;
    const isUser = f.homeId === save.userClubId || f.awayId === save.userClubId;
    const state = isUser && userMatch ? userMatch : simulateFixture(save, f);
    applyResult(save, f, state, rng, comp, minutes);
    played.add(f.homeId);
    played.add(f.awayId);
    for (const t of state.teams) {
      matchTactics[t.clubId] = {
        formation: t.formation,
        instructions: { ...t.instructions },
        roleMinutes: t.playerIdx.map((i) => state.players[i]).filter((p) => p.used).map((p) => [p.id, p.role, Math.round(p.ticksPlayed / 60)]),
      };
    }
    if (isUser && save.prep?.fixtureId === f.id) save.prep = null;
    // the opposing manager remembers how the user set up
    if (isUser) {
      const userSide = f.homeId === save.userClubId ? 0 : 1;
      const oppClub = save.clubs[userSide === 0 ? f.awayId : f.homeId];
      const ut = state.teams[userSide];
      if (oppClub.manager) rememberOpponent(oppClub.manager, save.userClubId, ut.formation, ut.instructions.mentality);
    }
    if (comp !== "friendly") matchNews(save, f, state, label);
    if (isUser && comp !== "friendly") {
      recordMatch(save, state, f.id, label);
      const side = f.homeId === save.userClubId ? 0 : 1;
      const won = (comp === "league" ? state.score[side] > state.score[1 - side] : tieWinner(f) === save.userClubId);
      const drew = comp === "league" && state.score[0] === state.score[1];
      fansAfterResult(save, won, drew, save.clubs[save.userClubId].rivalId === (side === 0 ? f.awayId : f.homeId));
      save.press = postMatchPress(save, f, state);
      if (save.delegation.press) delegatePress(save);
    }
    if (isUser) {
      const h = save.clubs[f.homeId];
      const a = save.clubs[f.awayId];
      const pen = (f.result as Fixture["result"])?.penalties;
      const pens = pen ? ` (${pen[0]}–${pen[1]} pens)` : "";
      userSummary = `${label}: ${h.name} ${state.score[0]}–${state.score[1]} ${a.name}${pens}`;
      const report = buildReport(state, {
        id: `r_${f.id}`,
        fixtureId: f.id,
        competition: label,
        season: currentSeason(save),
        userSide: f.homeId === save.userClubId ? 0 : 1,
      });
      if (pen) report.penalties = pen;
      save.reports = [report, ...save.reports].slice(0, 6);
      userReportId = report.id;
      // full-time team talk
      if (opts.ftTalk) {
        const side = f.homeId === save.userClubId ? 0 : 1;
        const diff = state.score[side] - state.score[1 - side];
        for (const mp of state.players) {
          const p = save.players[mp.id];
          if (!p || mp.side !== side) continue;
          const d = talkReaction(opts.ftTalk, { scoreDiff: diff, rating: mp.used ? playerRating(state, mp) : 6.5, aggression: p.traits.aggression, consistency: p.traits.consistency, morale: p.morale });
          p.morale = Math.max(0, Math.min(100, p.morale + d * 0.6));
        }
      }
      pushNews(save, "result", userSummary);
    } else if (comp === "cup") {
      // giant-killings make the news
      const winner = tieWinner(f);
      const tier = (id: string) => leagueOfClub(save, id).tier;
      if (winner && tier(winner) > tier(winner === f.homeId ? f.awayId : f.homeId)) {
        pushNews(save, "cup", `Cup upset: ${save.clubs[winner].name} knock out ${save.clubs[winner === f.homeId ? f.awayId : f.homeId].name}.`);
      }
    }
  }

  // minutes and morale from playing time (for every club that played)
  for (const clubId of played) recordMinutes(squadOf(save, clubId), minutes);

  for (const p of serving) {
    const live = save.players[p.id];
    if (live) live.suspension = Math.max(0, live.suspension - 1);
  }
  const userSquad = squadOf(save, save.userClubId);
  const newlyBanned = userSquad.filter((p) => p.suspension > 0 && !serving.some((x) => x.id === p.id));
  if (newlyBanned.length) {
    pushMessage(save, {
      title: "Suspension",
      body: newlyBanned.map((p) => `${p.firstName} ${p.lastName} is suspended for ${p.suspension} match${p.suspension > 1 ? "es" : ""}.`).join("\n"),
      tag: "Squad",
    });
  }

  // Money: income and wages for every club
  const homeClubs = new Set(slotFixtures(save, slot).map((x) => x.fixture.homeId));
  const leagueWeek = slot.kind === "league";
  const week = save.calendarIndex + 1;
  for (const club of Object.values(save.clubs)) {
    const tier = leagueOfClub(save, club.id).tier;
    // gate receipts come from the fans who actually turn up
    let gate: number | undefined;
    const homeFixture = slotFixtures(save, slot).find((x) => x.fixture.homeId === club.id)?.fixture;
    if (homeFixture) {
      const league = leagueOfClub(save, club.id);
      const table = leagueTable(league);
      const opp = save.clubs[homeFixture.awayId];
      club.stadium ??= defaultStadium(club);
      const crowd = attendance(club, {
        tier,
        formPoints: recentPoints(league, club.id),
        position: table.findIndex((r) => r.clubId === club.id) + 1,
        clubs: table.length,
        opponentRep: opp?.reputation ?? 40,
        derby: club.rivalId === homeFixture.awayId,
        fans: club.isUser ? save.fans : undefined,
      });
      club.stadium.lastAttendance = crowd;
      gate = crowd * club.stadium.ticketPrice * (slot.kind === "preseason" ? 0.4 : 1);
    }
    const income = weeklyIncome(club.reputation, tier, { homeGame: homeClubs.has(club.id), leagueWeek, gate });
    // no matchday, travel or admin running costs in pre-season and international weeks
    const quiet = slot.kind === "preseason" || slot.kind === "intl";
    const costs = quiet ? [] : weeklyCosts(club.reputation, tier, { training: club.facilities?.training ?? 3, academy: club.academy });
    const wages = wageBill(save, club.id);
    const staff = staffBill(save, club.id);
    const net = [...income, ...costs].reduce((a, l) => a + l.amount, 0) - wages - staff;
    club.balance += net;
    if (club.isUser) {
      const lines = [...income, { label: "Player wages", amount: -wages }, { label: "Staff wages", amount: -staff }, ...costs];
      save.ledger = [...lines.map((l) => ({ season: currentSeason(save), week, ...l })), ...save.ledger].slice(0, 200);
    }
  }
  // Cup prize money
  if (slot.kind === "cup") {
    const prize = 100_000 * (slot.round + 1);
    for (const { fixture } of slotFixtures(save, slot)) {
      const w = tieWinner(fixture);
      if (!w) continue;
      save.clubs[w].balance += prize;
      if (w === save.userClubId) save.ledger.unshift({ season: currentSeason(save), week, label: "Cup prize money", amount: prize });
    }
  }

  // Pre-season camps and rest, and international breaks
  let extraTactical = 0;
  if (slot.kind === "preseason") {
    const plan = planFor(save, slot.week);
    const club = save.clubs[save.userClubId];
    if (plan.kind === "camp") {
      club.balance -= CAMP_COST;
      save.ledger.unshift({ season: currentSeason(save), week: save.calendarIndex + 1, label: "Pre-season training camp", amount: -CAMP_COST });
      club.cohesion = Math.min(100, (club.cohesion ?? 60) + 6);
      extraTactical = 1.5;
      for (const p of squadOf(save, club.id)) p.morale = Math.min(100, p.morale + 2);
      pushMessage(save, { title: "Training camp", body: "A productive week away: the squad is closer, sharper and more familiar with your tactics.", tag: "Training" });
    } else if (plan.kind === "rest") {
      for (const p of squadOf(save, club.id)) p.fitness = Math.min(100, p.fitness + 10);
    }
  }
  if (slot.kind === "intl") {
    const brk = internationalBreak(save, rng);
    extraTactical = 1;
    const mine = brk.calledUp.filter((id) => save.players[id]?.clubId === save.userClubId);
    if (mine.length) {
      const hurt = brk.injured.filter((id) => mine.includes(id));
      pushMessage(save, {
        title: "International break",
        body: `${mine.map((id) => `${save.players[id].firstName} ${save.players[id].lastName}`).join(", ")} ${mine.length > 1 ? "are" : "is"} away on international duty.${hurt.length ? ` ${hurt.map((id) => save.players[id].lastName).join(", ")} came back injured.` : ""} The rest of the squad gets a week on the training ground.`,
        tag: "Squad",
      });
    }
  }

  // Training week
  const season = currentSeason(save);
  for (const club of Object.values(save.clubs)) {
    const plan = club.isUser ? save.training : { focus: "balanced" as const, intensity: "normal" as const };
    const report = trainWeek(squadOf(save, club.id), plan, rng, {
      coach: coachSkills(club.staff),
      physio: staffRating(club.staff, "physio"),
      facilities: club.facilities?.training ?? 3,
      academy: club.academy,
      tier: leagueOfClub(save, club.id).tier,
      season,
      youthCoach: club.staff.youthCoach?.rating,
      fitnessCoach: club.staff.fitnessCoach?.rating,
    });
    // tactical familiarity: what was played, plus tactical training
    const tacticalTraining = club.isUser ? (save.training.focus === "tactical" ? 1 : 0) + (save.training.matchPrep === "familiarity" ? 1.5 : 0) + extraTactical : 0.6;
    const mt = matchTactics[club.id];
    weeklyFamiliarity(club.familiarity, save.players, {
      played: mt,
      roleMinutes: mt?.roleMinutes ?? [],
      tacticalTraining,
      coachTactical: staffSkill(club.staff, "coach", "tactical"),
      current: club.tactics,
    });
    if (club.isUser) {
      const lines: string[] = [];
      for (const id of report.breakthroughs) {
        const p = save.players[id];
        pushMessage(save, { title: `Breakthrough: ${p.lastName}`, body: `${p.firstName} ${p.lastName} has taken a big step forward in training this week. The coaches are excited.`, action: { kind: "player", playerId: id }, tag: "Development" });
      }
      for (const sb of report.setbacks) {
        const p = save.players[sb.playerId];
        pushMessage(save, { title: `Setback: ${p.lastName}`, body: `${p.firstName} ${p.lastName} is back from his long lay-off but ${sb.note}.`, action: { kind: "player", playerId: p.id }, tag: "Medical" });
      }
      for (const imp of report.improved.slice(0, 5)) {
        const p = save.players[imp.playerId];
        lines.push(`${p.firstName} ${p.lastName} improved to ${imp.to} OVR.`);
      }
      for (const r of report.retrained) {
        const p = save.players[r.playerId];
        lines.push(`${p.firstName} ${p.lastName} can now play ${r.pos}.`);
      }
      for (const inj of report.injured) {
        const p = save.players[inj.playerId];
        lines.push(`${p.firstName} ${p.lastName} picked up a knock in training (${inj.weeks} wk).`);
      }
      if (lines.length) pushMessage(save, { title: "Training report", body: lines.join("\n"), tag: "Training", action: { kind: "link", href: "/training", label: "Training" } });
    }
  }

  // Match sharpness: minutes sharpen, idleness dulls
  weeklySharpness(save, minutes, slot);
  if (slot.kind !== "intl") save.callUps = [];

  // Development log, and the coach's report every four weeks
  recordDevWeek(save, season, save.calendarIndex + 1);
  if ((save.calendarIndex + 1) % 4 === 0) {
    const lines = developmentReport(save);
    const fmt = (l: (typeof lines)[number]) => {
      const p = save.players[l.playerId];
      return `${p.firstName} ${p.lastName} (${p.age}): ${l.verdict}${l.reason ? `, ${l.reason}` : ""}`;
    };
    const up = lines.filter((l) => l.verdict === "flying" || l.verdict === "progressing").slice(0, 4);
    const worry = lines.filter((l) => l.verdict === "stalling" || l.verdict === "declining").slice(0, 4);
    if (up.length || worry.length) {
      pushMessage(save, {
        title: "Development report",
        body: [up.length ? "Progressing:" : "", ...up.map(fmt), worry.length ? "\nConcerns:" : "", ...worry.map(fmt)].filter(Boolean).join("\n"),
        action: { kind: "link", href: "/training?view=development", label: "Development" },
        tag: "Development",
      });
    }
  }

  // Squad mood: playing time vs status, promises, transfer requests
  for (const e of weeklyMorale(squadOf(save, save.userClubId), save.calendarIndex)) {
    const p = save.players[e.playerId];
    const name = `${p.firstName} ${p.lastName}`;
    if (e.kind === "unhappy") pushMessage(save, { title: `${p.lastName} wants more football`, body: `${name} is unhappy with his playing time as a ${p.status} player. A promise of more minutes could settle him.`, action: { kind: "unhappy", playerId: p.id }, tag: "Squad" });
    if (e.kind === "request") pushMessage(save, { title: `${p.lastName} hands in a transfer request`, body: `${name} has asked to leave. Clubs will start bidding for him.`, action: { kind: "player", playerId: p.id }, tag: "Squad" });
    if (e.kind === "promiseKept") pushMessage(save, { title: `Promise kept: ${p.lastName}`, body: `${name} is happy you kept your word about his playing time.`, tag: "Squad" });
    if (e.kind === "promiseBroken") pushMessage(save, { title: `Promise broken: ${p.lastName}`, body: `${name} feels let down and wants to leave.`, action: { kind: "player", playerId: p.id }, tag: "Squad" });
  }

  // Scouting
  const reported = weeklyScouting(save, rng);
  if (reported.length) {
    const names = reported.slice(0, 6).map((id) => {
      const p = save.players[id];
      return `${p.firstName} ${p.lastName} (${p.positions[0]}, ${p.age})`;
    });
    pushMessage(save, { title: `Scout reports: ${reported.length} player${reported.length > 1 ? "s" : ""}`, body: names.join("\n"), tag: "Scouting", action: { kind: "link", href: "/scouting", label: "Scouting" } });
  }

  // Transfers
  const round = currentRound(save);
  expireOffers(save, round);
  generateOffers(save, rng, round);
  aiTransferActivity(save, rng);
  if (isDeadlineWeek(save) && leagueWeek) pushNews(save, "transfer", "Deadline week: clubs are scrambling to finish their business.");

  // Dressing room: cohesion, settling, training ratings, mood spreading, requests
  const arrivals: Record<string, number> = {};
  for (const p of Object.values(save.players)) if (startSquads.get(p.id) !== p.clubId) arrivals[p.clubId] = (arrivals[p.clubId] ?? 0) + 1;
  const dyn = weeklyDynamics(save, rng, arrivals);
  for (const n of dyn.notes) pushMessage(save, { title: "Dressing room", body: n, tag: "Squad", action: { kind: "link", href: "/dynamics", label: "Dynamics" } });
  // requests left unanswered for three weeks: he feels ignored
  for (const r of save.requests.filter((x) => save.calendarIndex - x.week >= 3)) {
    const p = save.players[r.playerId];
    if (p) {
      p.morale = Math.max(0, p.morale - 4);
      p.rapport = Math.max(0, (p.rapport ?? 50) - 5);
    }
  }
  save.requests = save.requests.filter((x) => save.calendarIndex - x.week < 3 && save.players[x.playerId]?.clubId === save.userClubId);
  const fresh = generateRequests(save, rng);
  for (const r of fresh) {
    save.requests.push(r);
    pushMessage(save, { title: `${save.players[r.playerId].lastName} wants a word`, body: r.text, tag: "Squad", action: { kind: "link", href: "/dynamics", label: "Talk to him" } });
  }
  // conversation boosts last one match
  for (const p of Object.values(save.players)) if (p.boost && p.boost.week <= save.calendarIndex) p.boost = undefined;

  // Youth intake decisions run out
  if (save.youthIntake && save.calendarIndex + 1 >= save.youthIntake.decideBy) {
    if (save.delegation.youth) autoSignYouth(save);
    else save.youthIntake = null;
  }

  if (userSummary) {
    const table = leagueTable(userLeague(save));
    const pos = table.findIndex((r) => r.clubId === save.userClubId) + 1;
    pushMessage(save, {
      title: userSummary,
      body: `You are ${ordinal(pos)} in the ${userLeague(save).name}. Balance: ${formatMoney(save.clubs[save.userClubId].balance)}.`,
      action: userReportId ? { kind: "report", reportId: userReportId } : undefined,
      tag: "Result",
    });
  }

  // Advance the calendar
  if (slot.kind === "league") for (const l of save.leagues) l.currentRound++;
  if (slot.kind === "cup") {
    advanceCup(save.cup, rng);
    if (save.cup.winnerId) {
      const winner = save.clubs[save.cup.winnerId];
      pushNews(save, "cup", `${winner.name} win the ${save.cup.name}!`);
      save.clubs[save.cup.winnerId].balance += 1_500_000;
      if (save.cup.winnerId === save.userClubId) {
        save.manager.trophies.push({ season: currentSeason(save), name: save.cup.name, clubName: winner.name });
        save.manager.reputation = Math.min(100, save.manager.reputation + 8);
        pushMessage(save, { title: `🏆 ${save.cup.name} winners!`, body: `You've won the ${save.cup.name} with ${winner.name}.`, tag: "Trophy" });
      }
    }
  }
  if (slot.kind === "super" && save.superCup?.result) {
    const w = tieWinner(save.superCup);
    if (w === save.userClubId) save.manager.trophies.push({ season: currentSeason(save), name: "Super Cup", clubName: save.clubs[w].name });
  }
  save.calendarIndex++;

  // the media and the fans
  transferRumours(save, rng);
  {
    const club = save.clubs[save.userClubId];
    const st = club.stadium;
    if (st && st.ticketPrice > 12 + club.reputation * 0.06 + 6) save.fans = Math.max(0, (save.fans ?? 60) - 0.5);
    if ((save.fans ?? 60) < 30) save.board.confidence = Math.max(0, save.board.confidence - 0.5);
  }
  if (slot.kind === "league" && save.leagues[0] && (save.leagues[0].currentRound + 1) % 4 === 0) {
    presentAwards(save, monthlyAwards(save, (save.leagues[0].currentRound + 1) / 4));
  }

  // stadium works
  for (const id of stadiumWeek(save)) {
    if (id === save.userClubId) pushMessage(save, { title: "Stadium expansion complete", body: `${save.clubs[id].stadium!.name} now holds ${save.clubs[id].stadium!.capacity.toLocaleString()}.`, tag: "Club" });
  }

  // AI boards lose patience with managers on a bad run
  if (leagueWeek) aiManagerChanges(save, rng);

  // Board
  const verdict = weeklyBoardReview(save, wageBill(save, save.userClubId) + staffBill(save, save.userClubId), leagueWeek);
  if (verdict.warning) pushMessage(save, { title: "The board is concerned", body: verdict.warning, tag: "Board" });
  if (verdict.sacked) sack(save, rng, "The board has lost patience with results.");

  // Press ahead of a big game
  const next = userSlotFixture(save);
  // the analysts start work on the next opponent (much more with opposition prep)
  if (next) {
    const oppId = next.fixture.homeId === save.userClubId ? next.fixture.awayId : next.fixture.homeId;
    const gain = save.training.matchPrep === "opposition" ? 25 : 8;
    for (const p of squadOf(save, oppId)) addKnowledge(save, p.id, gain);
  }
  if (!save.jobOffers && next) {
    const slotNow = currentSlot(save);
    const roundName = slotNow?.kind === "cup" ? save.cup.rounds[slotNow.round]?.name : undefined;
    const occasion = isBigMatch(save, next.fixture, next.comp, roundName);
    // a pre-match conference for big games and every third fixture
    if (next.comp !== "friendly" && (occasion || save.calendarIndex % 3 === 0)) {
      const pc = preMatchPress(save, next.fixture, occasion);
      if (save.press) save.pressNext = pc;
      else save.press = pc;
      if (save.delegation.press) delegatePress(save);
      else pushMessage(save, { title: "Press conference", body: occasion ? `The media want your thoughts on ${occasion}.` : "The media want a word before the next match.", action: { kind: "link", href: "/media", label: "Face the press" }, tag: "Media" });
    }
  }

  if (isSeasonOver(save)) finishSeason(save, rng);
  save.rngState = rng.getState();
  save.updatedAt = Date.now();
  save.sync.revision++;
  return save;
}

// ───────────── AI managers ─────────────

/** Points from a club's last five league results. */
function recentPoints(league: League, clubId: string): number {
  return league.fixtures
    .filter((f) => f.result && (f.homeId === clubId || f.awayId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
    .reduce((a, f) => {
      const home = f.homeId === clubId;
      const us = home ? f.result!.homeGoals : f.result!.awayGoals;
      const them = home ? f.result!.awayGoals : f.result!.homeGoals;
      return a + (us > them ? 3 : us === them ? 1 : 0);
    }, 0);
}

/** Sackings and appointments at AI clubs. */
function aiManagerChanges(save: SaveGame, rng: Rng) {
  for (const league of save.leagues) {
    const table = leagueTable(league);
    table.forEach((row, i) => {
      const club = save.clubs[row.clubId];
      if (club.isUser || !club.manager) return;
      if (!shouldSack(club.manager, i + 1, table.length, row.played, recentPoints(league, club.id), rng)) return;
      const old = club.manager;
      club.manager = generateManager(rng, club.reputation, league.season);
      pushNews(save, "board", `${club.name} sack ${old.name}. ${club.manager.name} takes over with a ${STYLE_INFO[club.manager.style].label.toLowerCase()} approach.`);
    });
  }
}

// ───────────── sacking & jobs ─────────────

function sack(save: SaveGame, rng: Rng, reason: string) {
  const club = save.clubs[save.userClubId];
  const season = currentSeason(save);
  const entry = save.manager.clubs.find((c) => c.clubId === club.id && c.to === undefined);
  if (entry) entry.to = season;
  save.manager.reputation = Math.max(0, save.manager.reputation - 10);
  // offers from smaller clubs
  const offers = Object.values(save.clubs)
    .filter((c) => c.id !== club.id && c.reputation <= club.reputation + 5)
    .sort((a, b) => b.reputation - a.reputation + rng.range(-8, 8))
    .slice(0, 3)
    .map((c) => c.id);
  save.jobOffers = offers;
  save.liveMatch = null;
  pushMessage(save, { title: "You have been sacked", body: `${reason} ${offers.length} clubs have been in touch about their vacancy.`, tag: "Board" });
  pushNews(save, "board", `${club.name} part ways with ${save.manager.name}.`);
}

/** Take a job after being sacked: you now manage `clubId`. */
export function acceptJob(input: SaveGame, clubId: string): SaveGame {
  const save: SaveGame = structuredClone(input);
  if (!save.jobOffers?.includes(clubId)) return save;
  const old = save.clubs[save.userClubId];
  old.isUser = false;
  old.manager ??= generateManager(new Rng(save.rngState ^ hashString(old.id)), old.reputation, currentSeason(save), old.tactics.formation);
  const fresh = save.clubs[clubId];
  fresh.isUser = true;
  const departing = fresh.manager;
  fresh.manager = undefined;
  save.userClubId = clubId;
  save.jobOffers = null;
  save.transferList = [];
  save.offers = [];
  save.shortlist = [];
  save.scouting.queue = [];
  save.youthIntake = null;
  save.press = null;
  const squad = squadOf(save, clubId);
  const statuses = autoStatuses(squad);
  for (const p of squad) {
    p.status = statuses[p.id];
    save.knowledge[p.id] = 100;
  }
  fresh.tactics.setPieces = autoSetPieces(fresh.tactics.lineup.map((id) => save.players[id]));
  save.prep = null;
  save.dev = {};
  resetDevStarts(save);
  save.board = initialBoard(userLeague(save), save.clubs, clubId, wageBill(save, clubId));
  save.board.transferBudget = seasonTransferBudget(save);
  save.manager.clubs.push({ clubId, name: fresh.name, from: currentSeason(save) });
  pushMessage(save, { title: `Welcome to ${fresh.name}`, body: `A fresh start. The board's objective: ${save.board.objective.label.toLowerCase()}.`, tag: "Board" });
  pushNews(save, "board", `${fresh.name} appoint ${save.manager.name} as manager${departing ? `, replacing ${departing.name}` : ""}.`);
  save.sync.revision++;
  return save;
}

// ───────────── season end ─────────────

export interface SeasonMoves {
  promoted: Set<string>;
  relegated: Set<string>;
}

/** Who goes up and down, based on the final tables. */
export function seasonMoves(save: SaveGame): SeasonMoves {
  const promoted = new Set<string>();
  const relegated = new Set<string>();
  const tiers = [...save.leagues].sort((a, b) => a.tier - b.tier);
  for (let i = 0; i < tiers.length - 1; i++) {
    const upper = leagueTable(tiers[i]);
    const lower = leagueTable(tiers[i + 1]);
    for (const r of upper.slice(-PROMOTION_PLACES)) relegated.add(r.clubId);
    for (const r of lower.slice(0, PROMOTION_PLACES)) promoted.add(r.clubId);
  }
  return { promoted, relegated };
}

function finishSeason(save: SaveGame, rng: Rng) {
  presentAwards(save, seasonAwards(save));
  const moves = seasonMoves(save);
  for (const league of save.leagues) {
    const table = leagueTable(league);
    const base = league.tier === 1 ? 400_000 : 150_000;
    table.forEach((r, i) => {
      const club = save.clubs[r.clubId];
      club.balance += (table.length - i) * base + (i === 0 ? base * 8 : 0);
      if (moves.promoted.has(r.clubId)) club.reputation = Math.min(100, club.reputation + 8);
      if (moves.relegated.has(r.clubId)) club.reputation = Math.max(1, club.reputation - 8);
    });
    pushNews(save, "table", `${save.clubs[table[0].clubId].name} are ${league.name} champions.`);
  }

  const league = userLeague(save);
  const table = leagueTable(league);
  const pos = table.findIndex((r) => r.clubId === save.userClubId) + 1;
  const userClub = save.clubs[save.userClubId];
  const champion = save.clubs[table[0].clubId].name;
  const promoted = moves.promoted.has(save.userClubId);
  const relegated = moves.relegated.has(save.userClubId);
  if (pos === 1) {
    save.manager.trophies.push({ season: league.season, name: league.name, clubName: userClub.name });
    save.manager.reputation = Math.min(100, save.manager.reputation + 10);
  }
  if (promoted) save.manager.reputation = Math.min(100, save.manager.reputation + 6);
  const review = seasonReview(save, pos, promoted);
  const outcome = review.sacked ? "sacked" : pos === 1 && league.tier === 1 ? "champions" : promoted ? "promoted" : relegated ? "relegated" : undefined;
  save.history.push({ season: league.season, position: pos, points: table[pos - 1].points, champion, tier: league.tier, leagueName: league.name, outcome, clubName: userClub.name });
  const title =
    pos === 1 ? `🏆 Champions! Season ${league.season}` : promoted ? `⬆️ Promoted! Season ${league.season}` : relegated ? `⬇️ Relegated. Season ${league.season}` : `Season ${league.season} complete`;
  pushMessage(save, { title, body: `You finished ${ordinal(pos)} in the ${league.name}. ${review.text}`, tag: "Board" });
  if (review.sacked) sack(save, rng, "You fell well short of the board's objective.");
}

/** Age players, handle contracts and loans, youth intake, and set up the new season. */
export function startNextSeason(input: SaveGame): SaveGame {
  const save: SaveGame = structuredClone(input);
  const rng = new Rng(save.rngState);
  const newSeason = currentSeason(save) + 1;
  const moves = seasonMoves(input);
  const leagueChampion = leagueTable([...save.leagues].sort((a, b) => a.tier - b.tier)[0]);
  const cupWinner = save.cup.winnerId;

  recordCareerSeason(save, newSeason - 1);
  returnLoans(save, newSeason);

  // Promotion and relegation between adjacent divisions
  const tiers = [...save.leagues].sort((a, b) => a.tier - b.tier);
  for (let i = 0; i < tiers.length - 1; i++) {
    const upper = tiers[i];
    const lower = tiers[i + 1];
    const down = upper.clubIds.filter((id) => moves.relegated.has(id));
    const up = lower.clubIds.filter((id) => moves.promoted.has(id));
    upper.clubIds = [...upper.clubIds.filter((id) => !moves.relegated.has(id)), ...up];
    lower.clubIds = [...lower.clubIds.filter((id) => !moves.promoted.has(id)), ...down];
  }

  const leaving: string[] = [];
  for (const p of Object.values(save.players)) {
    p.age++;
    p.season = emptySeason();
    p.form = [];
    p.fitness = 100;
    p.injuryWeeks = 0;
    p.minutesHistory = [];
    // retirements
    if (p.age >= 35 && rng.chance(0.6)) {
      if (p.clubId === save.userClubId) leaving.push(`${p.firstName} ${p.lastName} retires.`);
      delete save.players[p.id];
      continue;
    }
    if (p.clubId === FREE_AGENT) {
      if (p.age >= 34) delete save.players[p.id];
      continue;
    }
    // contracts expiring
    if (p.contract.expires < newSeason) {
      if (p.clubId === save.userClubId) {
        leaving.push(`${p.firstName} ${p.lastName} leaves on a free transfer.`);
        executeTransfer(save, p.id, FREE_AGENT, 0);
      } else if (rng.chance(0.75)) {
        p.contract = newContract(p, newSeason, leagueOfClub(save, p.clubId).tier, rng);
      } else {
        executeTransfer(save, p.id, FREE_AGENT, 0);
      }
    }
  }
  if (leaving.length) pushMessage(save, { title: "Players leaving", body: leaving.join("\n"), tag: "Squad" });

  // Youth intake: the user decides, AI clubs keep their two best
  for (const club of Object.values(save.clubs)) {
    const used = new Set(squadOf(save, club.id).map((x) => x.lastName));
    const intake = generateIntake(rng, club, newSeason, leagueOfClub(save, club.id).tier, used);
    if (club.isUser) {
      save.youthIntake = { players: intake, decideBy: 3 };
      pushMessage(save, { title: "Youth intake day", body: intakeSummary(intake), action: { kind: "youth" }, tag: "Academy" });
      if (save.delegation.youth) autoSignYouth(save);
    } else {
      for (const y of intake.slice(0, 2)) save.players[y.id] = y;
    }
  }

  // Squad statuses for new arrivals, fresh tactics for AI clubs
  for (const club of Object.values(save.clubs)) {
    if (!club.isUser) topUpSquad(save, rng, club, newSeason, leagueOfClub(save, club.id).tier, 20);
    const squad = squadOf(save, club.id);
    const statuses = autoStatuses(squad);
    for (const p of squad) if (!club.isUser || !p.status) p.status = statuses[p.id];
    const picked = autoPickLineup(squad, club.tactics.formation);
    if (!club.isUser) club.tactics = { ...club.tactics, ...picked, roles: autoRoles(save.players, club.tactics.formation, picked.lineup) };
  }
  validateUserTactics(save);
  resetDevStarts(save);
  save.prep = null;

  for (const league of save.leagues) {
    league.season = newSeason;
    league.currentRound = 0;
    league.fixtures = roundRobin(rng.shuffle([...league.clubIds]), rng, true);
  }

  // Cup draw and the Super Cup (champions vs cup winners)
  const all = Object.values(save.clubs);
  save.cup = createCup(all, newSeason, cupName(save.leagues[0]), rng);
  const champ = leagueChampion[0]?.clubId;
  const opponent = cupWinner && cupWinner !== champ ? cupWinner : leagueChampion[1]?.clubId;
  save.superCup = champ && opponent ? { id: makeId(`super${newSeason}`, rng), round: 0, homeId: champ, awayId: opponent } : null;
  save.calendar = buildCalendar(totalRounds(save.leagues[0]), cupRoundCount(all.length), !!save.superCup, { preseason: PRESEASON_WEEKS, intl: true });
  save.preseason = { plans: {}, friendlies: [] };
  save.callUps = [];
  summerRust(save);
  save.calendarIndex = 0;

  save.board.objective = seasonObjective(userLeague(save), save.clubs, save.userClubId);
  save.board.wageBudget = Math.round((wageBill(save, save.userClubId) * 1.1) / 1000) * 1000;
  save.board.transferBudget = seasonTransferBudget(save);
  save.staffMarket = staffMarket(rng, save.clubs[save.userClubId].reputation);
  save.offers = [];
  save.liveMatch = null;
  save.press = null;
  save.rngState = rng.getState();
  save.sync.revision++;
  pushMessage(save, {
    title: `Season ${newSeason} begins`,
    body: `A fresh start in the ${userLeague(save).name}. The board wants you to ${save.board.objective.label.toLowerCase()}. The transfer window is open.`,
    tag: "Board",
  });
  return save;
}

// ───────────── resumable live matches ─────────────

/** Freeze the user's next fixture into a resumable live match. */
export function startLiveMatch(save: SaveGame): LiveMatch | null {
  const fixture = userFixture(save);
  if (!fixture) return null;
  if (save.liveMatch?.fixtureId === fixture.id) return save.liveMatch;
  const draft: SaveGame = structuredClone(save);
  validateUserTactics(draft);
  return {
    fixtureId: fixture.id,
    seed: fixtureSeed(save, fixture),
    setup: fixtureSetup(draft, fixture),
    commands: [],
    tick: 0,
  };
}

/** Rebuild a live match exactly as it stood at `live.tick`. */
export function replayLiveMatch(live: LiveMatch): MatchState {
  const s = createMatch(live.setup, live.seed);
  const cmds = [...live.commands].sort((a, b) => a.tick - b.tick);
  let ci = 0;
  let guard = 0;
  while (guard++ < 20000) {
    while (ci < cmds.length && cmds[ci].tick <= s.tick) applyCommand(s, cmds[ci++].cmd);
    if (s.tick >= live.tick || isFinished(s)) break;
    stepMatch(s);
  }
  return s;
}

/** Play out the rest of a live match, with the assistant managing the user's side. */
export function finishLiveMatch(live: LiveMatch, userSide: Side): MatchState {
  const s = replayLiveMatch(live);
  s.teams[userSide].isAI = true;
  let guard = 0;
  while (!isFinished(s) && guard++ < 20000) stepMatch(s);
  return s;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Cup for display: is the user still in it? */
export function userInCup(save: SaveGame): boolean {
  return save.cup.alive.includes(save.userClubId) && !save.cup.winnerId;
}

export { overall };
