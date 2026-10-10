import { describe, expect, it } from "vitest";
import { leagueRows, percentile, teamSummary } from "../analytics";
import { CAMP_COST, friendlyOptions, internationalBreak, setPlan } from "../calendar";
import { completeRound, newCareer, userLeague } from "../career";
import { askBoard, attendance, defaultStadium } from "../club";
import { ATTRIBUTE_KEYS, TRAINABILITY } from "../constants";
import { developWeek, type DevContext } from "../development";
import { answerRequest, generateRequests, hierarchy, talkTo, teamMeeting } from "../dynamics";
import { createMatch, isFinished, simulateMatch, stepMatch } from "../engine";
import { generateWorld } from "../generate";
import { aiMatchPlan } from "../managers";
import { answerPress, monthlyAwards, preMatchPress } from "../media";
import { migrateSave } from "../migrate";
import { Rng } from "../rng";
import { SAVE_VERSION } from "../save";
import { matchSetupFor } from "../setup";
import { buyPlayer } from "../transfers";

const colors = { primary: "#fff", secondary: "#000" };
const fresh = (seed: number) => newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors, formation: "4-3-3", seed });
const world = generateWorld(21, { name: "T", shortName: "TST", colors, formation: "4-3-3" }, { divisions: 2 });
const clubs = Object.values(world.clubs);

describe("attributes", () => {
  it("every player has all 37 attributes in range", () => {
    for (const p of Object.values(world.players).slice(0, 60)) {
      expect(Object.keys(p.attributes).length).toBe(37);
      for (const k of ATTRIBUTE_KEYS) expect(p.attributes[k]).toBeGreaterThanOrEqual(1);
    }
  });

  it("training grows trainable attributes; experience ones need minutes; innate ones never train", () => {
    const base = structuredClone(Object.values(world.players).find((p) => p.age <= 19)!);
    base.potential = 190;
    const ctx: DevContext = { focus: "technical", intensity: "normal", coach: { attacking: 14, technical: 14, defending: 14, tactical: 14, physical: 14, goalkeeping: 14 }, facilities: 3, academy: 3, tier: 2, matchPrep: false, season: 1 };
    const benched = structuredClone(base);
    benched.minutesHistory = [0, 0, 0, 0, 0, 0];
    const flairBefore = benched.attributes.flair;
    const compBefore = benched.attributes.composure;
    const techBefore = benched.attributes.technique;
    const rng = new Rng(4);
    for (let w = 0; w < 25; w++) developWeek(benched, ctx, rng);
    expect(benched.attributes.flair).toBe(flairBefore); // innate
    expect(benched.attributes.composure).toBeCloseTo(compBefore, 5); // experience: no minutes, no growth
    expect(benched.attributes.technique).toBeGreaterThan(techBefore); // trainable
    const playing = structuredClone(base);
    playing.minutesHistory = [1, 1, 1, 1, 1, 1];
    const rng2 = new Rng(4);
    for (let w = 0; w < 25; w++) developWeek(playing, ctx, rng2);
    expect(playing.attributes.composure).toBeGreaterThan(compBefore);
    expect(Object.values(TRAINABILITY).filter((t) => t === "experience").length).toBe(4);
  });

  it("a single-attribute focus works on that attribute hardest", () => {
    const base = structuredClone(Object.values(world.players).find((p) => p.age <= 19 && p.positions[0] !== "GK")!);
    base.potential = 190;
    base.minutesHistory = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const ctx: DevContext = { focus: "balanced", intensity: "normal", coach: { attacking: 12, technical: 12, defending: 12, tactical: 12, physical: 12, goalkeeping: 12 }, facilities: 3, academy: 3, tier: 2, matchPrep: false, season: 1 };
    const a = structuredClone(base);
    const b = structuredClone(base);
    b.focusAttr = "crossing";
    for (let w = 0; w < 25; w++) {
      developWeek(a, ctx, new Rng(w));
      developWeek(b, ctx, new Rng(w));
    }
    expect(b.attributes.crossing - base.attributes.crossing).toBeGreaterThan((a.attributes.crossing - base.attributes.crossing) * 1.8);
  });
});

