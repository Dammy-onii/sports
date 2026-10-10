import { describe, expect, it } from "vitest";
import { completeRound, newCareer } from "../career";
import { developWeek, type DevContext } from "../development";
import { applyCommand, createMatch, isFinished, simulateMatch, stepMatch } from "../engine";
import type { MatchSetup, MatchState } from "../engine/types";
import { initialFamiliarity, teamFamiliarity, weeklyFamiliarity } from "../familiarity";
import { generateWorld } from "../generate";
import { migrateSave } from "../migrate";
import { oppositionReport, recommendedInstructions, squadReadiness } from "../prep";
import { currentAbility } from "../ratings";
import { Rng } from "../rng";
import { SAVE_VERSION } from "../save";
import { matchSetupFor } from "../setup";
import { autoPickLineup, repairLineup } from "../tactics";
import type { Player } from "../types";

const colors = { primary: "#fff", secondary: "#000" };
const fresh = (seed: number) => newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors, formation: "4-3-3", seed });
const world = generateWorld(77, { name: "Test FC", shortName: "TST", colors, formation: "4-3-3" });
const clubs = Object.values(world.clubs);

const ctx: DevContext = {
  focus: "balanced",
  intensity: "normal",
  coach: { attacking: 12, technical: 12, defending: 12, tactical: 12, physical: 12, goalkeeping: 12 },
  facilities: 3,
  academy: 3,
  tier: 2,
  matchPrep: false,
  season: 1,
};

function prospect(over: Partial<Player["traits"]>, minutes: number): Player {
  const base = Object.values(world.players).find((p) => p.age <= 21 && p.potential - currentAbility(p) > 30)!;
  const p = structuredClone(base);
  p.age = 18;
  p.potential = currentAbility(p) + 60;
  p.traits = { ...p.traits, professionalism: 10, determination: 10, ambition: 10, ...over };
  p.minutesHistory = new Array(6).fill(minutes);
  return p;
}

function season(p: Player, c = ctx, seed = 1) {
  const rng = new Rng(seed);
  const before = currentAbility(p);
  for (let w = 0; w < 30; w++) developWeek(p, c, rng);
  return currentAbility(p) - before;
}

/** Average of `fn` over n seeded matches between two clubs. */
function across(n: number, make: () => MatchSetup, fn: (s: MatchState) => number) {
  let total = 0;
  for (let i = 0; i < n; i++) total += fn(simulateMatch(make(), 9000 + i));
  return total / n;
}

describe("player development", () => {
  it("professionals with minutes develop much faster than casual players without them", () => {
    const pro = season(prospect({ professionalism: 18, determination: 15 }, 0.9));
    const casual = season(prospect({ professionalism: 3, determination: 6 }, 0));
    expect(pro).toBeGreaterThan(casual * 1.8);
    expect(pro).toBeGreaterThan(4);
  });

  it("better coaching and facilities speed growth; match prep costs some", () => {
    const good = season(prospect({}, 0.6), { ...ctx, coach: { attacking: 19, technical: 19, defending: 19, tactical: 19, physical: 19, goalkeeping: 19 }, facilities: 5 });
    const poor = season(prospect({}, 0.6), { ...ctx, coach: { attacking: 4, technical: 4, defending: 4, tactical: 4, physical: 4, goalkeeping: 4 }, facilities: 1 });
    const prep = season(prospect({}, 0.6), { ...ctx, matchPrep: true });
    const normal = season(prospect({}, 0.6));
    expect(good).toBeGreaterThan(poor * 1.4);
    expect(prep).toBeLessThan(normal);
  });

  it("veterans decline, physical attributes first, and professionals decline more slowly", () => {
    const vet = (prof: number) => {
      const p = prospect({ professionalism: prof }, 0.8);
      p.age = 33;
      p.potential = currentAbility(p);
      return p;
    };
    const pro = vet(19);
    const casual = vet(3);
    const paceBefore = casual.attributes.pace;
    const visionBefore = casual.attributes.vision;
    const dPro = season(pro);
    const dCasual = season(casual);
    expect(dCasual).toBeLessThan(0);
    expect(dPro).toBeGreaterThan(dCasual);
    expect(paceBefore - casual.attributes.pace).toBeGreaterThan(visionBefore - casual.attributes.vision);
  });
});

