import { leagueTable } from "./competition";
import type { BoardState, SaveGame } from "./save";
import type { League } from "./types";

/**
 * The board sets an objective from where the club stands in its division,
 * watches results and finances, and can sack the manager.
 */
export function seasonObjective(league: League, clubs: SaveGame["clubs"], clubId: string): BoardState["objective"] {
  const byRep = [...league.clubIds].sort((a, b) => clubs[b].reputation - clubs[a].reputation);
  const rank = byRep.indexOf(clubId) + 1;
  const n = league.clubIds.length;
  if (league.tier > 1) {
    if (rank <= 2) return { label: "Win promotion", targetPos: 2, tier: league.tier };
    if (rank <= 5) return { label: "Challenge for promotion", targetPos: 4, tier: league.tier };
    if (rank <= 8) return { label: "Finish in the top half", targetPos: 6, tier: league.tier };
    return { label: "Avoid relegation", targetPos: n - 2, tier: league.tier };
  }
  if (rank === 1) return { label: "Win the title", targetPos: 1, tier: league.tier };
  if (rank <= 3) return { label: "Finish in the top three", targetPos: 3, tier: league.tier };
  if (rank <= 7) return { label: "Finish in the top half", targetPos: 6, tier: league.tier };
  return { label: "Avoid relegation", targetPos: n - 2, tier: league.tier };
}

export function initialBoard(league: League, clubs: SaveGame["clubs"], clubId: string, wageBill: number): BoardState {
  return {
    confidence: 60,
    objective: seasonObjective(league, clubs, clubId),
    wageBudget: Math.round((wageBill * 1.1) / 1000) * 1000,
  };
}

export function confidenceLabel(c: number): string {
  if (c >= 80) return "Delighted";
  if (c >= 60) return "Pleased";
  if (c >= 40) return "Satisfied";
  if (c >= 25) return "Concerned";
  return "Losing patience";
}

/**
 * Weekly review after a league week. Returns a warning message when patience
 * is running out, and sets `sacked` when the board acts.
 */
export function weeklyBoardReview(save: SaveGame, wageBill: number, leagueWeek: boolean): { warning?: string; sacked?: boolean } {
  const b = save.board;
  const league = save.leagues.find((l) => l.clubIds.includes(save.userClubId));
  if (!league) return {};
  const club = save.clubs[save.userClubId];
  const before = b.confidence;
  if (leagueWeek && league.currentRound >= 4) {
    const table = leagueTable(league);
    const pos = table.findIndex((r) => r.clubId === save.userClubId) + 1;
    const gap = b.objective.targetPos - pos; // + = ahead of target
    b.confidence += gap >= 0 ? Math.min(2, 0.5 + gap * 0.3) : Math.max(-3, gap * 0.6);
  }
  if (club.balance < 0) b.confidence -= 1.5;
  if (wageBill > b.wageBudget * 1.05) b.confidence -= 0.7;
  b.confidence = Math.max(0, Math.min(100, b.confidence));

  const roundsPlayed = league.currentRound;
  if (b.confidence < 12 && roundsPlayed >= 10) return { sacked: true };
  if (before >= 25 && b.confidence < 25) {
    return { warning: `The board is concerned about the club's direction. Objective: ${b.objective.label.toLowerCase()}.` };
  }
  return {};
}

/** End-of-season verdict: met the objective or not. */
export function seasonReview(save: SaveGame, finalPos: number, promoted: boolean): { met: boolean; text: string; sacked: boolean } {
  const b = save.board;
  const met = finalPos <= b.objective.targetPos || promoted;
  b.confidence = Math.max(0, Math.min(100, b.confidence + (met ? 20 : -25)));
  const sacked = !met && b.confidence < 15;
  const text = met
    ? `Objective achieved (${b.objective.label.toLowerCase()}). The board is ${confidenceLabel(b.confidence).toLowerCase()}.`
    : sacked
      ? `The board expected you to ${b.objective.label.toLowerCase()}. You have been relieved of your duties.`
      : `You fell short of the objective (${b.objective.label.toLowerCase()}). The board expects better next season.`;
  return { met, text, sacked };
}
