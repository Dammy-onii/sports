import { describe, expect, it } from "vitest";
import { applyCommand, createMatch, isFinished, stepMatch } from "../engine";
import { leagueTable, totalRounds } from "../competition";
import { currentRound, currentSeason, seasonMoves, userLeague, completeRound, finishLiveMatch, isSeasonOver, newCareer, replayLiveMatch, squadOf, startLiveMatch, startNextSeason, userFixture } from "../career";
import { migrateSave } from "../migrate";
import { SAVE_VERSION } from "../save";

const user = { name: "Test FC", shortName: "TST", colors: { primary: "#fff", secondary: "#000" }, formation: "4-3-3" as const };

describe("career", () => {
  it("plays a full season with promotion and relegation, then rolls over", async () => {
    let save = newCareer({ managerName: "Tester", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-4-2", seed: 7 });
    expect(save.leagues.length).toBe(2);
    expect(userLeague(save).tier).toBe(2);
    for (const l of save.leagues) expect(totalRounds(l)).toBe(22);
    while (!isSeasonOver(save)) {
      save = completeRound(save);
      await new Promise((r) => setTimeout(r)); // let the test runner breathe
    }
    for (const l of save.leagues) {
      const table = leagueTable(l);
      expect(table.reduce((a, r) => a + r.played, 0)).toBe(12 * 22);
    }
    expect(save.history.length).toBe(1);
    const moves = seasonMoves(save);
    expect(moves.promoted.size).toBe(2);
    expect(moves.relegated.size).toBe(2);
    const top = leagueTable(save.leagues[0]);
    const bottom = leagueTable(save.leagues[1]);
    save = startNextSeason(save);
    expect(currentSeason(save)).toBe(2);
    expect(currentRound(save)).toBe(0);
    // champions of tier 2 now in tier 1; bottom of tier 1 now in tier 2
    expect(save.leagues[0].clubIds).toContain(bottom[0].clubId);
    expect(save.leagues[1].clubIds).toContain(top[top.length - 1].clubId);
    expect(save.leagues[0].clubIds.length).toBe(12);
    expect(save.leagues[1].clubIds.length).toBe(12);
  }, 240_000);
});

describe("discipline", () => {
  it("suspended players miss the next match and serve their ban", () => {
    let save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-4-2", seed: 3 });
    const squad = squadOf(save, save.userClubId);
    const star = squad.find((p) => p.id === save.clubs[save.userClubId].tactics.lineup[5])!;
    save.players[star.id].suspension = 1;
    const fixture = userFixture(save)!;
    const live = startLiveMatch(save)!;
    const side = fixture.homeId === save.userClubId ? live.setup.home : live.setup.away;
    expect([...side.lineup, ...side.bench].some((p) => p.id === star.id)).toBe(false);
    save = completeRound(save);
    expect(save.players[star.id].suspension).toBe(0);
  });

  it("a red card leads to a ban", () => {
    let save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-4-2", seed: 5 });
    let banned = false;
    for (let r = 0; r < 22 && !banned; r++) {
      save = completeRound(save);
      banned = Object.values(save.players).some((p) => p.suspension > 0 || p.season.reds > 0);
    }
    expect(banned).toBe(true);
  }, 60_000);
});

describe("live match resume", () => {
  it("replays to the exact saved position and finishes deterministically", () => {
    const save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-3-3", seed: 11 });
    const live = startLiveMatch(save)!;
    const userSide = live.setup.home.clubId === save.userClubId ? 0 : 1;
    // play 30 minutes "live" with a tactical change at 20'
    const s = createMatch(live.setup, live.seed);
    while (s.tick < 1800) {
      if (s.tick === 1200) applyCommand(s, { type: "instructions", side: userSide, instructions: { ...s.teams[userSide].instructions, mentality: 5 } });
      stepMatch(s);
    }
    const saved = { ...live, tick: s.tick, commands: s.commands };
    const resumed = replayLiveMatch(saved);
    expect(resumed.tick).toBe(s.tick);
    expect(resumed.score).toEqual(s.score);
    expect(resumed.events).toEqual(s.events);
    expect(resumed.players.map((p) => [p.x, p.y])).toEqual(s.players.map((p) => [p.x, p.y]));
    const a = finishLiveMatch(saved, userSide);
    const b = finishLiveMatch(saved, userSide);
    expect(a.score).toEqual(b.score);
    expect(isFinished(a)).toBe(true);
  });
});

describe("save migration", () => {
  it("upgrades a v1 save", () => {
    const save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-3-3", seed: 2 });
    // a genuine v1 shape: one league, none of the later systems
    const v1 = JSON.parse(JSON.stringify(save));
    v1.version = 1;
    v1.league = (({ tier, ...rest }) => (void tier, rest))(v1.leagues.find((l: { clubIds: string[] }) => l.clubIds.includes(v1.userClubId)));
    for (const k of ["leagues", "liveMatch", "calendar", "calendarIndex", "cup", "superCup", "knowledge", "scouting", "shortlist", "board", "manager", "jobOffers", "news", "reports", "youthIntake", "press", "delegation", "onboarding", "presets", "staffMarket", "ledger", "sync", "transferList", "offers", "transferLog"]) delete v1[k];
    for (const c of Object.values(v1.clubs) as Record<string, unknown>[]) {
      delete c.staff;
      delete c.academy;
      delete c.rivalId;
    }
    for (const p of Object.values(v1.players) as Record<string, unknown>[]) {
      for (const k of ["contract", "status", "minutesHistory", "unhappyWeeks", "transferRequest", "traits"]) delete p[k];
      delete p.suspension;
      p.season = { apps: 1, goals: 0, assists: 0, minutes: 90 };
    }
    const up = migrateSave(v1)!;
    expect(up.version).toBe(SAVE_VERSION);
    const p = Object.values(up.players)[0];
    expect(p.suspension).toBe(0);
    expect(p.season.yellows).toBe(0);
    expect(p.season.apps).toBe(1);
    expect(p.contract.wage).toBeGreaterThan(0);
    expect(p.traits.aggression).toBeGreaterThanOrEqual(1);
    expect(up.leagues.length).toBe(1);
    expect(up.calendar.length).toBe(22);
    expect(up.clubs[up.userClubId].staff.coach).toBeDefined();
    expect(up.sync.revision).toBe(0);
    expect(migrateSave({ version: 999 })).toBeNull();
  });
});

describe("season stats", () => {
  it("accumulate full per-player season stats from matches", () => {
    let save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-3-3", seed: 9 });
    // pre-season friendlies don't count toward the season: play two league rounds
    while (save.leagues[0].currentRound < 2) save = completeRound(save);
    const squad = Object.values(save.players).filter((p) => p.clubId === save.userClubId && p.season.apps > 0);
    expect(squad.length).toBeGreaterThanOrEqual(11);
    const total = squad.reduce(
      (a, p) => ({ passes: a.passes + p.season.passes, distance: a.distance + p.season.distance, rating: a.rating + p.season.ratingSum }),
      { passes: 0, distance: 0, rating: 0 },
    );
    expect(total.passes).toBeGreaterThan(300);
    expect(total.distance).toBeGreaterThan(100_000);
    expect(total.rating).toBeGreaterThan(0);
  }, 30_000);

  it("v4 saves gain the richer season stats", () => {
    const save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-3-3", seed: 10 });
    const v4 = JSON.parse(JSON.stringify(save));
    v4.version = 4;
    for (const p of Object.values(v4.players) as Record<string, unknown>[]) p.season = { apps: 3, goals: 1, assists: 0, minutes: 270, yellows: 0, reds: 0 };
    const up = migrateSave(v4)!;
    const p = Object.values(up.players)[0];
    expect(p.season.apps).toBe(3);
    expect(p.season.passes).toBe(0);
    expect(p.season.cleanSheets).toBe(0);
  });
});