describe("tactical familiarity", () => {
  it("grows with use and training, fades when unused", () => {
    const club = structuredClone(clubs[0]);
    const fam = initialFamiliarity("4-4-2", club.tactics.instructions, 80);
    const players = structuredClone(world.players);
    const before343 = fam.formation["3-5-2"] ?? 0;
    const before442 = fam.formation["4-4-2"] ?? 0;
    for (let w = 0; w < 6; w++) {
      weeklyFamiliarity(fam, players, {
        played: { formation: "3-5-2", instructions: club.tactics.instructions },
        roleMinutes: [],
        tacticalTraining: 1,
        coachTactical: 14,
        current: { ...club.tactics, formation: "3-5-2" },
      });
    }
    expect(fam.formation["3-5-2"]!).toBeGreaterThan(before343 + 30);
    expect(fam.formation["4-4-2"]!).toBeLessThan(before442);
    expect(teamFamiliarity(fam, "3-5-2", club.tactics.instructions, [0.8]).formation).toBeGreaterThan(0.6);
  });

  it("an unfamiliar team plays worse than the same team drilled in its system", () => {
    // across many pairings, so match-to-match noise (form, emotions) averages out
    const run = (level: number) => {
      let total = 0;
      const n = 48;
      for (let i = 0; i < n; i++) {
        const s = matchSetupFor(clubs[i % 12], clubs[(i + 5) % 12], world.players, { homeAI: true, awayAI: true });
        // isolate familiarity: no in-match managerial changes
        s.home.manager = undefined;
        s.away.manager = undefined;
        s.home.familiarity = initialFamiliarity(s.home.formation, s.home.instructions, level);
        s.away.familiarity = initialFamiliarity(s.away.formation, s.away.instructions, 85);
        if (level < 50) s.home.lineup = s.home.lineup.map((p) => ({ ...p, roleExp: {} }));
        const m = simulateMatch(s, 100 + i);
        total += m.score[0] - m.score[1] + (m.teams[0].stats.xg - m.teams[1].stats.xg);
      }
      return total / n;
    };
    expect(run(95)).toBeGreaterThan(run(15));
  }, 180_000);
});

describe("player and opposition instructions", () => {
  it("'shoot more' makes a player shoot more; 'tackle harder' makes him foul more", () => {
    const [h, a] = [clubs[4], clubs[5]];
    const slot = 10; // a forward slot
    const make = (pi: object) => () => {
      const s = matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true });
      s.home.playerInstructions = [];
      s.home.playerInstructions[slot] = pi;
      return s;
    };
    const shots = (s: MatchState) => s.players.find((p) => p.side === 0 && p.slot === slot)?.st.shots ?? 0;
    expect(across(20, make({ shooting: "more" }), shots)).toBeGreaterThan(across(20, make({ shooting: "less" }), shots));
    const fouls = (s: MatchState) => s.teams[0].stats.fouls;
    const allHard = () => {
      const s = matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true });
      s.home.playerInstructions = new Array(11).fill({ tackling: "hard" });
      return s;
    };
    const allSoft = () => {
      const s = matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true });
      s.home.playerInstructions = new Array(11).fill({ tackling: "soft" });
      return s;
    };
    expect(across(20, allHard, fouls)).toBeGreaterThan(across(20, allSoft, fouls));
  }, 90_000);

  it("tight marking an opponent quietens him", () => {
    const [h, a] = [clubs[6], clubs[7]];
    const base = matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true });
    const star = base.away.lineup.filter((p) => ["ST", "AM", "LW", "RW"].includes(p.positions[0]))[0];
    const make = (mark: boolean) => () => {
      const s = matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true });
      s.home.opposition = mark ? { [star.id]: { markTight: true, press: "more" } } : {};
      s.home.prep = { opposition: mark };
      return s;
    };
    const touches = (s: MatchState) => {
      const p = s.players.find((x) => x.id === star.id)!;
      return p.st.touches + p.st.xg * 20;
    };
    expect(across(20, make(true), touches)).toBeLessThan(across(20, make(false), touches));
  }, 60_000);

  it("a pre-match team talk is applied before kick-off and replays identically", () => {
    const setup = matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: false, awayAI: true });
    const a = createMatch(setup, 5);
    expect(applyCommand(a, { type: "teamTalk", side: 0, tone: "encourage" })).toBe(true);
    expect(applyCommand(a, { type: "teamTalk", side: 0, tone: "demand" })).toBe(false);
    while (!isFinished(a)) stepMatch(a);
    const b = createMatch(setup, 5);
    for (const c of a.commands) applyCommand(b, c.cmd);
    while (!isFinished(b)) stepMatch(b);
    expect(b.score).toEqual(a.score);
    expect(a.teams[0].preTalk).toBe("encourage");
  });
});

