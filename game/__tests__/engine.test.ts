import { describe, expect, it } from "vitest";
import { applyCommand, createMatch, isFinished, simulateMatch, stepMatch, wordScore } from "../engine";
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
    // completion is counted on arrival (a pass nicked as it lands isn't complete)
    expect(t.completed / t.passes).toBeGreaterThan(0.74);
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

describe("believable movement", () => {
  it("players never teleport in open play and don't stand on top of each other", () => {
    const s = createMatch(matchSetupFor(clubs[4], clubs[5], world.players, { homeAI: true, awayAI: true }), 77);
    let jumps = 0;
    let overlaps = 0;
    let ticks = 0;
    while (!isFinished(s)) {
      const before = s.players.map((p) => ({ x: p.x, y: p.y, on: p.onPitch }));
      const phase = s.phase;
      stepMatch(s);
      ticks++;
      if (phase === "play" && s.phase === "play") {
        for (const p of s.players) {
          const b = before[p.idx];
          // top speed is under 9 m/s: one game second can't cover 10 m
          if (b.on && p.onPitch && Math.hypot(p.x - b.x, p.y - b.y) > 10) jumps++;
        }
      }
      const on = s.players.filter((p) => p.onPitch);
      for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y) < 0.5) overlaps++;
    }
    expect(jumps).toBe(0);
    // set-piece placing can briefly crowd a spot, but tokens shouldn't pile up
    expect(overlaps / ticks).toBeLessThan(0.02);
  });

  it("restarts wait for the taker to walk over instead of teleporting him", () => {
    const s = createMatch(matchSetupFor(clubs[6], clubs[7], world.players, { homeAI: true, awayAI: true }), 5);
    let restarts = 0;
    let far = 0;
    while (!isFinished(s)) {
      const r = s.restart;
      const pos = s.players.map((p) => ({ x: p.x, y: p.y }));
      stepMatch(s);
      // corners end with the ball at the header target, not the taker
      if (r && !s.restart && r.type !== "kickoff" && r.type !== "corner" && s.ball.owner !== null) {
        restarts++;
        const taker = s.players[s.ball.owner];
        if (Math.hypot(pos[taker.idx].x - r.x, pos[taker.idx].y - r.y) > 12) far++;
      }
    }
    expect(restarts).toBeGreaterThan(20);
    expect(far / restarts).toBeLessThan(0.1);
  });

  it("repeating the same shout straight away doesn't stack its effect", () => {
    const s = createMatch(matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: false, awayAI: true }), 3);
    for (let i = 0; i < 600; i++) stepMatch(s);
    const conf = () => s.teams[0].playerIdx.reduce((a, i) => a + s.players[i].emo.conf, 0);
    applyCommand(s, { type: "shout", side: 0, shout: "encourage" });
    const once = conf();
    for (let i = 0; i < 5; i++) applyCommand(s, { type: "shout", side: 0, shout: "encourage" });
    expect(conf()).toBeCloseTo(once, 6);
  });
});

describe("talking to a player during the match", () => {
  const setup = () => matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: false, awayAI: true });
  const fresh = (seed = 9) => {
    const s = createMatch(setup(), seed);
    for (let i = 0; i < 900; i++) stepMatch(s);
    return s;
  };
  const outfield = (s: ReturnType<typeof createMatch>) => s.teams[0].playerIdx.map((i) => s.players[i]).find((p) => p.onPitch && p.pos !== "GK")!;

  it("the same words land differently depending on the player's attributes", () => {
    const s = fresh();
    const p = outfield(s);
    p.attrs = { ...p.attrs, flair: 19, technique: 17 };
    expect(wordScore(p, "express", { rating: 6.6, recent: 0 })).toBeGreaterThan(0.45);
    p.attrs = { ...p.attrs, flair: 3, technique: 6 };
    expect(wordScore(p, "express", { rating: 6.6, recent: 0 })).toBeLessThan(0);
    // a determined, calm player takes a rollicking; a hot-head on a bad day doesn't
    p.traits = { ...p.traits, determination: 19, aggression: 4 };
    p.emo = { ...p.emo, conf: 0, frus: 0 };
    const determined = wordScore(p, "demand", { rating: 6.0, recent: 0 });
    p.traits = { ...p.traits, determination: 5, aggression: 18 };
    p.emo = { ...p.emo, conf: -0.5, frus: 0.6 };
    const hothead = wordScore(p, "demand", { rating: 6.0, recent: 0 });
    expect(determined).toBeGreaterThan(0.15);
    expect(hothead).toBeLessThan(-0.15);
  });

  it("a word changes how he plays for a while, then wears off, and you can't nag him", () => {
    const s = fresh();
    const p = outfield(s);
    p.traits = { ...p.traits, professionalism: 18 };
    p.attrs = { ...p.attrs, concentration: 18 };
    expect(applyCommand(s, { type: "word", side: 0, playerId: p.id, word: "focus" })).toBe(true);
    expect(p.word?.mult.concentration).toBeGreaterThan(1);
    expect(s.events.at(-1)?.type).toBe("word");
    // straight away again: refused (cooldown)
    expect(applyCommand(s, { type: "word", side: 0, playerId: p.id, word: "praise" })).toBe(false);
    // "careful" only for a booked player
    expect(applyCommand(s, { type: "word", side: 0, playerId: outfield(s).id, word: "careful" })).toBe(false);
    const until = p.word!.until;
    while (p.ticksPlayed < until + 1 && !isFinished(s)) stepMatch(s);
    expect(p.ticksPlayed).toBeGreaterThan(until);
  });

  it("replays identically with words in the command list", () => {
    const live = fresh(21);
    const p = outfield(live);
    applyCommand(live, { type: "word", side: 0, playerId: p.id, word: "stuckIn" });
    const cmds = live.commands.map((c) => ({ ...c }));
    while (!isFinished(live)) stepMatch(live);
    const replay = simulateMatch(setup(), 21, cmds);
    expect(replay.score).toEqual(live.score);
    expect(replay.events).toEqual(live.events);
  });
});
