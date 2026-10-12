import { leagueOfClub, slotFixtures, userSlotFixture } from "./career";
import { leagueTable } from "./competition";
import { FORMATIONS } from "./constants";
import { staffSkill } from "./development";
import { activeMatchPrep } from "./training-session";
import { clubFamiliarity, roleFamiliarity, type FamiliarityBreakdown } from "./familiarity";
import { hashString } from "./rng";
import { overall } from "./ratings";
import { validRole } from "./roles";
import type { SaveGame } from "./save";
import { attrRange, knowledgeOf } from "./scouting";
import { aiMatchPlan, STYLE_INFO } from "./managers";
import { autoPickLineup, isAvailable } from "./tactics";
import type { AttributeKey, Club, Fixture, FormationId, OppInstruction, Player, Position, TeamInstructions } from "./types";

/**
 * Match preparation: the opposition report, the assistant's
 * recommendations and squad readiness. See docs/DEPTH_PLAN.md §3.
 */

export interface ReportItem {
  kind: "strength" | "weakness";
  text: string;
  /** What to do about it. */
  advice?: string;
  /** Opposition instruction the assistant recommends, if any. */
  oi?: { playerId: string; oi: OppInstruction };
}

export interface ReportRead {
  /** The value as the analysts see it (null = unclear). */
  value: number | null;
  /** True when the analysts are only roughly sure. */
  approx: boolean;
}

export interface OppositionReport {
  fixture: Fixture;
  opponent: Club;
  home: boolean;
  /** 1–20: how good the analysis is (assistant + preparation). */
  quality: number;
  form: { result: "W" | "D" | "L"; score: string; vs: string; home: boolean }[];
  position: number | null;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  homeRecord: string;
  awayRecord: string;
  formation: FormationId;
  formationSure: boolean;
  tactics: Record<keyof TeamInstructions, ReportRead>;
  /** Their manager and how he's likely to approach this game. */
  manager?: { name: string; style: string; blurb: string; reasons: string[] };
  /** Predicted XI in formation-slot order. */
  xi: { player: Player; pos: Position }[];
  keyPlayers: { player: Player; why: string }[];
  items: ReportItem[];
}

/** The user's next fixture, if it has an opponent. */
export function nextFixture(save: SaveGame) {
  return userSlotFixture(save);
}

