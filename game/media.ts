import { factor } from "./development";
import type { MatchState } from "./engine/types";
import { averageForm, overall } from "./ratings";
import type { Rng } from "./rng";
import type { Award, PressConference, PressQuestion, PressTone, SaveGame } from "./save";
import { pushNews } from "./news";
import type { Fixture, League, Player } from "./types";

/**
 * Media (docs/DEPTH_PLAN.md §12): press conferences before and after
 * matches, the supporters' mood, mind games, news narratives and awards.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const squadOf = (save: SaveGame, clubId: string) => Object.values(save.players).filter((p) => p.clubId === clubId);
const nm = (p: Player) => `${p.firstName} ${p.lastName}`;


/** The user's results in all competitions, oldest first, as W/D/L. */
function userResults(save: SaveGame): ("W" | "D" | "L")[] {
  const all: Fixture[] = [...save.leagues.flatMap((l) => l.fixtures), ...save.cup.rounds.flatMap((r) => r.fixtures), ...(save.superCup ? [save.superCup] : [])];
  return all
    .filter((f) => f.result && (f.homeId === save.userClubId || f.awayId === save.userClubId))
    .sort((a, b) => a.round - b.round)
    .map((f) => {
      const home = f.homeId === save.userClubId;
      const us = home ? f.result!.homeGoals : f.result!.awayGoals;
      const them = home ? f.result!.awayGoals : f.result!.homeGoals;
      return us > them ? "W" : us < them ? "L" : "D";
    });
}

function streak(results: ("W" | "D" | "L")[]): { kind: "W" | "D" | "L" | "unbeaten" | null; n: number } {
  if (!results.length) return { kind: null, n: 0 };
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  let unbeaten = 0;
  for (let i = results.length - 1; i >= 0 && results[i] !== "L"; i--) unbeaten++;
  if (unbeaten >= 5 && last !== "W") return { kind: "unbeaten", n: unbeaten };
  return { kind: last, n };
}

// ───────────── press conferences ─────────────

/** Questions before a match: form, the opponent, a player, a rumour. */
export function preMatchPress(save: SaveGame, f: Fixture, occasion: string | null): PressConference {
  const oppId = f.homeId === save.userClubId ? f.awayId : f.homeId;
  const opp = save.clubs[oppId];
  const squad = squadOf(save, save.userClubId);
  const st = streak(userResults(save));
  const qs: PressQuestion[] = [];

  if (occasion) {
    qs.push({ topic: "occasion", text: `How are you approaching ${occasion}?`, options: [
      { tone: "confident", label: "We're the better side and we'll show it." },
      { tone: "cautious", label: "They deserve respect. We'll focus on ourselves." },
      { tone: "fiery", label: "My players will run through walls for this one." },
    ] });
  } else if (st.kind === "L" && st.n >= 2) {
    qs.push({ topic: "form", text: `${st.n} defeats in a row. Is the pressure getting to you?`, options: [
      { tone: "confident", label: "Not at all. We'll turn this around on Saturday." },
      { tone: "cautious", label: "We know we need to improve. We're working on it." },
      { tone: "critical", label: "Some of my players need to take a hard look at themselves." },
    ] });
  } else if (st.kind === "W" && st.n >= 3) {
    qs.push({ topic: "form", text: `${st.n} wins on the bounce. Can anyone stop you?`, options: [
      { tone: "confident", label: "On this form, nobody." },
      { tone: "cautious", label: "We take it one game at a time." },
      { tone: "praise", label: "The players deserve all the credit." },
    ] });
  } else {
    qs.push({ topic: "form", text: "How is the squad feeling going into this one?", options: [
      { tone: "confident", label: "Confident. We're ready." },
      { tone: "cautious", label: "Focused. It'll be a tough game." },
      { tone: "fiery", label: "Hungry. We owe our fans a performance." },
    ] });
  }

  if (opp?.manager) {
    qs.push({ topic: "opponent", text: `${opp.manager.name} says ${opp.name} fear nobody. Your response?`, options: [
      { tone: "praise", label: `${opp.manager.name} has done a fine job there.` },
      { tone: "deflect", label: "I only worry about my own team." },
      { tone: "mindgames", label: "Talk is cheap. Let's see how they cope on the day." },
    ] });
  }

  const star = [...squad].filter((p) => p.season.apps >= 2).sort((a, b) => (averageForm(b) ?? 0) - (averageForm(a) ?? 0))[0];
  const struggling = [...squad].filter((p) => p.season.apps >= 3 && (averageForm(p) ?? 7) < 6.3).sort((a, b) => overall(b) - overall(a))[0];
  if (struggling && (!star || struggling.id !== star.id) && qs.length < 3) {
    qs.push({ topic: "player", playerId: struggling.id, text: `${nm(struggling)} has struggled lately. Is his place under threat?`, options: [
      { tone: "praise", label: "He has my full backing." },
      { tone: "deflect", label: "Nobody's place is guaranteed." },
      { tone: "critical", label: "He knows he has to do better." },
    ] });
  } else if (star && qs.length < 3) {
    qs.push({ topic: "player", playerId: star.id, text: `${nm(star)} is in great form. How good can he be?`, options: [
      { tone: "praise", label: "As good as he wants to be. He's special." },
      { tone: "cautious", label: "He's doing well. Let's not get carried away." },
      { tone: "deflect", label: "It's a team game." },
    ] });
  }

  const wanted = squad.find((p) => save.offers.some((o) => o.playerId === p.id));
  if (wanted && qs.length < 3) {
    qs.push({ topic: "rumour", playerId: wanted.id, text: `There's interest in ${nm(wanted)}. Is he for sale?`, options: [
      { tone: "confident", label: "He's going nowhere." },
      { tone: "deflect", label: "I don't comment on speculation." },
      { tone: "cautious", label: "Every player has a price." },
    ] });
  }
  return { kind: "pre", fixtureId: f.id, questions: qs.slice(0, 3), answered: 0, outcomes: [] };
}