describe("emotions in matches", () => {
  it("scorers end up confident, emotions show in commentary, and talks before kick-off carry in", () => {
    let confident = 0;
    let reactions = 0;
    for (let i = 0; i < 6; i++) {
      const s = simulateMatch(matchSetupFor(clubs[i], clubs[i + 6], world.players, { homeAI: true, awayAI: true }), 40 + i);
      for (const p of s.players) if (p.st.goals > 0 && p.emo.conf > 0) confident++;
      reactions += s.events.filter((e) => e.type === "emotion").length;
    }
    expect(confident).toBeGreaterThan(0);
    expect(reactions).toBeGreaterThan(0);
    const setup = matchSetupFor(clubs[0], clubs[1], world.players, { homeAI: true, awayAI: true });
    setup.home.lineup = setup.home.lineup.map((p) => ({ ...p, boost: { conf: 0.3, nerves: 0, frus: 0, week: 0 } }));
    const m = createMatch(setup, 1);
    expect(m.players.filter((p) => p.side === 0 && p.slot >= 0).every((p) => p.emo.conf >= 0.29 - 0.3)).toBe(true);
    expect(Math.max(...m.players.filter((p) => p.side === 0).map((p) => p.emo.conf))).toBeGreaterThan(0.25);
  });
});

describe("AI managers", () => {
  it("plan for the opponent: underdogs sit deeper than favourites", () => {
    const ranked = [...clubs].filter((c) => c.manager).sort((a, b) => b.reputation - a.reputation);
    const strong = ranked[0];
    const weak = ranked[ranked.length - 1];
    const sq = (id: string) => Object.values(world.players).filter((p) => p.clubId === id);
    const asUnderdog = aiMatchPlan({ ...weak, manager: { ...weak.manager!, adaptability: 18 } }, sq(weak.id), { club: strong, squad: sq(strong.id), instructions: strong.tactics.instructions }, { home: false });
    const asFavourite = aiMatchPlan({ ...strong, manager: { ...strong.manager!, adaptability: 18, style: weak.manager!.style } }, sq(strong.id), { club: weak, squad: sq(weak.id), instructions: weak.tactics.instructions }, { home: true });
    expect(asUnderdog.instructions.defensiveLine).toBeLessThanOrEqual(asFavourite.instructions.defensiveLine);
    expect(asUnderdog.reasons.length).toBeGreaterThan(0);
  });

  it("react during matches (tactical changes with reasons)", () => {
    let changes = 0;
    for (let i = 0; i < 6; i++) {
      const s = simulateMatch(matchSetupFor(clubs[i], clubs[i + 6], world.players, { homeAI: true, awayAI: true }), 80 + i);
      changes += s.events.filter((e) => e.type === "tactics" && e.text).length;
    }
    expect(changes).toBeGreaterThan(0);
  });
});

describe("squad dynamics", () => {
  it("builds a hierarchy and social groups", () => {
    const save = fresh(51);
    const h = hierarchy(save);
    expect(h.players.length).toBeGreaterThan(15);
    expect(h.players[0].influence).toBeGreaterThanOrEqual(h.players[h.players.length - 1].influence);
    expect(h.groups.length).toBeGreaterThan(0);
  });

  it("unfair criticism backfires; deserved praise lands; repeated talks lose weight", () => {
    const save = fresh(52);
    const p = Object.values(save.players).find((x) => x.clubId === save.userClubId && x.positions[0] !== "GK")!;
    p.form = [7.8, 7.6, 7.9];
    const rng = new Rng(3);
    const harsh = talkTo(save, p.id, "criticise_form", rng);
    expect(["unhappy", "angry", "indifferent"]).toContain(harsh.reaction);
    const nice = talkTo(save, p.id, "praise_form", rng);
    const again = talkTo(save, p.id, "praise_form", rng);
    expect(nice.morale).toBeGreaterThanOrEqual(again.morale);
    expect(again.reply).toContain("already told me");
  });

  it("unhappy players ask to talk; team meetings too close together lose impact", () => {
    const save = fresh(53);
    const p = Object.values(save.players).find((x) => x.clubId === save.userClubId)!;
    p.unhappyWeeks = 3;
    let reqs = generateRequests(save, new Rng(1));
    for (let i = 2; !reqs.length && i < 20; i++) reqs = generateRequests(save, new Rng(i));
    expect(reqs.some((r) => r.playerId === p.id && r.kind === "playtime")).toBe(true);
    save.requests = reqs;
    const out = answerRequest(save, reqs[0].id, "promise");
    expect(out.text).toBeTruthy();
    const first = teamMeeting(save, "next", new Rng(9));
    const second = teamMeeting(save, "next", new Rng(9));
    const order = ["angry", "unhappy", "indifferent", "accepts", "motivated", "delighted"];
    expect(order.indexOf(second.reaction)).toBeLessThanOrEqual(order.indexOf(first.reaction));
  });
});

