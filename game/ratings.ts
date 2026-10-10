import { ATTRIBUTE_KEYS, POSITION_NEIGHBOURS, POSITION_WEIGHTS } from "./constants";
import type { Attributes, Player, Position } from "./types";

/** Weighted attribute average for a position (1–20). */
export function positionScore(attrs: Attributes, pos: Position): number {
  const weights = POSITION_WEIGHTS[pos];
  let sum = 0;
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] ?? 0;
    if (w > 0) {
      sum += attrs[key] * w;
      total += w;
    }
  }
  return total ? sum / total : 0;
}

/** 0–1 multiplier for playing a player in a given slot. */
export function familiarity(player: Pick<Player, "positions">, pos: Position): number {
  const [natural, ...secondary] = player.positions;
  if (natural === pos) return 1;
  if (secondary.includes(pos)) return 0.95;
  if (pos === "GK" || natural === "GK") return 0.25;
  if (POSITION_NEIGHBOURS[natural].includes(pos)) return 0.85;
  return 0.7;
}

/** 1–99 overall rating. */
export function overallFromScore(score: number): number {
  return Math.max(1, Math.min(99, Math.round(score * 5 - 1)));
}

export function overall(player: Player, pos: Position = player.positions[0]): number {
  return overallFromScore(positionScore(player.attributes, pos) * familiarity(player, pos));
}

/** Current ability on the 1–200 scale used for potential. */
export function currentAbility(player: Player): number {
  return positionScore(player.attributes, player.positions[0]) * 10;
}

export function potentialStars(player: Player): number {
  // 0.5–5 stars from potential ability
  return Math.max(0.5, Math.min(5, Math.round((player.potential / 200) * 10 * 1.15) / 2));
}

export function playerValue(player: Player): number {
  const ovr = overall(player);
  const ageFactor =
    player.age <= 21 ? 1.4 : player.age <= 25 ? 1.2 : player.age <= 29 ? 1 : player.age <= 32 ? 0.6 : 0.3;
  const potentialBonus = Math.max(0, player.potential / 10 - ovr / 5) * 0.04;
  const base = Math.pow(Math.max(ovr - 30, 1), 2.6) * 70;
  return Math.round((base * ageFactor * (1 + potentialBonus)) / 1000) * 1000;
}

export function formatMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1_000) return `£${Math.round(v / 1_000)}k`;
  return `£${v}`;
}

export function averageForm(player: Player): number | null {
  if (!player.form.length) return null;
  return player.form.reduce((a, b) => a + b, 0) / player.form.length;
}

export type TraitKey =
  | "aggression"
  | "injuryProneness"
  | "consistency"
  | "professionalism"
  | "determination"
  | "ambition"
  | "pressure"
  | "loyalty"
  | "adaptability"
  | "sportsmanship";

export const TRAIT_INFO: Record<TraitKey, { label: string; bands: string[]; highIsGood: boolean; blurb: string }> = {
  aggression: {
    label: "Temperament",
    bands: ["Calm", "Composed", "Combative", "Fiery", "Hot-headed"],
    highIsGood: false,
    blurb: "Higher means more fouls, cards and reckless challenges.",
  },
  injuryProneness: {
    label: "Injury proneness",
    bands: ["Iron man", "Resilient", "Average", "Fragile", "Injury-prone"],
    highIsGood: false,
    blurb: "Higher means more injuries in matches and training, and longer layoffs.",
  },
  consistency: {
    label: "Consistency",
    bands: ["Erratic", "Streaky", "Steady", "Reliable", "Rock-solid"],
    highIsGood: true,
    blurb: "Lower means bigger swings between brilliant and poor days.",
  },
  professionalism: {
    label: "Professionalism",
    bands: ["Casual", "Easy-going", "Fairly professional", "Professional", "Model professional"],
    highIsGood: true,
    blurb: "The biggest driver of development. Professionals also age more slowly.",
  },
  determination: {
    label: "Determination",
    bands: ["Gives up easily", "Wavering", "Driven", "Determined", "Relentless"],
    highIsGood: true,
    blurb: "Helps development and recovery from long injuries.",
  },
  ambition: {
    label: "Ambition",
    bands: ["Content", "Unambitious", "Ambitious", "Very ambitious", "Driven to the top"],
    highIsGood: true,
    blurb: "Wants to reach the top: develops a little faster, but eyes bigger clubs and bigger wages.",
  },
  pressure: {
    label: "Big-match temperament",
    bands: ["Crumbles", "Nervy", "Copes", "Relishes it", "Ice-cold"],
    highIsGood: true,
    blurb: "Low means nerves on big occasions: derbies, cup ties, title races.",
  },
  loyalty: {
    label: "Loyalty",
    bands: ["Mercenary", "Fickle", "Committed", "Loyal", "One-club man"],
    highIsGood: true,
    blurb: "Loyal players keep their mood steadier and ask for less to stay.",
  },
  adaptability: {
    label: "Adaptability",
    bands: ["Struggles to settle", "Slow to settle", "Settles", "Settles quickly", "At home anywhere"],
    highIsGood: true,
    blurb: "How quickly he settles after a transfer.",
  },
  sportsmanship: {
    label: "Sportsmanship",
    bands: ["Cynical", "Gamesman", "Fair", "Sporting", "Model sportsman"],
    highIsGood: true,
    blurb: "Sporting players keep their heads and argue less when frustrated.",
  },
};

/** Descriptive band for a 1–20 trait value. */
export function traitBand(key: TraitKey, v: number): string {
  const i = v <= 5 ? 0 : v <= 9 ? 1 : v <= 13 ? 2 : v <= 16 ? 3 : 4;
  return TRAIT_INFO[key].bands[i];
}

/** Trait badges worth flagging in squad lists. */
export function traitFlags(p: { traits?: { aggression: number; injuryProneness: number; consistency: number; professionalism?: number } }) {
  const t = p.traits;
  if (!t) return [];
  const flags: { key: TraitKey; text: string }[] = [];
  if (t.aggression >= 16) flags.push({ key: "aggression", text: "Hot-head" });
  if (t.injuryProneness >= 15) flags.push({ key: "injuryProneness", text: "Fragile" });
  if (t.consistency <= 5) flags.push({ key: "consistency", text: "Erratic" });
  if ((t.professionalism ?? 10) >= 17) flags.push({ key: "professionalism", text: "Model pro" });
  if ((t.professionalism ?? 10) <= 4) flags.push({ key: "professionalism", text: "Casual" });
  return flags;
}
