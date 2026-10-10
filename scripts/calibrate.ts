// Run: npx tsx scripts/calibrate.ts [matches]
// Plays N AI-vs-AI matches across several generated worlds with random pairings
// and compares averages with real-world football.
import { createMatch, isFinished, playerRating, stepMatch } from "../game/engine";
import { generateWorld } from "../game/generate";
import { overall } from "../game/ratings";
import { Rng } from "../game/rng";
import { matchSetupFor } from "../game/setup";
import type { Club, Player } from "../game/types";

const N = Number(process.argv[2] ?? 200);
const worlds = [11, 42, 77, 2026].map((seed) =>
  generateWorld(seed, { name: "Test FC", shortName: "TST", colors: { primary: "#fff", secondary: "#000" }, formation: "4-3-3" }, { divisions: 2 }),
);
const strength = (c: Club, players: Record<string, Player>) =>
  c.tactics.lineup.reduce((a, id) => a + overall(players[id]), 0) / c.tactics.lineup.length;

const agg = {
  goals: 0, shots: 0, sot: 0, xg: 0, passes: 0, completed: 0, fouls: 0, corners: 0, yellows: 0, reds: 0,
  tackles: 0, dribbles: 0, interceptions: 0, changes: 0, offsides: 0, homeWins: 0, draws: 0, ratings: 0, ratingN: 0, ms: 0,
};
const scorelines: Record<string, number> = {};
// per-player behaviour bucketed by the characteristic that should drive it
type Bucket = { minutes: number; count: number };
const traitStats: Record<string, [Bucket, Bucket, Bucket]> = {};
const tercile = (v: number) => (v <= 7 ? 0 : v <= 13 ? 1 : 2);
function track(name: string, value: number, minutes: number, count: number) {
  traitStats[name] ??= [{ minutes: 0, count: 0 }, { minutes: 0, count: 0 }, { minutes: 0, count: 0 }];
  const b = traitStats[name][tercile(value)];
  b.minutes += minutes;
  b.count += count;
}
let injuries = 0;
let outfieldKm = 0;
let outfieldMins = 0;
let carryM = 0;
const buckets: Record<string, { fav: number; draw: number; dog: number }> = {};
const rng = new Rng(9);

for (let i = 0; i < N; i++) {
  const world = worlds[i % worlds.length];
  const clubs = Object.values(world.clubs);
  const h = clubs[rng.int(0, clubs.length - 1)];
  let a = clubs[rng.int(0, clubs.length - 1)];
  while (a === h) a = clubs[rng.int(0, clubs.length - 1)];
  const t0 = performance.now();
  const s = createMatch(matchSetupFor(h, a, world.players, { homeAI: true, awayAI: true }), 1000 + i);
  let poss = s.possession;
  while (!isFinished(s)) {
    stepMatch(s);
    if (s.possession !== poss) {
      agg.changes++;
      poss = s.possession;
    }
  }
  agg.ms += performance.now() - t0;
  const [hs, as] = s.teams.map((t) => t.stats);
  agg.goals += s.score[0] + s.score[1];
  agg.shots += hs.shots + as.shots;
  agg.sot += hs.shotsOnTarget + as.shotsOnTarget;
  agg.xg += hs.xg + as.xg;
  agg.passes += hs.passes + as.passes;
  agg.completed += hs.passesCompleted + as.passesCompleted;
  agg.fouls += hs.fouls + as.fouls;
  agg.corners += hs.corners + as.corners;
  agg.yellows += hs.yellows + as.yellows;
  agg.reds += hs.reds + as.reds;
  agg.tackles += hs.tackles + as.tackles;
  agg.offsides += (hs.offsides ?? 0) + (as.offsides ?? 0);
  const injured = new Map<string, number>();
  for (const e of s.events) if (e.type === "injury" && e.player) injured.set(e.player, (injured.get(e.player) ?? 0) + 1);
  injuries += [...injured.values()].reduce((a, b) => a + b, 0);
  for (const p of s.players) {
    const mins = p.ticksPlayed / 60;
    if (mins > 0 && p.pos !== "GK") {
      outfieldKm += p.st.distance / 1000;
      outfieldMins += mins;
      carryM += p.st.carryDistance;
    }
    if (mins > 0) {
      const defender = ["CB", "LB", "RB", "DM"].includes(p.pos);
      track("fouls/90 by aggression", p.traits.aggression, mins, p.st.fouls);
      track("cards/90 by aggression", p.traits.aggression, mins, p.yellow + (p.sentOff ? 1 : 0));
      track("injuries/90 by proneness", p.traits.injuryProneness, mins, injured.get(p.id) ?? 0);
      // per opportunity, so team quality (how much a side defends) doesn't skew it
      if (defender) track("foul% per tackle by tackling (defs)", p.attrs.tackling, p.st.tackles, p.st.fouls);
      if (defender) track("intercept% per chance by positioning", p.attrs.positioning, p.st.interceptChances, p.st.interceptReads);
      if (["ST", "LW", "RW", "AM"].includes(p.pos)) track("offsides/90 by decisions (fwds)", p.attrs.decisions, mins, p.st.offsides);
      if (["ST", "LW", "RW", "AM"].includes(p.pos)) track("goals/90 by finishing (fwds)", p.attrs.finishing, mins, p.st.goals);
      if (p.pos === "GK") track("saves% by goalkeeping", p.attrs.goalkeeping, p.st.saves + p.st.conceded, p.st.saves);
    }
    agg.dribbles += p.st.dribbles;
    agg.interceptions += p.st.interceptions;
    if (p.used) {
      agg.ratings += playerRating(s, p);
      agg.ratingN++;
    }
  }
  if (s.score[0] > s.score[1]) agg.homeWins++;
  if (s.score[0] === s.score[1]) agg.draws++;
  const key = `${Math.max(...s.score)}-${Math.min(...s.score)}`;
  scorelines[key] = (scorelines[key] ?? 0) + 1;

  const diff = strength(h, world.players) - strength(a, world.players);
  const fav = diff >= 0 ? 0 : 1;
  const ad = Math.abs(diff);
  const b = ad < 2 ? "0-2" : ad < 4 ? "2-4" : ad < 6 ? "4-6" : "6+";
  buckets[b] ??= { fav: 0, draw: 0, dog: 0 };
  if (s.score[0] === s.score[1]) buckets[b].draw++;
  else if ((s.score[0] > s.score[1] ? 0 : 1) === fav) buckets[b].fav++;
  else buckets[b].dog++;
}