describe("calendar", () => {
  it("pre-season friendlies sharpen players without counting toward the season", () => {
    let save = fresh(61);
    expect(save.calendar[0].kind).toBe("preseason");
    const before = Object.values(save.players).filter((p) => p.clubId === save.userClubId).reduce((a, p) => a + (p.sharpness ?? 0), 0);
    save = completeRound(save); // week 1: a friendly
    const squad = Object.values(save.players).filter((p) => p.clubId === save.userClubId);
    expect(squad.every((p) => p.season.apps === 0)).toBe(true);
    expect(squad.reduce((a, p) => a + (p.sharpness ?? 0), 0)).toBeGreaterThan(before);
    expect(save.preseason.friendlies[0].result).toBeTruthy();
    // a camp costs money and builds cohesion
    const cohesion = save.clubs[save.userClubId].cohesion ?? 60;
    const balance = save.clubs[save.userClubId].balance;
    setPlan(save, 1, { kind: "camp" });
    save = completeRound(save);
    expect(save.clubs[save.userClubId].cohesion).toBeGreaterThan(cohesion);
    expect(save.ledger.some((l) => l.label === "Pre-season training camp" && l.amount === -CAMP_COST)).toBe(true);
    void balance;
    expect(friendlyOptions(save).length).toBeGreaterThan(0);
  }, 60_000);

  it("international breaks call up the best players by nationality", () => {
    const save = fresh(62);
    const out = internationalBreak(save, new Rng(2));
    expect(out.calledUp.length).toBeGreaterThan(0);
  });
});

describe("clubs", () => {
  it("attendance responds to price and caps at capacity", () => {
    const club = { ...clubs[0], stadium: { ...defaultStadium(clubs[0]) } };
    const base = { tier: 1, formPoints: 9, position: 3, clubs: 12, opponentRep: 60, derby: false };
    const fair = attendance(club, base);
    const pricey = attendance({ ...club, stadium: { ...club.stadium, ticketPrice: 60 } }, base);
    expect(pricey).toBeLessThan(fair);
    expect(attendance({ ...club, stadium: { ...club.stadium, capacity: 1000 } }, { ...base, derby: true })).toBe(1000);
  });

  it("the transfer budget limits bids; nagging the board costs confidence", () => {
    const save = fresh(63);
    save.board.transferBudget = 0;
    const target = Object.values(save.players).find((p) => p.clubId !== save.userClubId && p.clubId !== "FA")!;
    const r = buyPlayer(save, target.id, 500_000);
    expect(r.ok).toBe(false);
    save.board.confidence = 70;
    askBoard(save, "wages");
    const conf = save.board.confidence;
    const again = askBoard(save, "wages");
    expect(again.ok).toBe(false);
    expect(save.board.confidence).toBeLessThan(conf);
  });
});

describe("analysis and media", () => {
  it("logs matches, compares with the league and runs press conferences and awards", () => {
    let save = fresh(64);
    while (save.leagues[0].currentRound < 4) {
      save = completeRound(save);
      if (save.press) {
        while (save.press) answerPress(save, save.press.questions[save.press.answered].options[0].tone, new Rng(1));
      }
    }
    const matches = save.analytics?.matches ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
    const sum = teamSummary(matches);
    expect(sum.played).toBe(matches.length);
    expect(matches.some((m) => m.shots.length > 0)).toBe(true);
    const rows = leagueRows(userLeague(save));
    expect(rows.every((r) => r.played > 0)).toBe(true);
    expect(percentile(5, [1, 2, 3, 4, 5])).toBe(100);
    // monthly awards after four league weeks
    expect((save.awards ?? []).some((a) => a.name === "Player of the Month")).toBe(true);
    expect(monthlyAwards(save, 2).length).toBeGreaterThan(0);
    // a fresh pre-match conference has questions with options
    const next = userLeague(save).fixtures.find((f) => !f.result && (f.homeId === save.userClubId || f.awayId === save.userClubId))!;
    const pc = preMatchPress(save, next, null);
    expect(pc.questions.length).toBeGreaterThan(0);
  }, 120_000);
});

describe("save migration v8 → v9", () => {
  it("adds managers, stadiums, budgets and D2 state", () => {
    const save = fresh(65) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    save.version = 8;
    for (const c of Object.values(save.clubs) as Record<string, unknown>[]) {
      delete c.manager;
      delete c.stadium;
      delete c.cohesion;
    }
    delete save.requests;
    delete save.dynamics;
    delete save.fans;
    save.board.transferBudget = undefined;
    const m = migrateSave(save)!;
    expect(m.version).toBe(SAVE_VERSION);
    const ai = Object.values(m.clubs).filter((c) => !c.isUser);
    expect(ai.every((c) => c.manager && c.stadium)).toBe(true);
    expect(m.board.transferBudget).toBeGreaterThanOrEqual(0);
    expect(m.requests).toEqual([]);
    expect(m.fans).toBe(60);
  });
});

void isFinished;
void stepMatch;
