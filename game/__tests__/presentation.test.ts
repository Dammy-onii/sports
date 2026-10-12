import { describe, expect, it, vi } from "vitest";
import { pitchPlayerAt } from "../../components/match/drawPitch";
import { MATCH_PACING, playbackDelta, playbackTicksPerSecond } from "../../components/match/playback";
import { createPitchMotion, followPoint, updatePitchMotion, PLAYER_VISUAL_SPEED, BALL_VISUAL_SPEED } from "../../components/match/motion";
import { fixtureSetup, newCareer, userSlotFixture } from "../career";
import { fireStaff, hireStaff } from "../club";
import { coachSkills, staffSkill } from "../development";
import { createMatch, isFinished, stepMatch } from "../engine";
import { migrateSave } from "../migrate";
import { individualTrainingProgress, trainingProgress } from "../progress";
import { currentAbility, overall } from "../ratings";
import { Rng } from "../rng";
import { matchSetupFor } from "../setup";
import { trainWeek } from "../training";
import { activeMatchPrep, prepSessionProgress, selectMatchPrep } from "../training-session";

const fresh = () => newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: { primary: "#fff", secondary: "#000" }, formation: "4-3-3", seed: 42 });

describe("training and coach information", () => {
  it("individual progress uses the focused trainable attributes, independently of other attributes", () => {
    const p = Object.values(fresh().players)[0];
    p.focus = "physical";
    for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) p.attributes[key] = 8.75;
    expect(individualTrainingProgress(p)).toMatchObject({ level: 8.75, target: 9, percent: 75 });
    p.attributes.finishing = 20;
    p.attributes.naturalFitness = 20;
    expect(individualTrainingProgress(p)?.level).toBe(8.75);
    p.focus = undefined;
    expect(individualTrainingProgress(p)).toBeNull();
  });

  it("timed preparation persists elapsed progress, gates bonuses, and expires with the career week/season", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const save = fresh();
      const fixture = userSlotFixture(save)!.fixture;
      selectMatchPrep(save, "setPiecesAttack");
      const started = save.training.matchPrepSession!.startedAt;
      expect(activeMatchPrep(save)).toBe("none");
      expect(fixtureSetup(save, fixture).home.prep?.setPiecesAttack).toBeFalsy();
      vi.advanceTimersByTime(30_000);
      selectMatchPrep(save, "setPiecesAttack");
      expect(save.training.matchPrepSession!.startedAt).toBe(started);
      expect(prepSessionProgress(structuredClone(save).training, save.calendarIndex, Date.now())).toEqual({ percent: 50, remaining: 30, ready: false });
      vi.advanceTimersByTime(30_000);
      expect(activeMatchPrep(save)).toBe("setPiecesAttack");
      expect(fixtureSetup(save, fixture).home.prep?.setPiecesAttack).toBe(true);
      save.calendarIndex++;
      expect(activeMatchPrep(save)).toBe("none");
      selectMatchPrep(save, "opposition");
      vi.advanceTimersByTime(60_000);
      save.leagues[0].season++;
      expect(activeMatchPrep(save)).toBe("none");
      selectMatchPrep(save, "none");
      expect(save.training.matchPrepSession).toBeUndefined();
      expect(prepSessionProgress(save.training, save.calendarIndex, Date.now()).percent).toBe(0);
      save.training.matchPrep = "opposition";
      expect(activeMatchPrep(save)).toBe("opposition"); // existing saves remain compatible
    } finally { vi.useRealTimers(); }
  });
  it("progress fills between actual OVR boundaries and resets when the rating rises", () => {
    const save = fresh();
    const player = Object.values(save.players)[0];
    for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[]) player.attributes[key] = 8;
    expect(trainingProgress(currentAbility(player), overall(player)).percent).toBeCloseTo(50);
    for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[]) player.attributes[key] = 8.11;
    expect(overall(player)).toBe(40);
    expect(trainingProgress(currentAbility(player), overall(player)).percent).toBeCloseTo(5);
    expect(trainingProgress(81, 40).percent).toBe(0);
    expect(trainingProgress(200, 99)).toEqual({ percent: 100, complete: true });
    expect(trainingProgress(-10, 1).percent).toBe(0);
  });

  it("preserves real appointments through replacement, dismissal and rehire", () => {
    const save = fresh();
    const club = save.clubs[save.userClubId];
    club.balance = 50_000_000;
    const previous = club.staff.coach!;
    const candidate = save.staffMarket.find((m) => m.role === "coach")!;
    save.calendarIndex = 3;
    expect(hireStaff(save, candidate.id).ok).toBe(true);
    expect(previous.history?.at(-1)?.toWeek).toBe(4);
    expect(candidate.history?.at(-1)).toMatchObject({ clubId: club.id, fromSeason: 1, fromWeek: 4 });
    save.calendarIndex = 7;
    expect(fireStaff(save, "coach").ok).toBe(true);
    expect(candidate.history?.at(-1)?.toWeek).toBe(8);
    expect(hireStaff(save, candidate.id).ok).toBe(true);
    expect(candidate.history).toHaveLength(2);
    expect(candidate.history?.at(-1)?.toSeason).toBeUndefined();
  });

  it("repairs old saves without inventing past jobs or changing fitness-coach effects", () => {
    const save = fresh();
    const club = save.clubs[save.userClubId];
    const coach = save.staffMarket.find((m) => m.role === "fitnessCoach")!;
    save.staffMarket = save.staffMarket.filter((m) => m.id !== coach.id);
    club.staff.fitnessCoach = coach;
    delete coach.skills;
    delete coach.history;
    delete club.staff.coach!.history;
    save.calendarIndex = 9;
    expect(migrateSave(save)).toBe(save);
    expect(coach.skills).toEqual({ physical: coach.rating, recovery: coach.rating });
    expect(coach.history?.[0]).toMatchObject({ clubId: club.id, fromWeek: 10 });
    const history = structuredClone(coach.history);
    migrateSave(save);
    expect(coach.history).toEqual(history);
  });

  it("specialist physical and recovery skills have independent gameplay effects", () => {
    const save = fresh();
    const club = save.clubs[save.userClubId];
    const coach = save.staffMarket.find((m) => m.role === "fitnessCoach")!;
    coach.rating = 10;
    club.staff.fitnessCoach = coach;
    club.staff.coach!.skills = { physical: 4 };
    coach.skills = { physical: 18, recovery: 4 };
    expect(coachSkills(club.staff).physical).toBe(18);
    const source = Object.values(save.players).find((p) => p.clubId === club.id)!;
    const recovery = (skill: number) => {
      const p = structuredClone(source);
      p.fitness = 30;
      p.injuryWeeks = 0;
      coach.skills!.recovery = skill;
      trainWeek([p], { focus: "balanced", intensity: "normal" }, new Rng(12), {
        coach: coachSkills(club.staff), facilities: 3, academy: 3, tier: 1, season: 1, physio: 10,
        fitnessCoach: staffSkill(club.staff, "fitnessCoach", "recovery"),
      });
      return p.fitness;
    };
    expect(recovery(18)).toBeGreaterThan(recovery(4));
    expect(coachSkills(club.staff).physical).toBe(18);
  });
});

