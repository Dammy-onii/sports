import { FORMATIONS } from "./constants";
import { familiarity, positionScore } from "./ratings";
import { DEFAULT_ROLE } from "./roles";
import type { FormationId, Player, Position, RoleId, SetPieces } from "./types";

export function isAvailable(p: Player): boolean {
  return p.injuryWeeks <= 0 && !(p.suspension > 0);
}

/** Selection score for a player in a slot: ability × familiarity × condition. */
export function slotScore(p: Player, pos: Position): number {
  const condition = 0.7 + 0.3 * (p.fitness / 100);
  return positionScore(p.attributes, pos) * familiarity(p, pos) * condition;
}

export const isKeeper = (p: Player) => p.positions.includes("GK");

/**
 * Best candidate for a slot. Goal is special: only a keeper goes in goal;
 * with none available, the outfielder with the best goalkeeping (never
 * simply the best all-round player).
 */
function bestFor(candidates: Player[], pos: Position): Player | undefined {
  if (pos === "GK") {
    const keepers = candidates.filter(isKeeper);
    if (keepers.length) return keepers.sort((a, b) => slotScore(b, "GK") - slotScore(a, "GK"))[0];
    return [...candidates].sort((a, b) => b.attributes.goalkeeping - a.attributes.goalkeeping || a.attributes.finishing - b.attributes.finishing)[0];
  }
  let best: Player | undefined;
  let bestScore = -Infinity;
  for (const p of candidates) {
    const sc = slotScore(p, pos);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  return best;
}

/**
 * Greedy best-XI. Fills the most specialised slots first (GK, then defence → attack).
 */
export function autoPickLineup(
  players: Player[],
  formation: FormationId,
  benchSize = 7,
): { lineup: string[]; bench: string[] } {
  const slots = FORMATIONS[formation];
  const available = players.filter(isAvailable);
  const used = new Set<string>();
  const lineup: string[] = new Array(slots.length).fill("");

  const order = slots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.pos === "GK" ? -1 : b.s.pos === "GK" ? 1 : 0));

  for (const { s, i } of order) {
    const best = bestFor(
      available.filter((p) => !used.has(p.id)),
      s.pos,
    );
    if (best) {
      used.add(best.id);
      lineup[i] = best.id;
    }
  }

  const rest = available
    .filter((p) => !used.has(p.id))
    .sort((a, b) => positionScore(b.attributes, b.positions[0]) - positionScore(a.attributes, a.positions[0]));
  const bench: string[] = [];
  const backupGk = rest.find((p) => p.positions[0] === "GK");
  if (backupGk) bench.push(backupGk.id);
  for (const p of rest) {
    if (bench.length >= benchSize) break;
    if (!bench.includes(p.id)) bench.push(p.id);
  }
  return { lineup, bench };
}

/** Re-seat the current XI into a new formation's slots, best fit first. */
export function remapLineup(xi: Player[], formation: FormationId): string[] {
  const slots = FORMATIONS[formation];
  const result: string[] = new Array(slots.length).fill("");
  const free = new Set(xi.map((p) => p.id));
  const byId = new Map(xi.map((p) => [p.id, p]));
  // most specialised slots first so the GK lands in goal
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => (a.s.pos === "GK" ? -1 : b.s.pos === "GK" ? 1 : 0));
  for (const { s, i } of order) {
    const best = bestFor(
      [...free].map((id) => byId.get(id)!),
      s.pos,
    );
    if (best) {
      result[i] = best.id;
      free.delete(best.id);
    }
  }
  return result;
}