/** What the analysts make of one attribute: the midpoint of what's known. */
function seen(save: SaveGame, p: Player, key: AttributeKey): number {
  const [lo, hi] = attrRange(p, key, p.attributes[key], knowledgeOf(save, p));
  return (lo + hi) / 2;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Analysis quality: the assistant's tactical eye, boosted by a week of opposition work. */
export function analysisQuality(save: SaveGame): number {
  const club = save.clubs[save.userClubId];
  const q = (staffSkill(club.staff, "assistant", "tactical") + staffSkill(club.staff, "assistant", "judging")) / 2 + (club.staff.analyst ? club.staff.analyst.rating / 4 : 0);
  return Math.min(20, Math.round(q + (activeMatchPrep(save) === "opposition" ? 5 : 0)));
}

function readInstruction(value: number, quality: number, salt: string): ReportRead {
  if (quality >= 14) return { value, approx: false };
  if (quality >= 8) {
    // roughly right: occasionally one step off
    const off = hashString(salt) % 4 === 0 ? (hashString(salt + "d") % 2 ? 1 : -1) : 0;
    return { value: Math.max(1, Math.min(5, value + off)), approx: true };
  }
  return { value: hashString(salt) % 3 === 0 ? value : null, approx: true };
}

function recordOf(fixtures: Fixture[], clubId: string, home: boolean) {
  let w = 0;
  let d = 0;
  let l = 0;
  for (const f of fixtures) {
    if (!f.result) continue;
    if ((home ? f.homeId : f.awayId) !== clubId) continue;
    const us = home ? f.result.homeGoals : f.result.awayGoals;
    const them = home ? f.result.awayGoals : f.result.homeGoals;
    if (us > them) w++;
    else if (us < them) l++;
    else d++;
  }
  return `W${w} D${d} L${l}`;
}

export function oppositionReport(save: SaveGame): OppositionReport | null {
  const next = nextFixture(save);
  if (!next) return null;
  const f = next.fixture;
  const home = f.homeId === save.userClubId;
  const opponent = save.clubs[home ? f.awayId : f.homeId];
  const quality = analysisQuality(save);
  const league = leagueOfClub(save, opponent.id);

  // recent results in every competition
  const all: Fixture[] = [...save.leagues.flatMap((l) => l.fixtures), ...save.cup.rounds.flatMap((r) => r.fixtures), ...(save.superCup ? [save.superCup] : [])];
  const theirs = all.filter((x) => x.result && (x.homeId === opponent.id || x.awayId === opponent.id));
  const leagueDone = league.fixtures.filter((x) => x.result && (x.homeId === opponent.id || x.awayId === opponent.id));
  const recent = [...leagueDone].sort((a, b) => b.round - a.round).slice(0, 5);
  const form = recent.map((x) => {
    const h = x.homeId === opponent.id;
    const us = h ? x.result!.homeGoals : x.result!.awayGoals;
    const them = h ? x.result!.awayGoals : x.result!.homeGoals;
    return {
      result: (us > them ? "W" : us < them ? "L" : "D") as "W" | "D" | "L",
      score: `${us}–${them}`,
      vs: save.clubs[h ? x.awayId : x.homeId]?.shortName ?? "?",
      home: h,
    };
  });
  const table = leagueTable(league);
  const row = table.find((r) => r.clubId === opponent.id);

  // predicted XI and approach: what their manager will actually do for this game
  const squad = Object.values(save.players).filter((p) => p.clubId === opponent.id);
  const mySquad = Object.values(save.players).filter((p) => p.clubId === save.userClubId);
  const me = save.clubs[save.userClubId];
  const plan = opponent.manager ? aiMatchPlan(opponent, squad, { club: me, squad: mySquad, instructions: me.tactics.instructions }, { home: !home }) : null;
  const formation = plan?.formation ?? opponent.tactics.formation;
  const planned = plan?.instructions ?? opponent.tactics.instructions;
  const picked = autoPickLineup(squad, formation);
  const slots = FORMATIONS[formation];
  const xi = picked.lineup.map((id, i) => ({ player: save.players[id], pos: slots[i].pos })).filter((x) => x.player);

  const tactics = {} as Record<keyof TeamInstructions, ReportRead>;
  for (const k of Object.keys(planned) as (keyof TeamInstructions)[]) {
    tactics[k] = readInstruction(planned[k], quality, `${opponent.id}${k}${save.calendarIndex}`);
  }

  const items: ReportItem[] = [];
  const at = (positions: Position[]) => xi.filter((x) => positions.includes(x.pos)).map((x) => x.player);
  const cbs = at(["CB"]);
  const fbs = at(["LB", "RB"]);
  const mids = at(["DM", "CM"]);
  const wide = at(["LW", "RW", "LM", "RM"]);
  const strikers = at(["ST", "AM"]);
  const gk = at(["GK"])[0];
  const ins = planned;
  const nm = (p: Player) => `${p.firstName[0]}. ${p.lastName}`;
  const r = (v: number) => Math.round(v);

  const cbPace = avg(cbs.map((p) => seen(save, p, "pace")));
  const cbPass = avg(cbs.map((p) => seen(save, p, "passing")));
  const cbAir = avg(cbs.map((p) => (seen(save, p, "heading") + seen(save, p, "strength")) / 2));
  if (cbs.length && cbPace <= 10.5) {
    items.push({
      kind: "weakness",
      text: ins.defensiveLine >= 4 && tactics.defensiveLine.value !== null ? `Slow centre-backs (pace ~${r(cbPace)}) playing a high line` : `Slow centre-backs (pace ~${r(cbPace)})`,
      advice: "Play balls in behind: set your forwards to get further forward and raise tempo or passing directness.",
    });
  }
  if (cbs.length && cbPass < 9.5) {
    const worst = [...cbs].sort((a, b) => seen(save, a, "passing") - seen(save, b, "passing"))[0];
    items.push({
      kind: "weakness",
      text: `Uncomfortable on the ball at the back (passing ~${r(cbPass)})`,
      advice: `Press their centre-backs, especially ${nm(worst)}.`,
      oi: { playerId: worst.id, oi: { press: "more" } },
    });
  }
  if (cbs.length && cbAir >= 14) items.push({ kind: "strength", text: `Dominant in the air at the back (~${r(cbAir)})`, advice: "Keep the ball on the ground; avoid aimless crosses." });
  else if (cbs.length && cbAir <= 10) items.push({ kind: "weakness", text: `Weak in the air at the back (~${r(cbAir)})`, advice: "Cross early and drill attacking set pieces this week." });

  for (const p of wide.concat(strikers)) {
    const pace = seen(save, p, "pace");
    if (pace >= 15.5) {
      items.push({ kind: "strength", text: `Real pace: ${nm(p)} (${p.positions[0]}, pace ~${r(pace)})`, advice: "Don't play a high line against him; mark him tightly.", oi: { playerId: p.id, oi: { markTight: true } } });
      break;
    }
  }
  const trickster = [...wide, ...strikers].sort((a, b) => seen(save, b, "dribbling") - seen(save, a, "dribbling"))[0];
  if (trickster && seen(save, trickster, "dribbling") >= 15) {
    items.push({ kind: "strength", text: `Tricky dribbler: ${nm(trickster)} (dribbling ~${r(seen(save, trickster, "dribbling"))})`, advice: "Get tight and go in hard before he turns.", oi: { playerId: trickster.id, oi: { tackle: "hard" } } });
  }
  const fbPace = avg(fbs.map((p) => seen(save, p, "pace")));
  if (fbs.length && fbPace <= 10.5) items.push({ kind: "weakness", text: `Slow full-backs (pace ~${r(fbPace)})`, advice: "Get your wingers running at them: set wingers to dribble more and stay wide." });
  const midControl = avg(mids.map((p) => (seen(save, p, "passing") + seen(save, p, "vision")) / 2));
  const midBite = avg(mids.map((p) => seen(save, p, "tackling")));
  if (mids.length && midControl >= 14) items.push({ kind: "strength", text: `Control the midfield (passing/vision ~${r(midControl)})`, advice: "Press their midfield and keep the game compact." });
  if (mids.length && midBite <= 9.5) items.push({ kind: "weakness", text: `Soft in midfield (tackling ~${r(midBite)})`, advice: "Run at them: midfielders dribble more, a playmaker in the middle." });
  const finisher = [...strikers].sort((a, b) => seen(save, b, "finishing") - seen(save, a, "finishing"))[0];
  if (finisher && seen(save, finisher, "finishing") >= 15) {
    items.push({ kind: "strength", text: `Clinical finisher: ${nm(finisher)} (finishing ~${r(seen(save, finisher, "finishing"))})`, advice: "Mark him tightly in the box.", oi: { playerId: finisher.id, oi: { markTight: true } } });
  }
  if (gk && seen(save, gk, "goalkeeping") <= 10) items.push({ kind: "weakness", text: `Shaky goalkeeper (goalkeeping ~${r(seen(save, gk, "goalkeeping"))})`, advice: "Shoot on sight: tell your midfielders to shoot more." });
  if (tactics.pressing.value !== null && tactics.pressing.value >= 4) items.push({ kind: "strength", text: "They press high and hard", advice: "Go more direct to play through or over the press." });
  if (tactics.mentality.value !== null && tactics.mentality.value >= 4) items.push({ kind: "weakness", text: "Attack-minded: space behind on the counter", advice: "Lower your mentality a notch and raise tempo to hit them on the break." });
  if (tactics.defensiveLine.value !== null && tactics.defensiveLine.value <= 2) items.push({ kind: "strength", text: "They sit deep and stay compact", advice: "Be patient, play wide and attack set pieces." });
  const tired = xi.filter((x) => x.player.fitness < 82).length;
  if (tired >= 3) items.push({ kind: "weakness", text: `Tired legs: ${tired} of their likely XI are below 82% fitness`, advice: "Press them and keep the tempo high." });
  const knownHotheads = xi.filter((x) => knowledgeOf(save, x.player) >= 60 && x.player.traits.aggression >= 15);
  if (knownHotheads.length) items.push({ kind: "weakness", text: `Short fuses: ${knownHotheads.map((x) => nm(x.player)).join(", ")}`, advice: "Run at them and draw fouls; they pick up cards." });
  if (row && row.played >= 3) {
    const pts = form.reduce((a, x) => a + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0), 0);
    if (pts >= 12) items.push({ kind: "strength", text: "In excellent form", advice: "Respect them: don't over-commit early." });
    else if (pts <= 3 && form.length >= 4) items.push({ kind: "weakness", text: "Out of form and low on confidence", advice: "Start fast: an early goal could break them." });
  }

  // key players: the most dangerous attackers and creators
  const threat = (p: Player) =>
    (seen(save, p, "finishing") + seen(save, p, "dribbling") + seen(save, p, "pace") + seen(save, p, "vision") + seen(save, p, "passing")) / 5 + p.season.goals * 0.4 + p.season.assists * 0.3;
  const keyPlayers = xi
    .filter((x) => x.pos !== "GK")
    .sort((a, b) => threat(b.player) - threat(a.player))
    .slice(0, 3)
    .map(({ player }) => {
      const best = (["finishing", "dribbling", "pace", "passing", "vision", "tackling", "heading"] as AttributeKey[]).sort((a, b) => seen(save, player, b) - seen(save, player, a)).slice(0, 2);
      const stats = player.season.apps ? `${player.season.goals} goals, ${player.season.assists} assists in ${player.season.apps} apps` : "no league appearances yet";
      return { player, why: `Best at ${best.join(" and ")}; ${stats}.` };
    });

  return {
    fixture: f,
    opponent,
    home,
    quality,
    form,
    position: row ? table.indexOf(row) + 1 : null,
    played: row?.played ?? 0,
    goalsFor: row?.gf ?? 0,
    goalsAgainst: row?.ga ?? 0,
    homeRecord: recordOf(theirs, opponent.id, true),
    awayRecord: recordOf(theirs, opponent.id, false),
    formation,
    formationSure: quality >= 6,
    manager: opponent.manager
      ? {
          name: opponent.manager.name,
          style: STYLE_INFO[opponent.manager.style].label,
          blurb: STYLE_INFO[opponent.manager.style].blurb,
          // a weaker analyst only sees his reputation, not tonight's thinking
          reasons: quality >= 11 && plan ? plan.reasons.slice(1) : [],
        }
      : undefined,
    tactics,
    xi,
    keyPlayers,
    items,
  };
}