describe("match pacing independent of rendering", () => {
  it("selects the same player after the pitch flips ends and ignores substitutes", () => {
    const save = fresh();
    const [home, away] = Object.values(save.clubs);
    const match = createMatch(matchSetupFor(home, away, save.players), 99);
    for (const p of match.players) { p.x = 52.5; p.y = 34; }
    const player = match.players.find((p) => p.onPitch)!;
    player.x = 0;
    player.y = 0;
    expect(pitchPlayerAt(match, 1000, 700, 25, 25)).toBe(player.id);
    match.half = 2;
    expect(pitchPlayerAt(match, 1000, 700, 975, 675)).toBe(player.id);
    player.onPitch = false;
    expect(pitchPlayerAt(match, 1000, 700, 975, 675)).toBeNull();
  });

  it("90 regulation minutes take seven minutes and hidden-tab delays are clamped", () => {
    expect(MATCH_PACING.map((p) => [p.multiplier, p.seconds])).toEqual([[1, 420]]);
    for (const preset of MATCH_PACING) {
      expect(playbackTicksPerSecond(preset.seconds) * preset.seconds).toBe(5400);
      expect(preset.seconds * preset.multiplier).toBe(420);
    }
    expect(playbackDelta(100_000, 0)).toBe(0.1);
    expect(playbackDelta(0, 100)).toBe(0);
    expect(playbackDelta(1000 / 60, 0)).toBeCloseTo(1 / 60);
  });

  it("eases motion at both frame rates without overshoot or accelerated travel", () => {
    expect(PLAYER_VISUAL_SPEED).toBeLessThanOrEqual(7);
    expect(BALL_VISUAL_SPEED).toBeLessThanOrEqual(26);
    const target = { x: 105, y: 68 };
    const positions = [30, 60].map((fps) => {
      let point = { x: 0, y: 0 };
      for (let frame = 0; frame < fps; frame++) {
        const next = followPoint(point, target, 1 / fps, PLAYER_VISUAL_SPEED);
        expect(Math.hypot(next.x - point.x, next.y - point.y)).toBeLessThanOrEqual(PLAYER_VISUAL_SPEED / fps + 1e-10);
        point = next;
      }
      return point;
    });
    expect(Math.abs(positions[0].x - positions[1].x)).toBeLessThan(0.03);
    expect(followPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, 1, PLAYER_VISUAL_SPEED).x).toBeLessThanOrEqual(1);
    expect(followPoint({ x: 3, y: 4 }, target, 0, PLAYER_VISUAL_SPEED)).toEqual({ x: 3, y: 4 });
  });

  it("motion preserves simulation state and resets on highlights, half-time and substitutions", () => {
    const save = fresh();
    const [home, away] = Object.keys(save.clubs);
    const match = createMatch(matchSetupFor(save.clubs[home], save.clubs[away], save.players), 99);
    const motion = createPitchMotion(match);
    const p = match.players.find((p) => p.onPitch)!;
    const original = { ...motion.players.get(p.id)! };
    p.x += 20;
    const before = structuredClone(match);
    updatePitchMotion(motion, match, 1, 1 / 60);
    expect(match).toEqual(before);
    expect(motion.players.get(p.id)!.x).toBeLessThan(p.x);
    expect(Math.hypot(motion.players.get(p.id)!.x - original.x, motion.players.get(p.id)!.y - original.y)).toBeLessThanOrEqual(PLAYER_VISUAL_SPEED / 60);
    updatePitchMotion(motion, match, 1, 1 / 60, true);
    expect(motion.players.get(p.id)).toEqual({ x: p.x, y: p.y });
    p.x += 10;
    match.half = 2;
    updatePitchMotion(motion, match, 1, 1 / 60);
    expect(motion.players.get(p.id)!.x).toBe(p.x);
    p.onPitch = false;
    updatePitchMotion(motion, match, 1, 1 / 60);
    expect(motion.players.has(p.id)).toBe(false);
  });

  it("30 and 60 fps at every pace produce identical matches within the target duration", () => {
    const save = fresh();
    const [home, away] = Object.keys(save.clubs);
    const setup = matchSetupFor(save.clubs[home], save.clubs[away], save.players);
    let expected: unknown;
    for (const preset of MATCH_PACING) for (const fps of [30, 60]) {
      const match = createMatch(setup, 99);
      const rate = playbackTicksPerSecond(preset.seconds);
      let elapsed = 0, accumulator = 0;
      while (!isFinished(match)) {
        elapsed += 1 / fps;
        accumulator += rate / fps;
        while (accumulator >= 1 && !isFinished(match)) { stepMatch(match); accumulator--; }
      }
      const result = { score: match.score, events: match.events, tick: match.tick, rngState: match.rngState, stats: match.teams.map((t) => t.stats) };
      expected ??= result;
      expect(result).toEqual(expected);
      // The halftime transition is one extra engine step, with no game time.
      expect(elapsed).toBeCloseTo(preset.seconds + (match.stoppage[0] + match.stoppage[1] + 1) / rate, 0);
    }
  });
});
