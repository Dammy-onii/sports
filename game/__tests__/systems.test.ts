import { describe, expect, it } from "vitest";
import { FORMATIONS } from "../constants";
import { assistantNotes, avgPos, buildReport } from "../analysis";
import { acceptJob, completeRound, isSeasonOver, newCareer, squadOf, startNextSeason, wageBill } from "../career";
import { tieWinner } from "../cup";
import { contractDemand } from "../economy";
import { applyCommand, createMatch, isFinished, simulateMatch, stepMatch } from "../engine";
import { generateWorld } from "../generate";
import { overall } from "../ratings";
import { attrRange, knowledgeOf, ovrRange } from "../scouting";
import type { SaveGame } from "../save";
import { matchSetupFor } from "../setup";
import { promisePlaytime, weeklyMorale } from "../squad";
import { loanAvailable, loanIn, renewContract } from "../transfers";
import { signYouth } from "../youth";

const colors = { primary: "#fff", secondary: "#000" };
const fresh = (seed: number) => newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors, formation: "4-3-3", seed });

async function playSeason(save: SaveGame) {
  while (!isSeasonOver(save) && !save.jobOffers) {
    save = completeRound(save);
    await new Promise((r) => setTimeout(r));
  }
  return save;
}

describe("cup & calendar", () => {
  it("a season includes cup weeks, crowns a winner, and starts the next with a Super Cup", async () => {
    let save = fresh(31);
    expect(save.calendar.filter((s) => s.kind === "cup").length).toBe(5); // 24 clubs → 5 rounds
    save = await playSeason(save);
    expect(save.cup.winnerId).toBeTruthy();
    for (const r of save.cup.rounds) for (const f of r.fixtures) expect(tieWinner(f)).toBeTruthy();
    save = startNextSeason(save);
    expect(save.superCup).toBeTruthy();
    // pre-season first, then the Super Cup; two international breaks in the season
    expect(save.calendar.slice(0, 4).every((c) => c.kind === "preseason")).toBe(true);
    expect(save.calendar[4].kind).toBe("super");
    expect(save.calendar.filter((c) => c.kind === "intl").length).toBe(2);
    expect(save.cup.rounds[0].fixtures.length).toBe(8); // 8 byes for the top clubs
  }, 240_000);
});

describe("finances", () => {
  it("weekly income and wages move balances and fill the ledger", () => {
    let save = fresh(32);
    const before = save.clubs[save.userClubId].balance;
    save = completeRound(save);
    expect(save.ledger.some((l) => l.label === "Player wages" && l.amount === -wageBill(save, save.userClubId))).toBe(true);
    expect(save.clubs[save.userClubId].balance).not.toBe(before);
  });
});

describe("contracts", () => {
  it("players accept fair renewals, refuse lowballs, and leave when contracts run out", () => {
    let save = fresh(33);
    const p = squadOf(save, save.userClubId).sort((a, b) => overall(b) - overall(a))[3];
    const demand = contractDemand(p, { tier: 2, season: 1 });
    expect(renewContract(save, p.id, { wage: Math.round(demand.wage * 0.6), years: demand.years }).ok).toBe(false);
    expect(renewContract(save, p.id, demand).ok).toBe(true);
    expect(save.players[p.id].contract.expires).toBe(1 + demand.years - 1);

    // force someone's deal to end this season and roll over
    const leaver = squadOf(save, save.userClubId).find((x) => x.id !== p.id)!;
    leaver.contract.expires = 1;
    for (const l of save.leagues) l.currentRound = 22;
    save.calendarIndex = save.calendar.length;
    save = startNextSeason(save);
    expect(save.players[leaver.id]?.clubId).not.toBe(save.userClubId);
  });
});

