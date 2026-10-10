import type { MatchState } from "./engine/types";
import type { SaveGame } from "./save";
import type { League, Player } from "./types";

/**
 * Season analytics (docs/DEPTH_PLAN.md §11): a compact log of the user's
 * matches, team trends, goals by period and source, a shot map, league
 * percentiles from every fixture's stats, and player percentiles.
 */

export interface AnalyticsMatch {
  fixtureId: string;
  label: string;
  week: number;
  home: boolean;
  oppId: string;
  gf: number;
  ga: number;
  xgF: number;
  xgA: number;
  shotsF: number;
  shotsA: number;
  possession: number;
  /** [minute, ours (1/0), kind: o = open play, s = set piece, p = penalty] */
  goals: [number, 0 | 1, "o" | "s" | "p"][];
  /** [x, y, xG, goal (1/0), ours (1/0)] — x/y team-relative to the shooter (0–1, attacking right). */
  shots: [number, number, number, 0 | 1, 0 | 1][];
}

export interface SeasonAnalytics {
  season: number;
  matches: AnalyticsMatch[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Log one of the user's matches (friendlies excluded). */
export function recordMatch(save: SaveGame, s: MatchState, fixtureId: string, label: string) {
  const season = save.leagues[0]?.season ?? 1;
  if (!save.analytics || save.analytics.season !== season) save.analytics = { season, matches: [] };
  const side = s.teams[0].clubId === save.userClubId ? 0 : 1;
  const us = s.teams[side];
  const them = s.teams[1 - side];
  const shotTypes = new Set(["goal", "shot_saved", "big_save", "shot_wide", "shot_blocked"]);
  save.analytics.matches.push({
    fixtureId,
    label,
    week: save.calendarIndex,
    home: side === 0,
    oppId: them.clubId,
    gf: s.score[side],
    ga: s.score[1 - side],
    xgF: r2(us.stats.xg),
    xgA: r2(them.stats.xg),
    shotsF: us.stats.shots,
    shotsA: them.stats.shots,
    possession: Math.round((us.stats.possessionTicks / Math.max(1, us.stats.possessionTicks + them.stats.possessionTicks)) * 100),
    goals: s.events.filter((e) => e.type === "goal").map((e) => [e.minute, e.side === side ? 1 : 0, e.penalty ? "p" : e.setPiece ? "s" : "o"]),
    shots: s.events
      .filter((e) => shotTypes.has(e.type) && e.x !== undefined)
      .map((e) => [r2(e.x!), r2(e.y!), r2(e.xg ?? 0), e.type === "goal" ? 1 : 0, e.side === side ? 1 : 0]),
  });
}

export interface TeamSummary {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  xgF: number;
  xgA: number;
  shotsF: number;
  shotsA: number;
  possession: number;
  /** Goals for/against per 15-minute period (6 buckets, last includes stoppage). */
  periods: { for: number[]; against: number[] };
  sources: { for: Record<"o" | "s" | "p", number>; against: Record<"o" | "s" | "p", number> };
}

export function teamSummary(matches: AnalyticsMatch[]): TeamSummary {
  const sum: TeamSummary = {
    played: matches.length,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    xgF: 0,
    xgA: 0,
    shotsF: 0,
    shotsA: 0,
    possession: 0,
    periods: { for: [0, 0, 0, 0, 0, 0], against: [0, 0, 0, 0, 0, 0] },
    sources: { for: { o: 0, s: 0, p: 0 }, against: { o: 0, s: 0, p: 0 } },
  };
  for (const m of matches) {
    if (m.gf > m.ga) sum.won++;
    else if (m.gf < m.ga) sum.lost++;
    else sum.drawn++;
    sum.gf += m.gf;
    sum.ga += m.ga;
    sum.xgF += m.xgF;
    sum.xgA += m.xgA;
    sum.shotsF += m.shotsF;
    sum.shotsA += m.shotsA;
    sum.possession += m.possession;
    for (const [minute, ours, kind] of m.goals) {
      const b = Math.min(5, Math.floor((minute - 1) / 15));
      (ours ? sum.periods.for : sum.periods.against)[b]++;
      (ours ? sum.sources.for : sum.sources.against)[kind]++;
    }
  }
  if (matches.length) sum.possession = Math.round(sum.possession / matches.length);
  return sum;
}

export interface LeagueRow {
  clubId: string;
  played: number;
  gf: number;
  ga: number;
  xgF: number;
  xgA: number;
  shots: number;
  possession: number;
}

/** Per-match averages for every club in a division, from stored fixture stats. */
export function leagueRows(league: League): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(league.clubIds.map((id) => [id, { clubId: id, played: 0, gf: 0, ga: 0, xgF: 0, xgA: 0, shots: 0, possession: 0 }]));
  for (const f of league.fixtures) {
    if (!f.result?.stats) continue;
    const st = f.result.stats;
    for (const [id, i] of [
      [f.homeId, 0],
      [f.awayId, 1],
    ] as const) {
      const r = rows.get(id);
      if (!r) continue;
      r.played++;
      r.gf += i === 0 ? f.result.homeGoals : f.result.awayGoals;
      r.ga += i === 0 ? f.result.awayGoals : f.result.homeGoals;
      r.xgF += st.xg[i];
      r.xgA += st.xg[1 - i];
      r.shots += st.shots[i];
      r.possession += i === 0 ? st.possession : 100 - st.possession;
    }
  }
  return [...rows.values()].map((r) => {
    const n = Math.max(1, r.played);
    return { ...r, gf: r.gf / n, ga: r.ga / n, xgF: r.xgF / n, xgA: r.xgA / n, shots: r.shots / n, possession: r.possession / n };
  });
}

/** Percentile (0–100) of `value` among `values`; `lowerIsBetter` flips it. */
export function percentile(value: number, values: number[], lowerIsBetter = false): number {
  if (values.length <= 1) return 50;
  const below = values.filter((v) => (lowerIsBetter ? v > value : v < value)).length;
  const equal = values.filter((v) => v === value).length;
  return Math.round(((below + (equal - 1) / 2) / (values.length - 1)) * 100);
}

export const PLAYER_METRICS: { key: string; label: string; per90: (p: Player) => number; groups: string[] }[] = [
  { key: "goals", label: "Goals", per90: (p) => p.season.goals, groups: ["ATT", "MID"] },
  { key: "xg", label: "xG", per90: (p) => p.season.xg, groups: ["ATT", "MID"] },
  { key: "assists", label: "Assists", per90: (p) => p.season.assists, groups: ["ATT", "MID", "DEF"] },
  { key: "keyPasses", label: "Key passes", per90: (p) => p.season.keyPasses, groups: ["ATT", "MID"] },
  { key: "dribbles", label: "Dribbles", per90: (p) => p.season.dribbles, groups: ["ATT", "MID"] },
  { key: "passes", label: "Passes", per90: (p) => p.season.passesCompleted, groups: ["MID", "DEF"] },
  { key: "tackles", label: "Tackles won", per90: (p) => p.season.tacklesWon, groups: ["DEF", "MID"] },
  { key: "interceptions", label: "Interceptions", per90: (p) => p.season.interceptions, groups: ["DEF", "MID"] },
  { key: "saves", label: "Saves", per90: (p) => p.season.saves, groups: ["GK"] },
];

const GROUP: Record<string, string> = { GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF", DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID", LW: "ATT", RW: "ATT", ST: "ATT" };
export const groupOf = (p: Player) => GROUP[p.positions[0]];

/** A player's per-90 output as percentiles against players in his position group in the division. */
export function playerPercentiles(save: SaveGame, p: Player, league: League): { label: string; value: number; per90: number }[] {
  const g = groupOf(p);
  const clubs = new Set(league.clubIds);
  const peers = Object.values(save.players).filter((x) => clubs.has(x.clubId) && groupOf(x) === g && x.season.minutes >= 270);
  const per90 = (x: Player, f: (x: Player) => number) => (f(x) / Math.max(1, x.season.minutes)) * 90;
  return PLAYER_METRICS.filter((m) => m.groups.includes(g)).map((m) => {
    const mine = per90(p, m.per90);
    return { label: m.label, per90: Math.round(mine * 100) / 100, value: percentile(mine, peers.map((x) => per90(x, m.per90))) };
  });
}
