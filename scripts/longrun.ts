// Run: npx tsx scripts/longrun.ts [seasons] [seed]
// Plays whole careers (AI-managed user club) and prints the numbers that
// drift over time: money, match ratings, development and squad sizes.
import { acceptJob, completeRound, isSeasonOver, leagueOfClub, newCareer, squadOf, startNextSeason } from "../game/career";
import { currentAbility, overall } from "../game/ratings";
import type { SaveGame } from "../game/save";

const SEASONS = Number(process.argv[2] ?? 5);
const SEED = Number(process.argv[3] ?? 7);
const colors = { primary: "#fff", secondary: "#000" };
let save: SaveGame = newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors, formation: "4-3-3", seed: SEED, startTier: 2 } as never);

const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const money = (v: number) => `${(v / 1e6).toFixed(1)}m`;

function snapshot(label: string) {
  const players = Object.values(save.players).filter((p) => save.clubs[p.clubId]);
  const byTier: Record<number, number[]> = {};
  for (const c of Object.values(save.clubs)) (byTier[leagueOfClub(save, c.id).tier] ??= []).push(c.balance);
  const ratings = players.filter((p) => p.season.apps >= 5).map((p) => p.season.ratingSum / p.season.apps);
  const ovr = (lo: number, hi: number) => {
    const g = players.filter((p) => p.age >= lo && p.age <= hi);
    return g.length ? (g.reduce((a, p) => a + overall(p), 0) / g.length).toFixed(1) : "-";
  };
  const top11 = Object.values(save.clubs).map((c) => {
    const sq = squadOf(save, c.id).map((p) => overall(p)).sort((a, b) => b - a).slice(0, 11);
    return sq.reduce((a, b) => a + b, 0) / Math.max(1, sq.length);
  });
  const realised = players.filter((p) => p.age >= 26).map((p) => currentAbility(p) / p.potential);
  const sizes = Object.values(save.clubs).map((c) => squadOf(save, c.id).length);
  console.log(`\n== ${label} ==`);
  for (const [t, b] of Object.entries(byTier)) console.log(`tier ${t} balance  min ${money(Math.min(...b))}  median ${money(pct(b, 0.5))}  max ${money(Math.max(...b))}`);
  console.log(`user balance ${money(save.clubs[save.userClubId].balance)}  tier ${leagueOfClub(save, save.userClubId).tier}`);
  if (ratings.length) console.log(`season avg rating  p10 ${pct(ratings, 0.1).toFixed(2)}  median ${pct(ratings, 0.5).toFixed(2)}  p90 ${pct(ratings, 0.9).toFixed(2)}  max ${Math.max(...ratings).toFixed(2)}  >=8: ${ratings.filter((r) => r >= 8).length}/${ratings.length}`);
  console.log(`OVR by age  ≤19 ${ovr(15, 19)}  20-23 ${ovr(20, 23)}  24-28 ${ovr(24, 28)}  29-32 ${ovr(29, 32)}  33+ ${ovr(33, 45)}`);
  console.log(`club top-11 OVR  min ${Math.min(...top11).toFixed(1)}  median ${pct(top11, 0.5).toFixed(1)}  max ${Math.max(...top11).toFixed(1)}   best player ${Math.max(...players.map((p) => overall(p)))}`);
  console.log(`potential realised (26+)  median ${(pct(realised, 0.5) * 100).toFixed(0)}%  p90 ${(pct(realised, 0.9) * 100).toFixed(0)}%   players ${players.length}  squad sizes ${Math.min(...sizes)}–${Math.max(...sizes)}`);
}

let prev = new Map<string, { age: number; ovr: number }>();
let prevBal = new Map<string, number>();
function deltas() {
  const buckets: [string, number, number][] = [["16-18", 16, 18], ["19-21", 19, 21], ["22-23", 22, 23], ["24-26", 24, 26], ["27-29", 27, 29], ["30-31", 30, 31], ["32-33", 32, 33], ["34+", 34, 45]];
  const out: string[] = [];
  for (const [label, lo, hi] of buckets) {
    const ds: number[] = [];
    for (const p of Object.values(save.players)) {
      const q = prev.get(p.id);
      if (q && q.age >= lo && q.age <= hi) ds.push(overall(p) - q.ovr);
    }
    if (ds.length) out.push(`${label} ${(ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1)}`);
  }
  if (out.length) console.log(`OVR change by age (same players): ${out.join("  ")}`);
  const net: Record<number, number[]> = {};
  for (const c of Object.values(save.clubs)) {
    const b = prevBal.get(c.id);
    if (b !== undefined) (net[leagueOfClub(save, c.id).tier] ??= []).push(c.balance - b);
  }
  for (const [t, xs] of Object.entries(net)) console.log(`tier ${t} season net  min ${money(Math.min(...xs))}  median ${money(pct(xs, 0.5))}  max ${money(Math.max(...xs))}`);
  prev = new Map(Object.values(save.players).map((p) => [p.id, { age: p.age, ovr: overall(p) }]));
  prevBal = new Map(Object.values(save.clubs).map((c) => [c.id, c.balance]));
}

snapshot("start");
deltas();
for (let s = 1; s <= SEASONS; s++) {
  let guard = 0;
  while (!isSeasonOver(save) && guard++ < 80) {
    save = completeRound(save);
    if (save.jobOffers?.length) save = acceptJob(save, save.jobOffers[0]);
  }
  snapshot(`end of season ${s}`);
  deltas();
  if (s < SEASONS) save = startNextSeason(save);
}
