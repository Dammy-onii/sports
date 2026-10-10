import type { Rng } from "./rng";
import type { Fixture, League } from "./types";

/** Circle-method round robin. With `double`, the second half mirrors home/away. */
export function roundRobin(clubIds: string[], rng: Rng, double = true): Fixture[] {
  const ids = [...clubIds];
  if (ids.length % 2) ids.push("BYE");
  const n = ids.length;
  const rounds = n - 1;
  const fixtures: Fixture[] = [];
  let arr = [...ids];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "BYE" || b === "BYE") continue;
      // alternate home advantage so nobody gets a long home/away streak
      const flip = (r + i) % 2 === 0;
      fixtures.push({
        id: `f_${r}_${i}_${rng.fork().toString(36)}`,
        round: r,
        homeId: flip ? a : b,
        awayId: flip ? b : a,
      });
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (double) {
    const firstHalf = [...fixtures];
    for (const f of firstHalf) {
      fixtures.push({
        id: `f_${f.round + rounds}_${rng.fork().toString(36)}`,
        round: f.round + rounds,
        homeId: f.awayId,
        awayId: f.homeId,
      });
    }
  }
  return fixtures;
}

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: ("W" | "D" | "L")[];
}

export function leagueTable(league: League): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const id of league.clubIds) {
    rows.set(id, { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] });
  }
  const played = league.fixtures.filter((f) => f.result).sort((a, b) => a.round - b.round);
  for (const f of played) {
    const h = rows.get(f.homeId)!;
    const a = rows.get(f.awayId)!;
    const { homeGoals: hg, awayGoals: ag } = f.result!;
    h.played++;
    a.played++;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    if (hg > ag) {
      h.won++;
      a.lost++;
      h.points += 3;
      h.form.push("W");
      a.form.push("L");
    } else if (hg < ag) {
      a.won++;
      h.lost++;
      a.points += 3;
      a.form.push("W");
      h.form.push("L");
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
      h.form.push("D");
      a.form.push("D");
    }
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.gd = r.gf - r.ga;
    r.form = r.form.slice(-5);
  }
  return list.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.clubId.localeCompare(y.clubId));
}

export function totalRounds(league: League): number {
  return league.fixtures.reduce((m, f) => Math.max(m, f.round + 1), 0);
}

export function fixturesForRound(league: League, round: number): Fixture[] {
  return league.fixtures.filter((f) => f.round === round);
}
