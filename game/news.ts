import type { NewsItem, SaveGame } from "./save";
import type { Fixture } from "./types";

export function pushNews(save: SaveGame, kind: NewsItem["kind"], text: string) {
  const season = save.leagues[0]?.season ?? 1;
  save.news = [{ id: `n_${season}_${save.calendarIndex}_${save.news.length}_${text.length}`, season, week: save.calendarIndex, kind, text }, ...save.news].slice(0, 80);
}

/** Is this a match the press will want to talk about? */
export function isBigMatch(save: SaveGame, f: Fixture, comp: "league" | "cup" | "super" | "friendly", roundName?: string): string | null {
  if (comp === "friendly") return null;
  const user = save.clubs[save.userClubId];
  const oppId = f.homeId === user.id ? f.awayId : f.homeId;
  const opp = save.clubs[oppId];
  if (!opp) return null;
  if (user.rivalId === oppId) return `the derby against ${opp.name}`;
  if (comp === "cup" && (roundName === "Final" || roundName === "Semi-finals")) return `the cup ${roundName === "Final" ? "final" : "semi-final"} against ${opp.name}`;
  if (comp === "super") return `the Super Cup against ${opp.name}`;
  return null;
}