/** Questions after a match: the result, a player, the referee. */
export function postMatchPress(save: SaveGame, f: Fixture, s: MatchState): PressConference {
  const side = f.homeId === save.userClubId ? 0 : 1;
  const us = s.score[side];
  const them = s.score[1 - side];
  const qs: PressQuestion[] = [];
  const result = us > them ? "win" : us < them ? "defeat" : "draw";
  qs.push({
    topic: "result",
    text: result === "win" ? `A ${us}–${them} win. What pleased you most?` : result === "defeat" ? `A ${us}–${them} defeat. What went wrong?` : `A ${us}–${them} draw. Fair result?`,
    options:
      result === "defeat"
        ? [
            { tone: "critical", label: "We weren't good enough. I expect much more." },
            { tone: "cautious", label: "Credit to them. We'll learn from it." },
            { tone: "praise", label: "I can't fault the effort." },
          ]
        : [
            { tone: "praise", label: "The players were outstanding." },
            { tone: "cautious", label: "There's still plenty to work on." },
            { tone: "confident", label: "That's the standard I expect from us." },
          ],
  });
  const ours = s.players.filter((p) => p.side === side && p.used);
  const best = [...ours].sort((a, b) => b.st.goals * 2 + b.st.assists - (a.st.goals * 2 + a.st.assists) || b.st.keyPasses - a.st.keyPasses)[0];
  if (best && save.players[best.id]) {
    qs.push({ topic: "player", playerId: best.id, text: `What did you make of ${best.name}'s performance?`, options: [
      { tone: "praise", label: "Superb. He was the difference." },
      { tone: "cautious", label: "Good, but he can do more." },
      { tone: "deflect", label: "I don't single players out." },
    ] });
  }
  const red = s.events.find((e) => e.type === "red" && e.side === side);
  if (red) {
    qs.push({ topic: "referee", text: "Your view on the red card?", options: [
      { tone: "fiery", label: "A shocking decision. The referee cost us." },
      { tone: "cautious", label: "I'll need to see it again." },
      { tone: "critical", label: "My player let the team down." },
    ] });
  }
  return { kind: "post", fixtureId: f.id, questions: qs.slice(0, 3), answered: 0, outcomes: [] };
}

/**
 * Answer the current question. Effects: named players' morale and trust,
 * the squad, the board, the supporters and (mind games) the next opponent.
 */
