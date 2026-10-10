import type { MatchState } from "./engine/types";
import { makeId } from "./generate";
import type { Rng } from "./rng";
import type { CalendarSlot, Cup, CupRound } from "./save";
import type { Club, Fixture } from "./types";

/** League weeks after which a cup round is played (midweek). */
const CUP_AFTER_ROUND = [2, 6, 10, 14, 18];

/** League weeks after which there's an international break. */
const INTL_AFTER_ROUND = [7, 15];
export const PRESEASON_WEEKS = 4;

export function buildCalendar(leagueRounds: number, cupRounds: number, superCup: boolean, opts: { preseason?: number; intl?: boolean } = {}): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  for (let w = 0; w < (opts.preseason ?? 0); w++) slots.push({ kind: "preseason", week: w });
  if (superCup) slots.push({ kind: "super" });
  let cupIdx = 0;
  let intl = 0;
  for (let r = 0; r < leagueRounds; r++) {
    slots.push({ kind: "league", round: r });
    if (cupIdx < cupRounds && r === CUP_AFTER_ROUND[cupIdx]) slots.push({ kind: "cup", round: cupIdx++ });
    if (opts.intl && r === INTL_AFTER_ROUND[intl] && r < leagueRounds - 1) slots.push({ kind: "intl", n: intl++ });
  }
  // any remaining cup rounds go at the end
  while (cupIdx < cupRounds) slots.push({ kind: "cup", round: cupIdx++ });
  return slots;
}

function roundName(remaining: number): string {
  if (remaining === 2) return "Final";
  if (remaining === 4) return "Semi-finals";
  if (remaining === 8) return "Quarter-finals";
  return `Round of ${remaining}`;
}

export function cupRoundCount(entrants: number): number {
  let p = 1;
  while (p < entrants) p *= 2;
  return Math.round(Math.log2(p));
}

/**
 * A straight knockout for every club in the pyramid. The strongest clubs get
 * byes so the first round evens the numbers to a power of two.
 */
export function createCup(clubs: Club[], season: number, name: string, rng: Rng): Cup {
  let size = 1;
  while (size < clubs.length) size *= 2;
  const byes = size - clubs.length;
  const seeded = [...clubs].sort((a, b) => b.reputation - a.reputation);
  const byeClubs = seeded.slice(0, byes).map((c) => c.id);
  const playing = rng.shuffle(seeded.slice(byes).map((c) => c.id));
  const first: Fixture[] = [];
  for (let i = 0; i + 1 < playing.length; i += 2) {
    first.push({ id: makeId(`cup${season}_0`, rng), round: 0, homeId: playing[i], awayId: playing[i + 1] });
  }
  const totalRounds = Math.round(Math.log2(size));
  return {
    id: makeId("cup", rng),
    name,
    season,
    rounds: [{ name: roundName(size), fixtures: first }],
    alive: [...byeClubs, ...playing],
    byes: byeClubs,
    winnerId: totalRounds === 0 ? clubs[0]?.id : undefined,
  };
}

/** Winner of a played knockout tie (penalties decide a draw). */
export function tieWinner(f: Fixture): string | undefined {
  const r = f.result;
  if (!r) return undefined;
  if (r.homeGoals !== r.awayGoals) return r.homeGoals > r.awayGoals ? f.homeId : f.awayId;
  if (r.penalties) return r.penalties[0] > r.penalties[1] ? f.homeId : f.awayId;
  return undefined;
}

/** After a round, draw the next one from the winners (plus first-round byes). */
export function advanceCup(cup: Cup, rng: Rng): void {
  const current = cup.rounds[cup.rounds.length - 1];
  const winners = current.fixtures.map(tieWinner).filter(Boolean) as string[];
  const byes = cup.rounds.length === 1 ? cup.byes : [];
  const through = [...byes, ...winners];
  cup.alive = through;
  if (through.length <= 1) {
    cup.winnerId = through[0];
    return;
  }
  const drawn = rng.shuffle([...through]);
  const fixtures: Fixture[] = [];
  const round = cup.rounds.length;
  for (let i = 0; i + 1 < drawn.length; i += 2) {
    fixtures.push({ id: makeId(`cup${cup.season}_${round}`, rng), round, homeId: drawn[i], awayId: drawn[i + 1] });
  }
  cup.rounds.push({ name: roundName(through.length), fixtures } as CupRound);
}

/**
 * Penalty shootout after a drawn tie: best five takers each, then sudden
 * death. Each kick's chance comes from the taker's finishing and composure
 * against the goalkeeper.
 */
export function shootout(s: MatchState, rng: Rng): [number, number] {
  const takers = ([0, 1] as const).map((side) =>
    s.players
      .filter((p) => p.side === side && p.onPitch)
      .sort((a, b) => b.attrs.finishing + b.attrs.composure - (a.attrs.finishing + a.attrs.composure)),
  );
  const keeper = ([0, 1] as const).map((side) => s.players.find((p) => p.side === side && p.onPitch && p.pos === "GK"));
  const kick = (side: 0 | 1, n: number) => {
    const list = takers[side];
    const t = list[n % Math.max(1, list.length)];
    const gk = keeper[side === 0 ? 1 : 0];
    const skill = t ? (t.attrs.finishing + t.attrs.composure) / 2 : 10;
    const p = Math.max(0.5, Math.min(0.92, 0.76 + (skill - 12) * 0.015 - ((gk?.attrs.goalkeeping ?? 10) - 12) * 0.012));
    return rng.chance(p) ? 1 : 0;
  };
  const score: [number, number] = [0, 0];
  for (let i = 0; i < 5; i++) {
    score[0] += kick(0, i);
    score[1] += kick(1, i);
  }
  let n = 5;
  while (score[0] === score[1] && n < 40) {
    score[0] += kick(0, n);
    score[1] += kick(1, n);
    n++;
  }
  if (score[0] === score[1]) score[rng.chance(0.5) ? 0 : 1]++;
  return score;
}
