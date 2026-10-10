import { newContract } from "./economy";
import { generatePlayer, levelForReputation } from "./generate";
import { currentAbility, overall } from "./ratings";
import type { Rng } from "./rng";
import type { SaveGame } from "./save";
import type { Club, Player, Position } from "./types";

const INTAKE_POSITIONS: Position[] = ["GK", "CB", "CB", "LB", "RB", "DM", "CM", "CM", "AM", "LW", "RW", "ST", "ST"];

/**
 * A club's yearly youth intake. Academy quality (1–5) raises both the
 * number of prospects and their potential; the odd gem appears anywhere.
 */
export function generateIntake(rng: Rng, club: Club, season: number, tier: number, usedNames: Set<string>): Player[] {
  const count = 2 + club.academy + rng.int(0, 1);
  const base = levelForReputation(club.reputation) - 4.5;
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const p = generatePlayer(rng, {
      clubId: club.id,
      position: rng.pick(INTAKE_POSITIONS),
      level: Math.max(3, base + rng.normal() * 1.2),
      age: rng.int(16, 18),
      shirt: 40 + i,
      usedNames,
      season,
      tier,
    });
    // academy quality drives potential; a rare "golden" prospect for anyone
    const gem = rng.chance(0.04 + club.academy * 0.01);
    const youthCoach = club.staff.youthCoach?.rating ?? 8;
    p.potential = Math.min(200, Math.round(currentAbility(p) + rng.range(30, 54) + (club.academy - 3) * 6 + (youthCoach - 10) * 0.6 + (gem ? 35 : 0)));
    p.status = "prospect";
    p.contract = { ...newContract(p, season, tier), wage: Math.max(500, Math.round(p.contract.wage * 0.5 / 50) * 50) };
    out.push(p);
  }
  return out.sort((a, b) => b.potential - a.potential);
}

export const MAX_SQUAD_SIZE = 30;

export function nextFreeShirt(save: SaveGame, clubId: string): number {
  const used = new Set(Object.values(save.players).filter((p) => p.clubId === clubId).map((p) => p.shirt));
  for (let n = 2; n < 99; n++) if (!used.has(n)) return n;
  return 99;
}

/** Sign a youth prospect from the pending intake. */
export function signYouth(save: SaveGame, playerId: string): { ok: boolean; reason?: string } {
  const intake = save.youthIntake;
  const p = intake?.players.find((x) => x.id === playerId);
  if (!intake || !p) return { ok: false, reason: "That prospect is no longer available." };
  const squad = Object.values(save.players).filter((x) => x.clubId === save.userClubId);
  if (squad.length >= MAX_SQUAD_SIZE) return { ok: false, reason: `Your squad is full (${MAX_SQUAD_SIZE}).` };
  p.shirt = nextFreeShirt(save, save.userClubId);
  save.players[p.id] = p;
  save.knowledge[p.id] = 100;
  intake.players = intake.players.filter((x) => x.id !== playerId);
  if (!intake.players.length) save.youthIntake = null;
  return { ok: true };
}

export function releaseYouth(save: SaveGame, playerId: string) {
  if (!save.youthIntake) return;
  save.youthIntake.players = save.youthIntake.players.filter((x) => x.id !== playerId);
  if (!save.youthIntake.players.length) save.youthIntake = null;
}

/** The assistant's pick: best two by potential. */
export function autoSignYouth(save: SaveGame) {
  const best = [...(save.youthIntake?.players ?? [])].sort((a, b) => b.potential - a.potential).slice(0, 2);
  for (const p of best) signYouth(save, p.id);
  save.youthIntake = null;
}

/** Summary line for inbox/news. */
export function intakeSummary(players: Player[]): string {
  const best = players[0];
  return `${players.length} prospects from the academy. Pick of the bunch: ${best.firstName} ${best.lastName} (${best.age}, ${best.positions[0]}, ${overall(best)} OVR).`;
}

/**
 * AI clubs never field fewer than a full side: promote youth-team players
 * when the squad gets too thin (retirements, injuries, departures).
 */
export function topUpSquad(save: SaveGame, rng: Rng, club: Club, season: number, tier: number, minimum: number) {
  const squad = Object.values(save.players).filter((p) => p.clubId === club.id);
  const fit = squad.filter((p) => p.injuryWeeks <= 0 && !(p.suspension > 0));
  const need = Math.max(minimum - squad.length, 13 - fit.length, 0);
  if (!need) return;
  const used = new Set(squad.map((p) => p.lastName));
  const keepers = squad.filter((p) => p.positions[0] === "GK" && p.injuryWeeks <= 0).length;
  for (let i = 0; i < need; i++) {
    const p = generatePlayer(rng, {
      clubId: club.id,
      position: keepers + i === 0 ? "GK" : rng.pick(INTAKE_POSITIONS),
      level: Math.max(3, levelForReputation(club.reputation) - 2.5 + rng.normal()),
      age: rng.int(17, 19),
      shirt: nextFreeShirt(save, club.id),
      usedNames: used,
      season,
      tier,
    });
    p.status = "prospect";
    save.players[p.id] = p;
  }
}
