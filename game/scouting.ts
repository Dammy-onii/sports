import { staffRating } from "./economy";
import { hashString } from "./rng";
import { overall, potentialStars } from "./ratings";
import type { Rng } from "./rng";
import type { SaveGame, ScoutAssignment } from "./save";
import type { AttributeKey, Player } from "./types";

/**
 * Scouting knowledge (0–100) per player. Your own players are fully known.
 * Others start partly known (same division) or barely known, and become clear
 * through scouting assignments, the shortlist and playing against them.
 */

export const GROUP_OF: Record<string, "GK" | "DEF" | "MID" | "ATT"> = {
  GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF", DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID", LW: "ATT", RW: "ATT", ST: "ATT",
};

export function baseKnowledge(save: SaveGame, p: Player): number {
  if (p.clubId === save.userClubId || p.loan?.fromClubId === save.userClubId) return 100;
  const mine = save.leagues.find((l) => l.clubIds.includes(save.userClubId));
  if (mine?.clubIds.includes(p.clubId)) return 30;
  return 10;
}

export function knowledgeOf(save: SaveGame, p: Player): number {
  if (p.clubId === save.userClubId || p.loan?.fromClubId === save.userClubId) return 100;
  return Math.max(baseKnowledge(save, p), save.knowledge?.[p.id] ?? 0);
}

export function addKnowledge(save: SaveGame, playerId: string, amount: number) {
  const p = save.players[playerId];
  if (!p) return;
  save.knowledge[playerId] = Math.min(100, Math.max(knowledgeOf(save, p), save.knowledge[playerId] ?? 0) + amount);
}

/** How many points either side of the truth an attribute shows as. */
export function uncertainty(knowledge: number): number {
  return knowledge >= 90 ? 0 : Math.ceil(((100 - knowledge) / 100) * 4);
}

/**
 * The range shown for an attribute. Deterministic per player and attribute so
 * it doesn't flicker, and it always contains the true value.
 */
export function attrRange(p: Player, key: AttributeKey | string, value: number, knowledge: number): [number, number] {
  const u = uncertainty(knowledge);
  const v = Math.floor(value);
  if (!u) return [v, v];
  const off = hashString(p.id + key) % (2 * u + 1); // 0 … 2u
  const lo = Math.max(1, v - off);
  const hi = Math.min(20, lo + 2 * u);
  return [lo, hi];
}

export function ovrRange(p: Player, knowledge: number): [number, number] {
  const o = overall(p);
  const u = knowledge >= 90 ? 0 : Math.ceil(((100 - knowledge) / 100) * 9);
  if (!u) return [o, o];
  const off = hashString(p.id + "ovr") % (2 * u + 1);
  return [Math.max(1, o - off), Math.min(99, o - off + 2 * u)];
}

export function starsRange(p: Player, knowledge: number): [number, number] {
  const s = potentialStars(p);
  const u = knowledge >= 80 ? 0 : knowledge >= 50 ? 0.5 : knowledge >= 25 ? 1 : 1.5;
  return [Math.max(0.5, s - u), Math.min(5, s + u)];
}

export function fmtRange([lo, hi]: [number, number]): string {
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** Personality is only readable once he's well scouted. */
export function traitsKnown(knowledge: number) {
  return knowledge >= 60;
}

function matches(save: SaveGame, p: Player, a: ScoutAssignment): boolean {
  switch (a.kind) {
    case "position":
      return GROUP_OF[p.positions[0]] === a.value;
    case "league":
      if (a.value === "FA") return p.clubId === "FA";
      return save.leagues.find((l) => l.id === a.value)?.clubIds.includes(p.clubId) ?? false;
    case "youth":
      return p.age <= 21;
  }
}

/**
 * A week of scouting: the scout files reports on players matching his
 * assignments (most promising first), clears the "scout this player" queue,
 * and keeps tabs on the shortlist. Returns the names reported on.
 */
export function weeklyScouting(save: SaveGame, rng: Rng): string[] {
  const club = save.clubs[save.userClubId];
  const rating = staffRating(club.staff, "scout");
  const reported: string[] = [];
  // queued requests come first and are fully scouted
  const queueCap = 1 + Math.floor(rating / 7);
  for (const id of save.scouting.queue.splice(0, queueCap)) {
    addKnowledge(save, id, 100);
    reported.push(id);
  }
  const perAssignment = 1 + Math.floor(rating / 6);
  const gain = 30 + rating * 2;
  for (const a of save.scouting.assignments) {
    const pool = Object.values(save.players)
      .filter((p) => p.clubId !== save.userClubId && knowledgeOf(save, p) < 90 && matches(save, p, a))
      .sort((x, y) => y.potential - x.potential + rng.range(-15, 15));
    for (const p of pool.slice(0, perAssignment)) {
      addKnowledge(save, p.id, gain);
      reported.push(p.id);
    }
  }
  for (const id of save.shortlist) addKnowledge(save, id, 8);
  return reported;
}