describe("scouting", () => {
  it("masks unscouted players with ranges that contain the truth, and scouting narrows them", () => {
    let save = fresh(34);
    const other = Object.values(save.players).find((p) => p.clubId !== save.userClubId && !save.leagues.find((l) => l.clubIds.includes(save.userClubId))!.clubIds.includes(p.clubId))!;
    const k = knowledgeOf(save, other);
    expect(k).toBeLessThan(50);
    const [lo, hi] = attrRange(other, "passing", other.attributes.passing, k);
    expect(lo).toBeLessThanOrEqual(Math.floor(other.attributes.passing));
    expect(hi).toBeGreaterThanOrEqual(Math.floor(other.attributes.passing));
    expect(hi - lo).toBeGreaterThan(0);
    const [olo, ohi] = ovrRange(other, k);
    expect(olo <= overall(other) && overall(other) <= ohi).toBe(true);
    save.scouting.queue.push(other.id);
    save = completeRound(save);
    expect(knowledgeOf(save, save.players[other.id])).toBe(100);
  });
});

describe("squad morale", () => {
  it("a key player left out gets unhappy and asks to leave; a promise settles him", () => {
    const save = fresh(35);
    const squad = squadOf(save, save.userClubId);
    const star = squad.find((p) => p.status === "key")!;
    for (let w = 0; w < 16; w++) {
      star.minutesHistory = [0, 0, 0, 0, 0, 0];
      weeklyMorale(squad, w);
    }
    expect(star.transferRequest).toBe(true);
    promisePlaytime(star, 16);
    expect(star.transferRequest).toBe(false);
    expect(star.promise?.until).toBe(22);
  });
});

describe("youth intake, loans, jobs", () => {
  it("a new season brings a youth intake you can sign from", () => {
    let save = fresh(36);
    for (const l of save.leagues) l.currentRound = 22;
    save.calendarIndex = save.calendar.length;
    save = startNextSeason(save);
    expect(save.youthIntake?.players.length).toBeGreaterThanOrEqual(3);
    const prospect = save.youthIntake!.players[0];
    expect(signYouth(save, prospect.id).ok).toBe(true);
    expect(save.players[prospect.id].clubId).toBe(save.userClubId);
  });

  it("loaned-in players join for the season and go back afterwards", () => {
    let save = fresh(37);
    const target = Object.values(save.players).find((p) => loanAvailable(save, p) && p.age <= 21)!;
    const home = target.clubId;
    expect(loanIn(save, target.id, 0.3).ok).toBe(false); // too little of his wage
    expect(loanIn(save, target.id, 1).ok).toBe(true);
    expect(save.players[target.id].clubId).toBe(save.userClubId);
    for (const l of save.leagues) l.currentRound = 22;
    save.calendarIndex = save.calendar.length;
    save = startNextSeason(save);
    expect(save.players[target.id]?.clubId ?? home).toBe(home);
  });

  it("the board sacks a failing manager, and taking a new job switches clubs", () => {
    let save = fresh(38);
    const oldClub = save.userClubId;
    save.board.confidence = 1;
    for (const l of save.leagues) l.currentRound = 11;
    save.calendarIndex = save.calendar.findIndex((s) => s.kind === "league" && s.round === 11);
    save = completeRound(save);
    expect(save.jobOffers?.length).toBeGreaterThan(0);
    const next = save.jobOffers![0];
    save = acceptJob(save, next);
    expect(save.userClubId).toBe(next);
    expect(save.clubs[next].isUser).toBe(true);
    expect(save.clubs[oldClub].isUser).toBe(false);
    expect(save.manager.clubs.length).toBe(2);
    // the old club gets a manager; the new one's departs
    expect(save.clubs[oldClub].manager).toBeTruthy();
    expect(save.clubs[next].manager).toBeUndefined();
  }, 60_000);
});