export function answerPress(save: SaveGame, tone: PressTone, rng?: Rng): string {
  const pc = save.press;
  if (!pc) return "";
  const q = pc.questions[pc.answered];
  if (!q) return "";
  const squad = squadOf(save, save.userClubId);
  const p = q.playerId ? save.players[q.playerId] : undefined;
  const fans = (d: number) => (save.fans = clamp((save.fans ?? 60) + d, 0, 100));
  let out = "";
  const all = (d: number, filter: (x: Player) => boolean = () => true) => squad.filter(filter).forEach((x) => (x.morale = clamp(x.morale + d, 0, 100)));

  switch (q.topic) {
    case "form":
    case "occasion":
    case "result":
      if (tone === "confident") {
        all(3);
        fans(2);
        out = "Your confidence rubs off on the squad and the fans.";
      } else if (tone === "cautious") {
        save.board.confidence = clamp(save.board.confidence + 1, 0, 100);
        out = "A measured answer. The board approves.";
      } else if (tone === "fiery") {
        all(5, (x) => x.traits.aggression >= 13);
        all(1, (x) => x.traits.aggression < 13);
        fans(3);
        out = "The combative players love it; the fans too.";
      } else if (tone === "praise") {
        all(3);
        out = "The players appreciate the public praise.";
      } else if (tone === "critical") {
        for (const x of squad) x.morale = clamp(x.morale + factor(x.traits.determination, -5, 3), 0, 100);
        fans(1);
        out = "A public dressing-down: the determined respond, others sulk.";
      }
      break;
    case "player":
      if (!p) break;
      if (tone === "praise") {
        p.morale = clamp(p.morale + 5, 0, 100);
        p.rapport = clamp((p.rapport ?? 50) + 4, 0, 100);
        out = `${p.lastName} is delighted with your public backing.`;
      } else if (tone === "critical") {
        const takes = p.traits.determination >= 13 && p.traits.aggression < 14;
        p.morale = clamp(p.morale + (takes ? 1 : -7), 0, 100);
        p.rapport = clamp((p.rapport ?? 50) + (takes ? -1 : -7), 0, 100);
        out = takes ? `${p.lastName} takes the public criticism on the chin.` : `${p.lastName} is upset at being criticised in public.`;
      } else if (tone === "cautious") {
        out = `${p.lastName} shrugs it off.`;
      } else out = "You keep the focus on the team.";
      break;
    case "opponent":
      if (tone === "mindgames") {
        const fixture = save.press?.fixtureId;
        const oppId = fixture ? [...save.leagues.flatMap((l) => l.fixtures), ...save.cup.rounds.flatMap((r) => r.fixtures)].find((f) => f.id === fixture) : undefined;
        const opp = oppId ? save.clubs[oppId.homeId === save.userClubId ? oppId.awayId : oppId.homeId] : undefined;
        // experienced managers see through it; it can fire them up instead
        const landed = !opp?.manager || (rng ? rng.next() : 0.5) > 0.3 + (opp.manager.knowledge / 20) * 0.5;
        save.mindGames = fixture ? { fixtureId: fixture, landed } : null;
        fans(2);
        out = landed ? "The barb lands: their players will feel the pressure." : "Their manager laughs it off and uses it to fire his players up.";
      } else if (tone === "praise") out = "A gracious answer.";
      else out = "You keep your counsel.";
      break;
    case "rumour":
      if (!p) break;
      if (tone === "confident") {
        const loyal = p.traits.loyalty >= 11 || p.traits.ambition < 13;
        p.morale = clamp(p.morale + (loyal ? 4 : -2), 0, 100);
        out = loyal ? `${p.lastName} is pleased you want to keep him.` : `${p.lastName} feels he's being held back.`;
      } else if (tone === "cautious") {
        p.morale = clamp(p.morale - 4, 0, 100);
        p.rapport = clamp((p.rapport ?? 50) - 4, 0, 100);
        fans(-2);
        out = `${p.lastName} and the fans don't like hearing that.`;
      } else out = "You give nothing away.";
      break;
    case "referee":
      if (tone === "fiery") {
        save.clubs[save.userClubId].balance -= 10_000;
        save.ledger.unshift({ season: save.leagues[0].season, week: save.calendarIndex + 1, label: "FA fine: comments about the referee", amount: -10_000 });
        fans(3);
        out = "The fans love it, but the FA fines you £10k.";
      } else if (tone === "critical") {
        out = "The player concerned won't be happy you said it publicly.";
      } else out = "A diplomatic answer.";
      break;
  }
  pc.outcomes.push(out);
  pc.answered++;
  if (pc.answered >= pc.questions.length) {
    save.press = save.pressNext ?? null;
    save.pressNext = null;
  }
  return out;
}

/** Your assistant handles the media with safe, neutral answers. */
export function delegatePress(save: SaveGame) {
  while (save.press) {
    const q = save.press.questions[save.press.answered];
    const tone = q.options.find((o) => o.tone === "cautious" || o.tone === "deflect")?.tone ?? q.options[0].tone;
    answerPress(save, tone);
  }
}

// ───────────── supporters ─────────────

/** Fans react to results (derbies count double). */
export function fansAfterResult(save: SaveGame, won: boolean, drew: boolean, derby: boolean) {
  const d = (won ? 2 : drew ? 0 : -3) * (derby ? 2 : 1);
  save.fans = clamp((save.fans ?? 60) + d, 0, 100);
}

