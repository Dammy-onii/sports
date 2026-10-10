import { FORMATIONS } from "./constants";
import { overall } from "./ratings";
import { hashString, type Rng } from "./rng";
import { autoPickLineup, slotScore } from "./tactics";
import type { AIManager, Club, FormationId, ManagerStyle, Player, TeamInstructions } from "./types";

/**
 * AI managers who adapt: a style, adaptability, tactical knowledge and the
 * formations they know. They plan for each opponent, react during matches
 * (engine `aiManage`), remember the user's setups and can be sacked.
 * See docs/DEPTH_PLAN.md §7.
 */

const FIRST = ["Marco", "Ade", "Hans", "Luis", "Kenji", "Paul", "Ivan", "Sergio", "Tom", "Femi", "Lars", "Rafa", "Diego", "Owen", "Nico", "Bram"];
const LAST = ["Ferraro", "Okafor", "Lindgren", "Moreno", "Tanaka", "Hartley", "Petrov", "Duarte", "Whitlock", "Bello", "Holm", "Benitez", "Castro", "Reid", "Vidal", "de Wit"];

export const STYLE_INFO: Record<ManagerStyle, { label: string; blurb: string }> = {
  attacking: { label: "Attacking", blurb: "Commits men forward and wants to win every game." },
  possession: { label: "Possession", blurb: "Patient passing; controls the ball and the tempo." },
  counter: { label: "Counter-attacking", blurb: "Sits deep and breaks fast." },
  defensive: { label: "Pragmatic", blurb: "Solid first; happy to grind out results." },
  pressing: { label: "High press", blurb: "Hunts the ball high up the pitch." },
};

const STYLE_BASE: Record<ManagerStyle, TeamInstructions> = {
  attacking: { mentality: 3, pressing: 3, defensiveLine: 3, width: 4, tempo: 4, directness: 3 },
  possession: { mentality: 3, pressing: 3, defensiveLine: 3, width: 3, tempo: 2, directness: 2 },
  counter: { mentality: 3, pressing: 2, defensiveLine: 2, width: 3, tempo: 4, directness: 4 },
  defensive: { mentality: 3, pressing: 2, defensiveLine: 2, width: 2, tempo: 3, directness: 3 },
  pressing: { mentality: 3, pressing: 4, defensiveLine: 4, width: 3, tempo: 3, directness: 3 },
};

const STYLE_FORMATIONS: Record<ManagerStyle, FormationId[]> = {
  attacking: ["4-3-3", "3-5-2", "4-2-3-1"],
  possession: ["4-3-3", "4-2-3-1", "4-4-2"],
  counter: ["4-4-2", "5-3-2", "4-2-3-1"],
  defensive: ["5-3-2", "4-4-2", "4-2-3-1"],
  pressing: ["4-3-3", "4-2-3-1", "3-5-2"],
};

const STYLES = Object.keys(STYLE_BASE) as ManagerStyle[];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const c5 = (v: number) => clamp(Math.round(v), 1, 5);

export function generateManager(rng: Rng, reputation: number, season: number, favourite?: FormationId): AIManager {
  const style = rng.pick(STYLES);
  const level = 6 + (reputation / 100) * 10;
  const formations = [...new Set([favourite ?? STYLE_FORMATIONS[style][0], ...STYLE_FORMATIONS[style]])].slice(0, 3) as FormationId[];
  return {
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    style,
    adaptability: clamp(Math.round(level + rng.normal() * 3), 1, 20),
    knowledge: clamp(Math.round(level + rng.normal() * 3), 1, 20),
    formations,
    patience: clamp(Math.round(10 + rng.normal() * 4), 1, 20),
    since: season,
    memory: {},
  };
}

/** Stable manager for saves made before managers existed. */
export function hashManager(club: Club, season: number): AIManager {
  const h = (salt: string) => hashString(club.id + salt);
  const style = STYLES[h("style") % STYLES.length];
  const level = 6 + (club.reputation / 100) * 10;
  const formations = [...new Set([club.tactics.formation, ...STYLE_FORMATIONS[style]])].slice(0, 3) as FormationId[];
  return {
    name: `${FIRST[h("f") % FIRST.length]} ${LAST[h("l") % LAST.length]}`,
    style,
    adaptability: clamp(Math.round(level + ((h("a") % 7) - 3)), 1, 20),
    knowledge: clamp(Math.round(level + ((h("k") % 7) - 3)), 1, 20),
    formations,
    patience: clamp(8 + (h("p") % 7), 1, 20),
    since: season,
    memory: {},
  };
}

/** Average OVR of a squad's best XI. */
export function squadStrength(squad: Player[]): number {
  const best = squad.map((p) => overall(p)).sort((a, b) => b - a).slice(0, 11);
  return best.reduce((a, b) => a + b, 0) / Math.max(1, best.length);
}

/** How well a squad fits a formation (sum of best slot scores). */
function formationFit(squad: Player[], f: FormationId): number {
  const { lineup } = autoPickLineup(squad, f);
  const byId = new Map(squad.map((p) => [p.id, p]));
  return lineup.reduce((a, id, i) => a + (byId.get(id) ? slotScore(byId.get(id)!, FORMATIONS[f][i].pos) : 0), 0);
}