describe("matchday systems", () => {
  const world = generateWorld(77, { name: "T", shortName: "T", colors, formation: "4-3-3" }, { divisions: 2 });
  const clubs = Object.values(world.clubs);

  it("roles change behaviour: a false nine plays deeper than a poacher", () => {
    const base = matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: true, awayAI: true });
    // roles in isolation: no manager making in-match changes
    base.home.manager = undefined;
    base.away.manager = undefined;
    const slots = base.home.lineup.map((_, i) => i);
    const striker = slots.find((i) => FORMATIONS[base.home.formation][i].pos === "ST") ?? 10;
    const run = (role: "poacher" | "false_nine") => {
      let x = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const roles = [...(base.home.roles ?? [])];
        roles[striker] = role;
        const s = simulateMatch({ ...base, home: { ...base.home, roles } }, seed);
        const p = s.players.find((pl) => pl.side === 0 && pl.slot === striker) ?? s.players[striker];
        x += avgPos(s, p).x;
      }
      return x / 6;
    };
    // only meaningful when that slot is a striker
    expect(run("false_nine")).toBeLessThan(run("poacher") - 0.03);
  }, 240_000);

  it("'Demand more' raises fouls; team talks are deterministic and change morale", () => {
    const base = matchSetupFor(clubs[2], clubs[3], world.players, { homeAI: false, awayAI: true });
    let calm = 0;
    let demand = 0;
    for (let seed = 1; seed <= 12; seed++) {
      calm += simulateMatch(base, seed).teams[0].stats.fouls;
      demand += simulateMatch(base, seed, [{ tick: 0, cmd: { type: "shout", side: 0, shout: "demand" } }]).teams[0].stats.fouls;
    }
    expect(demand).toBeGreaterThan(calm);

    const s = createMatch(base, 5);
    while (s.phase !== "halftime") stepMatch(s);
    const before = s.players.filter((p) => p.side === 0).map((p) => p.morale);
    expect(applyCommand(s, { type: "teamTalk", side: 0, tone: "encourage" })).toBe(true);
    expect(applyCommand(s, { type: "teamTalk", side: 0, tone: "demand" })).toBe(false); // one talk per half-time
    const after = s.players.filter((p) => p.side === 0).map((p) => p.morale);
    expect(after).not.toEqual(before);
    while (!isFinished(s)) stepMatch(s);
    const replay = simulateMatch(base, 5, s.commands);
    expect(replay.score).toEqual(s.score);
  }, 240_000);

  it("the assistant flags tired players, and reports carry analytics", () => {
    const base = matchSetupFor(clubs[4], clubs[5], world.players, { homeAI: false, awayAI: true });
    const s = createMatch(base, 9);
    while (s.tick < 4000) stepMatch(s);
    const tired = s.players.find((p) => p.side === 0 && p.onPitch && p.pos !== "GK")!;
    tired.energy = 0.4;
    const notes = assistantNotes(s, 0, 15);
    expect(notes.some((n) => n.kind === "fatigue" && n.playerId === tired.id)).toBe(true);
    while (!isFinished(s)) stepMatch(s);
    const report = buildReport(s, { id: "r", fixtureId: "f", competition: "League", season: 1, userSide: 0 });
    expect(report.players.filter((p) => p.side === 0)[0].heat?.length).toBe(96);
    expect(report.links.length).toBeGreaterThan(10);
    expect(report.xg[0].at(-1)).toBeCloseTo(s.teams[0].stats.xg, 1);
  }, 60_000);
});

describe("delegation", () => {
  it("the assistant picks the team when selection is delegated", () => {
    let save = fresh(39);
    const club = save.clubs[save.userClubId];
    // a deliberately bad XI: the 11 weakest players
    const weakest = squadOf(save, club.id).sort((a, b) => overall(a) - overall(b)).slice(0, 11).map((p) => p.id);
    club.tactics.lineup = weakest;
    save.delegation.selection = true;
    save = completeRound(save);
    const picked = save.clubs[save.userClubId].tactics.lineup;
    expect(picked.filter((id) => weakest.includes(id)).length).toBeLessThan(6);
  });
});
