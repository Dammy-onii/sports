import { developWeek, mentorWeek, returnFromInjury, type DevContext } from "./development";
import { overall } from "./ratings";
import type { Rng } from "./rng";
import type { Player, TrainingPlan } from "./types";

/**
 * `recovery` is the share of the fitness deficit won back in a week. A match
 * costs ~24 points, so a regular starter settles around 97% on light
 * training, 92% on normal and 80% on intense: rotation matters, but there is
 * no week-on-week collapse.
 */
const INTENSITY = {
  light: { recovery: 0.9, injury: 0.002 },
  normal: { recovery: 0.75, injury: 0.005 },
  intense: { recovery: 0.55, injury: 0.012 },
} as const;

export interface TrainingReport {
  improved: { playerId: string; from: number; to: number }[];
  injured: { playerId: string; weeks: number }[];
  /** Players who finished learning a new position. */
  retrained: { playerId: string; pos: string }[];
  /** CA change per player this week. */
  deltas: Record<string, number>;
  breakthroughs: string[];
  setbacks: { playerId: string; note: string }[];
}

export interface TrainingContext extends Omit<DevContext, "focus" | "intensity" | "matchPrep"> {
  /** Physio rating 1–20: training injuries and recovery. */
  physio: number;
  /** Fitness coach rating (1–20), if any: better recovery. */
  fitnessCoach?: number;
}

/**
 * One week of training for a squad. Mutates players in place: development,
 * position retraining, mentoring, recovery and training injuries.
 */
export function trainWeek(players: Player[], plan: TrainingPlan, rng: Rng, ctx: TrainingContext): TrainingReport {
  const report: TrainingReport = { improved: [], injured: [], retrained: [], deltas: {}, breakthroughs: [], setbacks: [] };
  const intensity = INTENSITY[plan.intensity];
  const physio = ctx.physio;
  const byId = new Map(players.map((p) => [p.id, p]));
  const dev: DevContext = { ...ctx, focus: plan.focus, intensity: plan.intensity, matchPrep: !!plan.matchPrep && plan.matchPrep !== "none" };

  for (const p of players) {
    const before = overall(p);

    if (p.injuryWeeks > 0) {
      p.injuryWeeks--;
      // a good physio gets players back early
      if (p.injuryWeeks > 0 && rng.chance((physio - 8) / 40)) p.injuryWeeks--;
      p.fitness = Math.min(100, p.fitness + 6);
      if (p.injuryWeeks === 0) {
        const note = returnFromInjury(p, rng);
        if (note) report.setbacks.push({ playerId: p.id, note });
      }
      continue;
    }

    // Learning a new position: quicker for young, intelligent players
    if (p.retrain) {
      p.retrain.progress += 5 + p.attributes.decisions / 4 + (p.age <= 23 ? 3 : 0);
      if (p.retrain.progress >= 100) {
        if (!p.positions.includes(p.retrain.pos)) p.positions.push(p.retrain.pos);
        report.retrained.push({ playerId: p.id, pos: p.retrain.pos });
        p.retrain = undefined;
      }
    }

    // Mentoring: a senior pro rubs off on a youngster
    const mentor = p.mentorId ? byId.get(p.mentorId) : undefined;
    if (mentor && mentor.age >= 27 && p.age <= 23) mentorWeek(p, mentor);
    else if (p.mentorId && !mentor) p.mentorId = undefined;

    const r = developWeek(p, dev, rng);
    report.deltas[p.id] = r.delta;
    if (r.breakthrough) report.breakthroughs.push(p.id);

    // Recovery and injury risk
    const rate = Math.min(0.95, intensity.recovery + (physio - 10) * 0.01 + ((ctx.fitnessCoach ?? 10) - 10) * 0.005 + (p.attributes.naturalFitness - 10) * 0.006);
    p.fitness = Math.min(100, Math.round(p.fitness + (100 - p.fitness) * rate));
    const proneness = p.traits?.injuryProneness ?? 10;
    const risk = intensity.injury * (p.fitness < 70 ? 2 : 1) * (0.3 + (proneness / 20) * 1.4) * (1.25 - physio / 40);
    if (rng.chance(risk)) {
      const weeks = rng.int(1, 2 + Math.round(proneness / 7));
      p.injuryWeeks = weeks;
      p.injuryLength = weeks;
      report.injured.push({ playerId: p.id, weeks });
    }

    // Morale drifts toward neutral
    p.morale += (65 - p.morale) * 0.1;

    const after = overall(p);
    if (after > before) report.improved.push({ playerId: p.id, from: before, to: after });
  }
  return report;
}