const DEFENSIVE: FormationId[] = ["5-3-2", "4-4-2", "4-2-3-1"];
const ATTACKING: FormationId[] = ["4-3-3", "3-5-2", "4-2-3-1"];

export interface MatchPlan {
  formation: FormationId;
  instructions: TeamInstructions;
  /** Why he set up this way (for the opposition report / news). */
  reasons: string[];
}

/**
 * How an AI manager sets up for a match: his style, adjusted (by
 * adaptability) for the balance of strength, home or away, the occasion,
 * the opponent's weaknesses (by knowledge) and what he remembers of them.
 */
export function aiMatchPlan(
  club: Club,
  squad: Player[],
  opp: { club: Club; squad: Player[]; instructions: TeamInstructions },
  ctx: { home: boolean; big?: boolean },
): MatchPlan {
  const m = club.manager!;
  const ins = { ...STYLE_BASE[m.style] };
  const reasons: string[] = [`${STYLE_INFO[m.style].label} by nature`];
  const adapt = m.adaptability / 20;
  const sharp = m.knowledge >= 10;
  const diff = squadStrength(squad) - squadStrength(opp.squad) + (ctx.home ? 2 : -2);

  let formation = m.formations[0];
  if (diff < -4 && adapt > 0.3) {
    ins.defensiveLine -= 1;
    ins.pressing -= 1;
    ins.directness += 1;
    reasons.push("underdogs: sit deeper and counter");
    const def = m.formations.find((f) => DEFENSIVE.includes(f));
    if (def && adapt > 0.5) formation = def;
  } else if (diff > 4 && adapt > 0.3) {
    ins.pressing += 1;
    reasons.push("favourites: take the game to them");
    const att = m.formations.find((f) => ATTACKING.includes(f));
    if (att && adapt > 0.5) formation = att;
  }
  if (ctx.big && m.knowledge < 9) {
    ins.mentality -= 1;
    reasons.push("cautious on a big occasion");
  }

  // reading the opponent: the single most useful adjustment (better managers spot it)
  if (sharp) {
    const oppXI = autoPickLineup(opp.squad, opp.club.tactics.formation).lineup.map((id) => opp.squad.find((p) => p.id === id)!).filter(Boolean);
    const cbs = oppXI.filter((p) => p.positions[0] === "CB");
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const reads: { gap: number; apply: () => void }[] = [];
    if (cbs.length) {
      const pace = avg(cbs.map((p) => p.attributes.pace));
      const passing = avg(cbs.map((p) => p.attributes.passing));
      const air = avg(cbs.map((p) => (p.attributes.heading + p.attributes.jumping) / 2));
      reads.push({ gap: 10.5 - pace, apply: () => ((ins.directness += 1), reasons.push("their centre-backs lack pace: balls in behind")) });
      reads.push({ gap: 9.5 - passing, apply: () => ((ins.pressing += 1), reasons.push("press their centre-backs")) });
      reads.push({ gap: 10 - air, apply: () => ((ins.width += 1), reasons.push("cross into their box")) });
    }
    if (opp.instructions.pressing >= 4) reads.push({ gap: 1, apply: () => ((ins.directness += 1), reasons.push("go direct to beat their press")) });
    const best = reads.filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap)[0];
    best?.apply();
  }
  // memory of this opponent
  const mem = m.memory[opp.club.id];
  if (mem && sharp) {
    if (mem.mentality >= 4) {
      ins.defensiveLine -= 1;
      ins.tempo += 1;
      reasons.push("remembers they come at you: counter");
    }
    if (mem.formation === "3-5-2" || mem.formation === "5-3-2") {
      ins.width += 1;
      reasons.push("stretch their back three");
    }
  }

  // never a formation the squad can't play: pick the best-fitting known shape if the fit is poor
  const fits = m.formations.map((f) => ({ f, fit: formationFit(squad, f) }));
  const bestFit = fits.sort((a, b) => b.fit - a.fit)[0];
  if (bestFit && formationFit(squad, formation) < bestFit.fit * 0.93) formation = bestFit.f;

  // a pre-match plan stays sensible (2–4); the extremes are for chasing games
  for (const k of Object.keys(ins) as (keyof TeamInstructions)[]) ins[k] = Math.max(2, Math.min(4, c5(ins[k])));
  return { formation, instructions: ins, reasons };
}

/** After a match against `opp`, the manager remembers how they set up. */
export function rememberOpponent(m: AIManager, oppId: string, formation: FormationId, mentality: number) {
  m.memory[oppId] = { formation, mentality };
}

/** A sack check after a league week: poor results run out a manager's patience. */
export function shouldSack(m: AIManager, position: number, clubs: number, played: number, recentPoints: number, rng: Rng): boolean {
  if (played < 8) return false;
  const bottom = position > clubs - 3;
  const poorRun = recentPoints <= 3; // from the last five
  if (!bottom && !poorRun) return false;
  const chance = (bottom ? 0.06 : 0.02) * (poorRun ? 1.8 : 1) * ((21 - m.patience) / 10);
  return rng.chance(chance);
}