export function fansLabel(v: number) {
  return v >= 80 ? "Ecstatic" : v >= 65 ? "Happy" : v >= 45 ? "Content" : v >= 30 ? "Restless" : "Angry";
}

// ───────────── news narratives ─────────────

/** Headlines from a match: hat-tricks, big wins, streaks, milestones. */
export function matchNews(save: SaveGame, f: Fixture, s: MatchState, label: string) {
  const home = save.clubs[f.homeId];
  const away = save.clubs[f.awayId];
  const user = f.homeId === save.userClubId || f.awayId === save.userClubId;
  for (const p of s.players) {
    if (p.st.goals >= 3) pushNews(save, "result", `Hat-trick! ${p.name} scores ${p.st.goals} for ${s.teams[p.side].name} (${label}).`);
  }
  const margin = Math.abs(s.score[0] - s.score[1]);
  if (margin >= 4) {
    const winner = s.score[0] > s.score[1] ? home : away;
    const loser = winner === home ? away : home;
    pushNews(save, "result", `${winner.name} thrash ${loser.name} ${Math.max(...s.score)}–${Math.min(...s.score)}.`);
  }
  if (!user) return;
  const st = streak(userResults(save));
  const club = save.clubs[save.userClubId];
  if (st.kind === "W" && (st.n === 3 || st.n === 5 || st.n === 8)) pushNews(save, "result", `${club.name} make it ${st.n} wins in a row.`);
  if (st.kind === "L" && (st.n === 3 || st.n === 5)) pushNews(save, "result", `Pressure mounts: ${club.name} have lost ${st.n} straight.`);
  if (st.kind === "unbeaten" && st.n % 5 === 0) pushNews(save, "result", `${club.name} are unbeaten in ${st.n}.`);
  // milestones for the user's players
  for (const mp of s.players) {
    const p = save.players[mp.id];
    if (!p || p.clubId !== save.userClubId || !mp.used) continue;
    const career = (p.history ?? []).reduce((a, h) => a + h.apps, 0) + p.season.apps;
    if (career === 100 || career === 200) pushNews(save, "result", `${nm(p)} makes his ${career}th career appearance.`);
    const careerGoals = (p.history ?? []).reduce((a, h) => a + h.goals, 0) + p.season.goals;
    if (mp.st.goals > 0 && careerGoals === mp.st.goals) pushNews(save, "result", `${nm(p)} scores the first goal of his career.`);
    if (mp.st.goals > 0 && (p.season.goals === 10 || p.season.goals === 20)) pushNews(save, "result", `${nm(p)} reaches ${p.season.goals} goals for the season.`);
  }
}

/** The occasional transfer rumour about one of the user's best players. */
export function transferRumours(save: SaveGame, rng: Rng) {
  if (!rng.chance(0.12)) return;
  const squad = squadOf(save, save.userClubId).filter((p) => !p.loan);
  const target = [...squad].sort((a, b) => overall(b) + (b.age <= 23 ? 4 : 0) - (overall(a) + (a.age <= 23 ? 4 : 0)))[0];
  if (!target) return;
  const suitors = Object.values(save.clubs).filter((c) => !c.isUser && c.reputation > save.clubs[save.userClubId].reputation + 5);
  if (!suitors.length) return;
  const suitor = rng.pick(suitors);
  pushNews(save, "transfer", `Rumour: ${suitor.name} are monitoring ${nm(target)}.`);
  if (target.traits.ambition >= 14 && target.traits.loyalty < 12) target.morale = clamp(target.morale - 3, 0, 100);
}

// ───────────── awards ─────────────

function bestBy<T>(xs: T[], score: (x: T) => number): T | undefined {
  return xs.reduce<T | undefined>((best, x) => (best === undefined || score(x) > score(best) ? x : best), undefined);
}

/** Player and Manager of the Month for each division (every four league weeks). */
export function monthlyAwards(save: SaveGame, month: number): Award[] {
  const season = save.leagues[0].season;
  const out: Award[] = [];
  for (const league of save.leagues) {
    const players = Object.values(save.players).filter((p) => league.clubIds.includes(p.clubId) && p.form.length >= 3);
    const potm = bestBy(players, (p) => (averageForm(p) ?? 0) + p.season.goals * 0.02);
    if (potm) out.push({ season, name: "Player of the Month", month, leagueId: league.id, playerId: potm.id, playerName: nm(potm), clubId: potm.clubId, detail: `${(averageForm(potm) ?? 0).toFixed(2)} average rating` });
    const pts = monthPoints(league);
    const best = bestBy([...pts.entries()], ([, v]) => v);
    if (best) out.push({ season, name: "Manager of the Month", month, leagueId: league.id, clubId: best[0], detail: `${best[1]} points from the last four` });
  }
  return out;
}