/** Keep selection valid after injuries / formation changes. */
export function repairLineup(
  players: Player[],
  formation: FormationId,
  lineup: string[],
  bench: string[],
): { lineup: string[]; bench: string[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const slots = FORMATIONS[formation];
  const valid = (id: string) => {
    const p = byId.get(id);
    return !!p && isAvailable(p);
  };
  const next = slots.map((_, i) => (lineup[i] && valid(lineup[i]) ? lineup[i] : ""));
  // de-duplicate
  const seen = new Set<string>();
  for (let i = 0; i < next.length; i++) {
    if (next[i] && seen.has(next[i])) next[i] = "";
    if (next[i]) seen.add(next[i]);
  }
  // a fit keeper always goes in goal if the club has one (an outfielder
  // left there, e.g. when the keeper was injured, gives way)
  slots.forEach((slot, i) => {
    if (slot.pos !== "GK" || (next[i] && isKeeper(byId.get(next[i])!))) return;
    const keeper = players.filter((p) => isKeeper(p) && isAvailable(p) && !next.includes(p.id)).sort((a, b) => slotScore(b, "GK") - slotScore(a, "GK"))[0];
    if (keeper) {
      if (next[i]) seen.delete(next[i]);
      next[i] = keeper.id;
      seen.add(keeper.id);
    }
  });
  for (let i = 0; i < next.length; i++) {
    if (next[i]) continue;
    const best = bestFor(
      players.filter((p) => !seen.has(p.id) && isAvailable(p)),
      slots[i].pos,
    );
    if (best) {
      next[i] = best.id;
      seen.add(best.id);
    }
  }
  const nextBench = bench.filter((id) => valid(id) && !seen.has(id));
  for (const p of players) {
    if (nextBench.length >= 7) break;
    if (!seen.has(p.id) && isAvailable(p) && !nextBench.includes(p.id)) nextBench.push(p.id);
  }
  return { lineup: next, bench: nextBench.slice(0, 7) };
}

/** Pick the role that best suits each player's attributes in his slot. */
export function autoRoles(players: Record<string, Player> | Map<string, Player>, formation: FormationId, lineup: string[]): RoleId[] {
  const get = (id: string) => (players instanceof Map ? players.get(id) : players[id]);
  return FORMATIONS[formation].map((slot, i) => {
    const p = get(lineup[i]);
    if (!p) return DEFAULT_ROLE[slot.pos];
    const a = p.attributes;
    switch (slot.pos) {
      case "GK":
        return a.passing >= 11 && a.pace >= 10 ? "sweeper_keeper" : "goalkeeper";
      case "CB":
        if (a.passing >= 12 && a.passing >= a.tackling - 1) return "ball_playing_defender";
        if (a.tackling >= 13 && a.strength >= 13) return "stopper";
        return "defender";
      case "LB":
      case "RB":
        if (a.pace + a.stamina >= 27 && a.dribbling >= 10) return "wing_back";
        if (a.passing >= 12 && a.vision >= 11) return "inverted_full_back";
        return "full_back";
      case "DM":
        if (a.passing + a.vision >= 25) return "deep_playmaker";
        if (a.tackling + a.workRate >= 27) return "ball_winner";
        return "anchor";
      case "CM":
        if (a.passing + a.vision >= 26) return "playmaker";
        if (a.dribbling + a.pace >= 26) return "carrier";
        if (a.tackling + a.workRate >= 27) return "ball_winner";
        return "box_to_box";
      case "AM":
        return a.finishing >= 13 && a.finishing >= a.passing ? "shadow_striker" : "advanced_playmaker";
      case "LM":
      case "RM":
        if (a.pace + a.dribbling >= 26) return "winger";
        if (a.finishing >= 12) return "inside_forward";
        return "wide_midfielder";
      case "LW":
      case "RW":
        return a.finishing >= 11 && a.finishing >= a.dribbling - 1 ? "inside_forward" : "winger";
      case "ST":
        if (a.heading + a.strength >= 28 && a.pace < 13) return "target_man";
        if (a.passing + a.vision >= 26) return "false_nine";
        return "poacher";
    }
  });
}

/** Sensible set-piece takers: best finisher on pens, best long-shot on free kicks, best passer on corners. */
export function autoSetPieces(xi: Player[], routine: SetPieces["cornerRoutine"] = "mixed"): SetPieces {
  const best = (score: (p: Player) => number) => [...xi].filter((p) => p.positions[0] !== "GK").sort((a, b) => score(b) - score(a))[0]?.id;
  return {
    penalty: best((p) => p.attributes.penalties * 2 + p.attributes.composure),
    freeKick: best((p) => p.attributes.freeKicks * 2 + p.attributes.technique),
    corner: best((p) => p.attributes.crossing * 2 + p.attributes.technique),
    cornerRoutine: routine,
  };
}
