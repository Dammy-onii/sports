import { overall } from "./ratings";
import type { Rng } from "./rng";
import type { CalendarSlot, PreseasonPlan, SaveGame } from "./save";
import type { Club, Fixture } from "./types";

/**
 * The calendar beyond league and cup: match sharpness, pre-season
 * (friendlies, training camp, rest) and international breaks.
 * See docs/DEPTH_PLAN.md §9.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const season = (save: SaveGame) => save.leagues[0]?.season ?? 1;

export const CAMP_COST = 150_000;

// ───────────── sharpness ─────────────

/**
 * Weekly sharpness: minutes sharpen players, idleness dulls them. Friendlies
 * count, camps help everyone, injuries hurt most.
 */
export function weeklySharpness(save: SaveGame, minutes: Record<string, number>, slot: CalendarSlot | undefined) {
  const camp = slot?.kind === "preseason" && save.preseason.plans[slot.week]?.kind === "camp";
  for (const p of Object.values(save.players)) {
    const s = p.sharpness ?? 85;
    const m = minutes[p.id] ?? 0;
    let next = s;
    if (p.injuryWeeks > 0) next -= 7;
    else if (m > 0) next += 4 + (m / 90) * 14;
    else next -= slot?.kind === "intl" ? 1 : 4;
    if (camp && p.clubId === save.userClubId && p.injuryWeeks <= 0) next += 8;
    // AI clubs arrange their own friendlies in pre-season
    if (slot?.kind === "preseason" && p.clubId !== save.userClubId && p.injuryWeeks <= 0) next += 9;
    p.sharpness = clamp(next, 20, 100);
  }
}

/** Back from the summer: everyone's a little rusty. */
export function summerRust(save: SaveGame) {
  for (const p of Object.values(save.players)) p.sharpness = clamp(50 + p.attributes.naturalFitness * 1.2, 40, 75);
}

// ───────────── pre-season ─────────────

export function clubStrength(save: SaveGame, clubId: string): number {
  const best = Object.values(save.players)
    .filter((p) => p.clubId === clubId)
    .map((p) => overall(p))
    .sort((a, b) => b - a)
    .slice(0, 11);
  return best.reduce((a, b) => a + b, 0) / Math.max(1, best.length);
}

/** Three friendly options: a stronger side, a similar one and a weaker one. */
export function friendlyOptions(save: SaveGame): { club: Club; label: string; strength: number }[] {
  const mine = clubStrength(save, save.userClubId);
  const others = Object.values(save.clubs)
    .filter((c) => c.id !== save.userClubId)
    .map((c) => ({ club: c, strength: clubStrength(save, c.id) }))
    .sort((a, b) => a.strength - b.strength);
  const pick = (target: number) => others.reduce((best, x) => (Math.abs(x.strength - target) < Math.abs(best.strength - target) ? x : best), others[0]);
  const stronger = pick(mine + 6);
  const similar = pick(mine);
  const weaker = pick(mine - 6);
  const seen = new Set<string>();
  return [
    { ...stronger, label: "A stronger side: a real test" },
    { ...similar, label: "A similar side" },
    { ...weaker, label: "A weaker side: build confidence" },
  ].filter((o) => (seen.has(o.club.id) ? false : (seen.add(o.club.id), true)));
}

/** Default plan for a pre-season week: friendlies most weeks, a camp in week two. */
export function defaultPlan(save: SaveGame, week: number): PreseasonPlan {
  if (week === 1) return { kind: "camp" };
  const opts = friendlyOptions(save);
  const o = opts[week % opts.length] ?? opts[0];
  return { kind: "friendly", opponentId: o.club.id, home: week % 2 === 0 };
}

/** The plan for a pre-season week (read-only: the default until the user picks). */
export function planFor(save: SaveGame, week: number): PreseasonPlan {
  return save.preseason.plans[week] ?? defaultPlan(save, week);
}

/**
 * The friendly fixture for a pre-season week. Read-only unless `persist`,
 * which stores it (and the plan) so its result can be kept.
 */
export function friendlyFixture(save: SaveGame, week: number, persist = false): Fixture | undefined {
  const plan = planFor(save, week);
  if (plan.kind !== "friendly") return undefined;
  const id = `fr_${season(save)}_${week}`;
  const existing = save.preseason.friendlies.find((x) => x.id === id);
  if (existing) return existing;
  const f: Fixture = { id, round: week, homeId: plan.home ? save.userClubId : plan.opponentId, awayId: plan.home ? plan.opponentId : save.userClubId };
  if (persist) {
    save.preseason.plans[week] = plan;
    save.preseason.friendlies.push(f);
  }
  return f;
}

/** Change a pre-season week's plan (only for weeks not yet played). */
export function setPlan(save: SaveGame, week: number, plan: PreseasonPlan) {
  save.preseason.plans[week] = plan;
  const f = save.preseason.friendlies.find((x) => x.id === `fr_${season(save)}_${week}`);
  if (f && !f.result) save.preseason.friendlies = save.preseason.friendlies.filter((x) => x !== f);
}

// ───────────── international breaks ─────────────

/**
 * National teams call up the best players of each nationality (top 4 per
 * nation, if good enough). They come back tired, a little prouder, and
 * occasionally injured.
 */
export function internationalBreak(save: SaveGame, rng: Rng): { calledUp: string[]; injured: string[] } {
  const byNat = new Map<string, typeof save.players[string][]>();
  for (const p of Object.values(save.players)) {
    if (!save.clubs[p.clubId] || p.injuryWeeks > 0) continue;
    byNat.set(p.nationality, [...(byNat.get(p.nationality) ?? []), p]);
  }
  const calledUp: string[] = [];
  const injured: string[] = [];
  for (const players of byNat.values()) {
    const picks = players.sort((a, b) => overall(b) - overall(a)).filter((p) => overall(p) >= 60).slice(0, 4);
    for (const p of picks) {
      calledUp.push(p.id);
      p.fitness = clamp(p.fitness - 8, 40, 100);
      p.morale = clamp(p.morale + 4, 0, 100);
      p.sharpness = clamp((p.sharpness ?? 80) + 8, 20, 100);
      if (rng.chance(0.04 * (0.5 + p.traits.injuryProneness / 20))) {
        p.injuryWeeks = rng.int(1, 3);
        p.injuryLength = p.injuryWeeks;
        injured.push(p.id);
      }
    }
  }
  save.callUps = calledUp.filter((id) => save.players[id].clubId === save.userClubId);
  return { calledUp, injured };
}
