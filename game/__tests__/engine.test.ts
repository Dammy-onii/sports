import { describe, expect, it } from "vitest";
import { applyCommand, createMatch, isFinished, simulateMatch, stepMatch } from "../engine";
import { generateWorld } from "../generate";
import { matchSetupFor } from "../setup";
import { roundRobin } from "../competition";
import { newCareer } from "../career";
import { migrateSave } from "../migrate";
import { Rng } from "../rng";

const user = { name: "Test FC", shortName: "TST", colors: { primary: "#fff", secondary: "#000" }, formation: "4-3-3" as const };
const world = generateWorld(42, user);
const clubs = Object.values(world.clubs);

describe("match engine", () => {
  it("is deterministic for the same seed", () => {
    const setup = matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: true, awayAI: true });
    const a = simulateMatch(setup, 1234);
    const b = simulateMatch(setup, 1234);
    expect(a.score).toEqual(b.score);
    expect(a.events).toEqual(b.events);
    expect(a.teams[0].stats).toEqual(b.teams[0].stats);
  });

  it("replays identically when commands are re-applied at the same ticks", () => {
    const setup = matchSetupFor(clubs[2], clubs[3], world.players, { homeAI: false, awayAI: true });
    const live = createMatch(setup, 99);
    while (!isFinished(live)) {
      if (live.tick === 1800) {
        applyCommand(live, { type: "instructions", side: 0, instructions: { ...live.teams[0].instructions, mentality: 5, pressing: 5 } });
      }
      stepMatch(live);
    }
    const replay = simulateMatch(setup, 99, live.commands);
    expect(replay.score).toEqual(live.score);
    expect(replay.events.length).toBe(live.events.length);
  });

  it("produces realistic averages", () => {
    const n = 80;
    const t = { goals: 0, shots: 0, fouls: 0, draws: 0, passes: 0, completed: 0, tackles: 0, corners: 0, offsides: 0, km: 0, mins: 0, carried: 0 };
    for (let i = 0; i < n; i++) {
      const h = clubs[i % clubs.length];
      const a = clubs[(i + 1 + (i % 5)) % clubs.length];
      const s = simulateMatch(matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true }), 5000 + i);
      const [x, y] = s.teams.map((tm) => tm.stats);
      t.goals += s.score[0] + s.score[1];
      t.shots += x.shots + y.shots;
      t.fouls += x.fouls + y.fouls;
      t.passes += x.passes + y.passes;
      t.completed += x.passesCompleted + y.passesCompleted;
      t.tackles += x.tackles + y.tackles;
      t.corners += x.corners + y.corners;
      t.offsides += x.offsides + y.offsides;
      if (s.score[0] === s.score[1]) t.draws++;
      for (const p of s.players) {
        if (!p.used || p.pos === "GK") continue;
        t.km += p.st.distance / 1000;
        t.mins += p.ticksPlayed / 60;
        t.carried += p.st.carryDistance / 1000;
      }
    }
    const per = (v: number) => v / n;
    expect(per(t.goals)).toBeGreaterThan(2.0);
    expect(per(t.goals)).toBeLessThan(3.5);
    expect(per(t.shots)).toBeGreaterThan(17);
    expect(per(t.shots)).toBeLessThan(32);
    expect(per(t.fouls)).toBeGreaterThan(14);
    expect(per(t.fouls)).toBeLessThan(30);
    expect(t.completed / t.passes).toBeGreaterThan(0.76);
    expect(per(t.tackles)).toBeGreaterThan(20);
    expect(per(t.tackles)).toBeLessThan(60);
    expect(per(t.corners)).toBeGreaterThan(5);
    expect(per(t.offsides)).toBeGreaterThan(1);
    expect(per(t.offsides)).toBeLessThan(9);
    expect(t.draws / n).toBeGreaterThan(0.1);
    expect(t.draws / n).toBeLessThan(0.4);
    // players move with purpose and carry the ball, not just pass it around
    const kmPer90 = (t.km / t.mins) * 90;
    expect(kmPer90).toBeGreaterThan(9);
    expect(kmPer90).toBeLessThan(13.5);
    expect(per(t.carried)).toBeGreaterThan(3.5);
  }, 120_000);

  it("generates squads without duplicate surnames", () => {
    for (const c of clubs) {
      const names = Object.values(world.players).filter((p) => p.clubId === c.id).map((p) => p.lastName);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("competition", () => {
  it("double round robin: every pair meets home and away once", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const fx = roundRobin(ids, new Rng(1), true);
    expect(fx.length).toBe(30);
    for (const x of ids)
      for (const y of ids)
        if (x !== y) expect(fx.filter((f) => f.homeId === x && f.awayId === y).length).toBe(1);
    // each club plays once per round
    for (let r = 0; r < 10; r++) {
      const inRound = fx.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
      expect(new Set(inRound).size).toBe(6);
    }
  });
});

describe("characteristics drive events", () => {
  function withTraits(t: Partial<Record<"aggression" | "injuryProneness" | "consistency", number>>) {
    return (p: (typeof world.players)[string]) => ({ ...p, traits: { ...p.traits, ...t } });
  }

  /** Run matches where side "a" gets traits `ta` and side "b" gets `tb`, alternating home/away. */
  function experiment(ta: Parameters<typeof withTraits>[0], tb: Parameters<typeof withTraits>[0], n: number) {
    const base = matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: true, awayAI: true });
    const out = { a: { fouls: 0, cards: 0, injuries: 0 }, b: { fouls: 0, cards: 0, injuries: 0 } };
    for (let i = 0; i < n; i++) {
      const aHome = i % 2 === 0;
      const [h, w] = aHome ? [withTraits(ta), withTraits(tb)] : [withTraits(tb), withTraits(ta)];
      const s = simulateMatch(
        {
          home: { ...base.home, lineup: base.home.lineup.map(h), bench: base.home.bench.map(h) },
          away: { ...base.away, lineup: base.away.lineup.map(w), bench: base.away.bench.map(w) },
        },
        900 + i,
      );
      const sa = aHome ? 0 : 1;
      for (const [side, key] of [[sa, "a"], [1 - sa, "b"]] as const) {
        out[key].fouls += s.teams[side].stats.fouls;
        out[key].cards += s.teams[side].stats.yellows;
        out[key].injuries += s.events.filter((e) => e.type === "injury" && e.side === side).length;
      }
    }
    return out;
  }

  it("hot-headed players foul and get booked far more than calm ones", () => {
    const r = experiment({ aggression: 20 }, { aggression: 1 }, 30);
    expect(r.a.fouls).toBeGreaterThan(r.b.fouls * 2);
    expect(r.a.cards).toBeGreaterThan(r.b.cards * 2);
  }, 120_000);

  it("injury-prone players get hurt far more than durable ones", () => {
    const r = experiment({ injuryProneness: 20 }, { injuryProneness: 1 }, 40);
    expect(r.a.injuries).toBeGreaterThan(r.b.injuries * 2);
  }, 120_000);

  it("old saves gain deterministic traits on migration", () => {
    const save = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-3-3", seed: 4 });
    const v3 = JSON.parse(JSON.stringify(save));
    v3.version = 3;
    for (const p of Object.values(v3.players) as Record<string, unknown>[]) delete p.traits;
    const a = migrateSave(JSON.parse(JSON.stringify(v3)))!;
    const b = migrateSave(JSON.parse(JSON.stringify(v3)))!;
    const p = Object.values(a.players)[0];
    expect(p.traits.aggression).toBeGreaterThanOrEqual(1);
    expect(b.players[p.id].traits).toEqual(p.traits);
  });
});

describe("highlights", () => {
  it("look-ahead windows contain every goal and big moment of the real match", async () => {
    const { highlightWindows, isHighlight } = await import("../highlights");
    const setup = matchSetupFor(clubs[3], clubs[4], world.players, { homeAI: true, awayAI: true });
    for (const seed of [31, 32, 33]) {
      const s = createMatch(setup, seed);
      for (let i = 0; i < 600; i++) stepMatch(s); // start mid-match
      const windows = highlightWindows(s);
      while (!isFinished(s)) stepMatch(s);
      for (const e of s.events.filter((x) => x.tick > 600 && isHighlight(x))) {
        expect(windows.some(([a, b]) => e.tick >= a && e.tick <= b)).toBe(true);
      }
    }
  });
});