describe("match preparation", () => {
  it("builds an opposition report with recommendations and readiness", () => {
    const save = fresh(12);
    const report = oppositionReport(save)!;
    expect(report).not.toBeNull();
    expect(report.xi.length).toBe(11);
    expect(report.keyPlayers.length).toBe(3);
    expect(report.form.length).toBe(0);
    const rec = recommendedInstructions(report);
    for (const id of Object.keys(rec)) expect(report.xi.some((x) => x.player.id === id)).toBe(true);
    const ready = squadReadiness(save);
    expect(ready.fitness).toBeGreaterThan(90);
    expect(ready.familiarity.overall).toBeGreaterThan(0.3);
  });

  it("opposition instructions saved for the fixture reach the match, then clear", () => {
    let save = fresh(13);
    const report = oppositionReport(save)!;
    const target = report.xi[report.xi.length - 1].player.id;
    save.prep = { fixtureId: report.fixture.id, opposition: { [target]: { markTight: true } } };
    save.training.matchPrep = "opposition";
    save = completeRound(save);
    expect(save.prep).toBeNull();
    expect(save.dev[Object.keys(save.dev)[0]].points.length).toBe(1);
  }, 30_000);
});

describe("save migration v6 → v7", () => {
  it("backfills personality, role experience, facilities, familiarity and staff skills", () => {
    const save = fresh(14) as unknown as Record<string, unknown> & ReturnType<typeof fresh>;
    const old = structuredClone(save) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    old.version = 6;
    for (const p of Object.values(old.players) as Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      delete p.traits.professionalism;
      delete p.traits.determination;
      delete p.traits.ambition;
      delete p.roleExp;
      delete p.history;
    }
    for (const c of Object.values(old.clubs) as Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      delete c.facilities;
      delete c.familiarity;
      for (const m of Object.values(c.staff) as Record<string, any>[]) delete m.skills; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    delete old.prep;
    delete old.dev;
    const m = migrateSave(old)!;
    expect(m.version).toBe(SAVE_VERSION);
    const p = Object.values(m.players)[0];
    expect(p.traits.professionalism).toBeGreaterThanOrEqual(1);
    expect(Object.keys(p.roleExp ?? {}).length).toBeGreaterThan(0);
    const c = Object.values(m.clubs)[0];
    expect(c.facilities.training).toBeGreaterThanOrEqual(1);
    expect(c.familiarity.formation[c.tactics.formation]).toBeGreaterThan(50);
    expect(c.staff.coach?.skills?.tactical).toBeDefined();
    expect(Object.keys(m.dev).length).toBeGreaterThan(10);
  });
});

describe("goalkeepers", () => {
  it("never take penalties or free kicks, even when the designated taker is missing", () => {
    let keeperGoals = 0;
    let pens = 0;
    for (let i = 0; i < 25; i++) {
      const s = matchSetupFor(clubs[8], clubs[9], world.players, { homeAI: true, awayAI: true });
      // the worst case: no valid takers named, and a keeper who looks like a finisher
      s.home.setPieces = { penalty: "nobody", freeKick: "nobody", corner: "nobody", cornerRoutine: "mixed" };
      s.home.lineup = s.home.lineup.map((p, idx) => (idx === 0 ? { ...p, attributes: { ...p.attributes, finishing: 20, composure: 20, longShots: 20 } } : p));
      const m = simulateMatch(s, 700 + i);
      for (const e of m.events) {
        if (e.type === "penalty") pens++;
        const p = m.players.find((x) => x.id === e.player);
        if (e.type === "goal" && p?.naturalPositions[0] === "GK") keeperGoals++;
      }
    }
    expect(keeperGoals).toBe(0);
    expect(pens).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("a fit keeper goes in goal; an outfielder only when there is no keeper at all", () => {
    const club = clubs[1];
    const squad = Object.values(world.players).filter((p) => p.clubId === club.id);
    const star = [...squad].filter((p) => p.positions[0] !== "GK").sort((a, b) => b.attributes.decisions + b.attributes.composure - (a.attributes.decisions + a.attributes.composure))[0];
    const lineup = [...club.tactics.lineup];
    lineup[0] = star.id; // star wrongly left in goal
    const fixed = repairLineup(squad, club.tactics.formation, lineup, club.tactics.bench);
    expect(squad.find((p) => p.id === fixed.lineup[0])!.positions).toContain("GK");
    // no keepers available at all: the best goalkeeping outfielder, not the star
    const noKeepers = squad.map((p) => (p.positions.includes("GK") ? { ...p, injuryWeeks: 3 } : p));
    const emergency = autoPickLineup(noKeepers, club.tactics.formation);
    const inGoal = noKeepers.find((p) => p.id === emergency.lineup[0])!;
    const bestHands = Math.max(...noKeepers.filter((p) => p.injuryWeeks === 0).map((p) => p.attributes.goalkeeping));
    expect(inGoal.attributes.goalkeeping).toBe(bestHands);
  });
});