const per = (v: number) => (v / N).toFixed(2);
console.log(`matches: ${N}  avg sim time: ${(agg.ms / N).toFixed(1)}ms`);
console.log(`goals ${per(agg.goals)} (real ~2.7) | shots ${per(agg.shots)} (~25) | on target ${per(agg.sot)} (~8.5) | xG ${per(agg.xg)}`);
console.log(`passes ${per(agg.passes)} (~900) | pass% ${((agg.completed / agg.passes) * 100).toFixed(1)} (80–85) | possession changes ${per(agg.changes)} (200–280)`);
console.log(`tackles won ${per(agg.tackles)} (~35) | dribbles ${per(agg.dribbles)} (~20) | interceptions ${per(agg.interceptions)} (~20) | offsides ${per(agg.offsides)} (~4)`);
console.log(`fouls ${per(agg.fouls)} (~22) | corners ${per(agg.corners)} (~10) | yellows ${per(agg.yellows)} (~3.5) | reds ${per(agg.reds)} (~0.15)`);
console.log(`home win ${((agg.homeWins / N) * 100).toFixed(0)}% (~45%) | draws ${((agg.draws / N) * 100).toFixed(0)}% (~25%) | avg rating ${(agg.ratings / agg.ratingN).toFixed(2)} (~6.7)`);
for (const k of ["0-2", "2-4", "4-6", "6+"]) {
  const v = buckets[k];
  if (!v) continue;
  const n = v.fav + v.draw + v.dog;
  console.log(`  OVR gap ${k.padEnd(4)} n=${String(n).padStart(3)}  favourite ${((v.fav / n) * 100).toFixed(0)}%  draw ${((v.draw / n) * 100).toFixed(0)}%  underdog ${((v.dog / n) * 100).toFixed(0)}%`);
}
console.log(`injuries ${(injuries / N).toFixed(2)} (~0.5) | km per outfield player per 90 ${((outfieldKm / outfieldMins) * 90).toFixed(1)} (~10.5) | ball carried ${(carryM / N / 1000).toFixed(2)} km/match (~4–5)`);
console.log("\nBehaviour by characteristic (low ≤7 | mid 8–13 | high ≥14):");
for (const [name, b] of Object.entries(traitStats)) {
  const fmt = (x: Bucket) => (!x.minutes ? "–" : name.includes("%") ? ((x.count / Math.max(1, x.minutes)) * 100).toFixed(0) + "%" : ((x.count / Math.max(1, x.minutes)) * 90).toFixed(3));
  console.log(`  ${name.padEnd(34)} ${b.map(fmt).map((v) => v.padStart(7)).join("  ")}`);
}
console.log("scorelines:", Object.entries(scorelines).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(" "));
