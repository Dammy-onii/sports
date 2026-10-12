import { coachPotentialStars, staffSkill } from "./development";
import { averageForm, currentAbility, overall, potentialStars } from "./ratings";
import { knowledgeOf, starsRange } from "./scouting";
import type { SaveGame } from "./save";
import type { Player } from "./types";
import { TRAINABILITY, TRAINING_FOCUS } from "./constants";

/**
 * Save-level development bookkeeping: the weekly ability log for the user's
 * squad, season-start snapshots, career history and the coach's report.
 */

const MAX_POINTS = 80;

/** Mean trainable attribute in the personal focus, progressing to its next whole level. */
export function individualTrainingProgress(p: Player) {
  const keys = p.focus ? TRAINING_FOCUS[p.focus].keys.filter((key) => TRAINABILITY[key] === "trainable") : [];
  if (!keys.length) return null;
  const level = keys.reduce((total, key) => total + p.attributes[key], 0) / keys.length;
  return { keys, level, target: Math.min(20, Math.floor(level) + 1), percent: level >= 20 ? 100 : (level - Math.floor(level)) * 100 };
}

/** OVR rounds CA / 2 − 1. Two CA points span one OVR band. */
export function trainingProgress(ability: number, ovr: number): { percent: number; complete: boolean } {
  if (ovr >= 99) return { percent: 100, complete: true };
  const lower = ovr * 2 + 1;
  return { percent: Math.max(0, Math.min(100, ((ability - lower) / 2) * 100)), complete: false };
}

function weekKey(season: number, week: number) {
  return season * 100 + week;
}

/** Start (or restart) a player's development log from today. */
export function startDevLog(save: SaveGame, p: Player) {
  save.dev[p.id] = { start: { ...p.attributes }, startCA: currentAbility(p), points: [] };
}

/** Record this week's ability for every user player; drop logs for players who left. */
export function recordDevWeek(save: SaveGame, season: number, week: number) {
  const squad = new Set<string>();
  for (const p of Object.values(save.players)) {
    if (p.clubId !== save.userClubId) continue;
    squad.add(p.id);
    if (!save.dev[p.id]) startDevLog(save, p);
    const log = save.dev[p.id];
    log.points.push([weekKey(season, week), Math.round(currentAbility(p) * 10) / 10]);
    if (log.points.length > MAX_POINTS) log.points.splice(0, log.points.length - MAX_POINTS);
  }
  for (const id of Object.keys(save.dev)) if (!squad.has(id)) delete save.dev[id];
}

/** New season: the "since the start of the season" arrows reset. Points are kept. */
export function resetDevStarts(save: SaveGame) {
  for (const p of Object.values(save.players)) {
    if (p.clubId !== save.userClubId) continue;
    const log = save.dev[p.id];
    if (log) {
      log.start = { ...p.attributes };
      log.startCA = currentAbility(p);
    } else startDevLog(save, p);
  }
}

/** Close the season in every player's career record. Call before season stats are reset. */
export function recordCareerSeason(save: SaveGame, season: number) {
  for (const p of Object.values(save.players)) {
    const club = save.clubs[p.clubId];
    p.history ??= [];
    p.history.push({
      season,
      age: p.age,
      clubId: p.clubId,
      clubName: club?.name ?? "Free agent",
      apps: p.season.apps,
      goals: p.season.goals,
      assists: p.season.assists,
      rating: p.season.apps ? Math.round((p.season.ratingSum / p.season.apps) * 100) / 100 : 0,
      ovr: overall(p),
      ca: Math.round(currentAbility(p)),
    });
    if (p.history.length > 20) p.history.splice(0, p.history.length - 20);
  }
}

export interface DevReportLine {
  playerId: string;
  /** CA change over the period. */
  change: number;
  verdict: "flying" | "progressing" | "steady" | "stalling" | "declining";
  reason?: string;
}

/**
 * The coach's view of the last few weeks: who is progressing, who is stalling and why.
 * Uses the development log, so only covers the user's squad.
 */
export function developmentReport(save: SaveGame, weeks = 4): DevReportLine[] {
  const out: DevReportLine[] = [];
  for (const [id, log] of Object.entries(save.dev)) {
    const p = save.players[id];
    if (!p || log.points.length < 2) continue;
    const recent = log.points.slice(-(weeks + 1));
    const change = recent[recent.length - 1][1] - recent[0][1];
    const room = p.potential - currentAbility(p);
    const share = p.minutesHistory.slice(-6).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(6, p.minutesHistory.length));
    let verdict: DevReportLine["verdict"] = change >= 2.5 ? "flying" : change >= 0.8 ? "progressing" : change > -0.5 ? "steady" : "declining";
    let reason: string | undefined;
    if (p.age <= 23 && room > 15 && change < 0.8) {
      verdict = "stalling";
      if (p.injuryWeeks > 0) reason = "out injured";
      else if (share < 0.25) reason = "not getting enough minutes";
      else if (p.traits.professionalism <= 8) reason = "his attitude to training is holding him back";
      else reason = "development has slowed for now";
    } else if (verdict === "flying") {
      reason = p.traits.professionalism >= 15 ? "an excellent professional" : share >= 0.6 ? "regular football is paying off" : undefined;
    } else if (verdict === "declining") {
      reason = p.age >= 29 ? "age is starting to show" : p.injuryWeeks > 0 ? "injury" : "lacking sharpness";
    }
    const form = averageForm(p);
    if (!reason && form !== null && form >= 7.3 && change > 0) reason = "in fine form";
    out.push({ playerId: id, change: Math.round(change * 10) / 10, verdict, reason });
  }
  return out.sort((a, b) => b.change - a.change);
}

/**
 * Potential as the user sees it, in stars: your coach's judgement for your
 * own players, your scouts' knowledge for everyone else.
 */
export function perceivedPotential(save: SaveGame, p: Player): [number, number] {
  if (p.clubId === save.userClubId) {
    const club = save.clubs[save.userClubId];
    const judging = Math.max(staffSkill(club.staff, "coach", "judging"), staffSkill(club.staff, "assistant", "judging"));
    return coachPotentialStars(potentialStars(p), judging);
  }
  return starsRange(p, knowledgeOf(save, p));
}