function monthPoints(league: League): Map<string, number> {
  const done = league.fixtures.filter((f) => f.result).map((f) => f.round);
  const last = Math.max(-1, ...done);
  const pts = new Map<string, number>();
  for (const f of league.fixtures) {
    if (!f.result || f.round <= last - 4) continue;
    const h = f.result.homeGoals;
    const a = f.result.awayGoals;
    pts.set(f.homeId, (pts.get(f.homeId) ?? 0) + (h > a ? 3 : h === a ? 1 : 0));
    pts.set(f.awayId, (pts.get(f.awayId) ?? 0) + (a > h ? 3 : h === a ? 1 : 0));
  }
  return pts;
}

/** End-of-season awards per division, and the team of the season. */
export function seasonAwards(save: SaveGame): Award[] {
  const season = save.leagues[0].season;
  const out: Award[] = [];
  for (const league of save.leagues) {
    const players = Object.values(save.players).filter((p) => league.clubIds.includes(p.clubId));
    const avg = (p: Player) => (p.season.apps ? p.season.ratingSum / p.season.apps : 0);
    const regulars = players.filter((p) => p.season.apps >= Math.max(5, Math.round(league.currentRound * 0.6)));
    const add = (name: string, p: Player | undefined, detail: (p: Player) => string) => {
      if (p) out.push({ season, name, leagueId: league.id, playerId: p.id, playerName: nm(p), clubId: p.clubId, detail: detail(p) });
    };
    add("Player of the Season", bestBy(regulars, avg), (p) => `${avg(p).toFixed(2)} average rating`);
    add("Young Player of the Season", bestBy(regulars.filter((p) => p.age <= 21), avg), (p) => `${avg(p).toFixed(2)} average rating, age ${p.age}`);
    add("Golden Boot", bestBy(players, (p) => p.season.goals + p.season.assists * 0.01), (p) => `${p.season.goals} goals`);
    add("Golden Glove", bestBy(players.filter((p) => p.positions[0] === "GK"), (p) => p.season.cleanSheets), (p) => `${p.season.cleanSheets} clean sheets`);
    // team of the season: best average rating by line (1-4-3-3)
    const line = (pos: string[], n: number) => regulars.filter((p) => pos.includes(p.positions[0])).sort((a, b) => avg(b) - avg(a)).slice(0, n);
    for (const p of [...line(["GK"], 1), ...line(["CB", "LB", "RB"], 4), ...line(["DM", "CM", "AM", "LM", "RM"], 3), ...line(["LW", "RW", "ST"], 3)]) {
      out.push({ season, name: "Team of the Season", leagueId: league.id, playerId: p.id, playerName: nm(p), clubId: p.clubId, detail: `${p.positions[0]} · ${avg(p).toFixed(2)}` });
    }
  }
  return out;
}

/** Store awards, tell the world, and credit winners. */
export function presentAwards(save: SaveGame, awards: Award[]) {
  save.awards = [...(save.awards ?? []), ...awards].slice(-400);
  for (const a of awards) {
    const league = save.leagues.find((l) => l.id === a.leagueId);
    if (a.name === "Team of the Season") continue;
    if (a.playerId) {
      const p = save.players[a.playerId];
      if (p) {
        p.morale = clamp(p.morale + 6, 0, 100);
        p.awards = [...(p.awards ?? []), `${a.name} ${a.season}`];
      }
      pushNews(save, "table", `${a.name}${league ? ` (${league.name})` : ""}: ${a.playerName}, ${save.clubs[a.clubId]?.name} — ${a.detail}.`);
    } else {
      const club = save.clubs[a.clubId];
      const who = club?.isUser ? save.manager.name : club?.manager?.name ?? "their manager";
      pushNews(save, "table", `${a.name}${league ? ` (${league.name})` : ""}: ${who} of ${club?.name} — ${a.detail}.`);
      if (club?.isUser) save.manager.awards = [...(save.manager.awards ?? []), `${a.name}, season ${a.season} month ${a.month}`];
    }
  }
  const tots = awards.filter((a) => a.name === "Team of the Season" && a.clubId === save.userClubId);
  if (tots.length) pushNews(save, "table", `${tots.map((a) => a.playerName).join(", ")} make the Team of the Season.`);
}