/** The opposition instructions the assistant would set, from the report. */
export function recommendedInstructions(report: OppositionReport): Record<string, OppInstruction> {
  const out: Record<string, OppInstruction> = {};
  for (const it of report.items) if (it.oi) out[it.oi.playerId] = { ...out[it.oi.playerId], ...it.oi.oi };
  return out;
}

export interface Readiness {
  fitness: number;
  morale: number;
  familiarity: FamiliarityBreakdown;
  warnings: { playerId?: string; text: string }[];
}

/** How ready the user's XI is: fitness, morale, familiarity and the assistant's warnings. */
export function squadReadiness(save: SaveGame): Readiness {
  const club = save.clubs[save.userClubId];
  const slots = FORMATIONS[club.tactics.formation];
  const xi = club.tactics.lineup.map((id) => save.players[id]).filter(Boolean);
  const warnings: Readiness["warnings"] = [];
  club.tactics.lineup.forEach((id, i) => {
    const p = save.players[id];
    if (!p) return;
    if (!isAvailable(p)) warnings.push({ playerId: p.id, text: `${p.lastName} is ${p.injuryWeeks > 0 ? "injured" : "suspended"}: he'll be replaced.` });
    else if (p.fitness < 80) warnings.push({ playerId: p.id, text: `${p.lastName} is at ${Math.round(p.fitness)}% fitness. Consider resting him.` });
    const role = validRole(club.tactics.roles?.[i], slots[i].pos);
    const rf = roleFamiliarity(p, role);
    if (rf < 0.45) warnings.push({ playerId: p.id, text: `${p.lastName} barely knows his role (${Math.round(rf * 100)}%).` });
    if (overall(p, slots[i].pos) < overall(p) - 6) warnings.push({ playerId: p.id, text: `${p.lastName} is out of position at ${slots[i].pos}.` });
  });
  const fam = clubFamiliarity(club, save.players);
  if (fam.formation < 0.6) warnings.push({ text: `The squad is still learning the ${club.tactics.formation} (${Math.round(fam.formation * 100)}%).` });
  return {
    fitness: avg(xi.map((p) => p.fitness)),
    morale: avg(xi.map((p) => p.morale)),
    familiarity: fam,
    warnings,
  };
}

/** Is a fixture still to be played this week by the user? */
export function prepFixtureId(save: SaveGame): string | null {
  return slotFixtures(save).find((x) => x.fixture.homeId === save.userClubId || x.fixture.awayId === save.userClubId)?.fixture.id ?? null;
}
