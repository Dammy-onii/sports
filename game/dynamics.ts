import { factor } from "./development";
import { averageForm, overall } from "./ratings";
import type { Rng } from "./rng";
import type { PlayerRequest, SaveGame } from "./save";
import { STATUS_INFO, promisePlaytime, recentShare } from "./squad";
import type { Player } from "./types";

/**
 * Squad dynamics: influence and hierarchy, social groups, team cohesion,
 * settling in, training ratings, manager rapport, one-to-one conversations,
 * players' requests and team meetings. See docs/DEPTH_PLAN.md §8.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const squadOf = (save: SaveGame, clubId: string) => Object.values(save.players).filter((p) => p.clubId === clubId);
const season = (save: SaveGame) => save.leagues[0]?.season ?? 1;

// ───────────── hierarchy ─────────────

const STATUS_WEIGHT = { key: 30, regular: 20, rotation: 12, backup: 6, prospect: 3 } as const;

/** 0–100: how much a player's mood and opinions sway the dressing room. */
export function influence(save: SaveGame, p: Player, squadAvg?: number): number {
  const avg = squadAvg ?? average(squadOf(save, p.clubId).map((x) => overall(x)));
  const tenure = Math.max(0, season(save) - (p.joinedSeason ?? season(save)));
  return clamp(
    STATUS_WEIGHT[p.status] + Math.min(24, tenure * 6) + Math.min(15, Math.max(0, p.age - 22) * 1.5) + Math.min(24, p.attributes.leadership * 1.2) + clamp((overall(p) - avg) * 1.2, -12, 12),
    0,
    100,
  );
}

export type Tier = "Team leader" | "Highly influential" | "Influential" | "Other";
export function tierOf(inf: number): Tier {
  return inf >= 68 ? "Team leader" : inf >= 50 ? "Highly influential" : inf >= 34 ? "Influential" : "Other";
}

function average(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export interface Hierarchy {
  players: { player: Player; influence: number; tier: Tier }[];
  groups: SocialGroup[];
  /** The captain: the most influential player. */
  captain?: Player;
}

export interface SocialGroup {
  name: string;
  members: Player[];
  /** Influence-weighted morale of the group. */
  mood: number;
  /** The group's most influential member. */
  leader: Player;
}

/** Players cluster by nationality (3+), otherwise by age bracket. */
export function socialGroups(save: SaveGame, squad: Player[], inf: Map<string, number>): SocialGroup[] {
  const byNat = new Map<string, Player[]>();
  for (const p of squad) byNat.set(p.nationality, [...(byNat.get(p.nationality) ?? []), p]);
  const grouped = new Set<string>();
  const raw: { name: string; members: Player[] }[] = [];
  for (const [nat, members] of byNat) {
    if (members.length >= 3) {
      raw.push({ name: `${nat} group`, members });
      members.forEach((m) => grouped.add(m.id));
    }
  }
  const rest = squad.filter((p) => !grouped.has(p.id));
  const bracket = (p: Player) => (p.age <= 22 ? "Young players" : p.age <= 29 ? "Core players" : "Senior pros");
  for (const name of ["Senior pros", "Core players", "Young players"]) {
    const members = rest.filter((p) => bracket(p) === name);
    if (members.length) raw.push({ name, members });
  }
  return raw.map((g) => {
    const w = g.members.map((m) => inf.get(m.id) ?? 20);
    const total = w.reduce((a, b) => a + b, 0) || 1;
    const mood = g.members.reduce((a, m, i) => a + m.morale * w[i], 0) / total;
    const leader = [...g.members].sort((a, b) => (inf.get(b.id) ?? 0) - (inf.get(a.id) ?? 0))[0];
    return { name: g.name, members: g.members, mood, leader };
  });
}

export function hierarchy(save: SaveGame, clubId = save.userClubId): Hierarchy {
  const squad = squadOf(save, clubId);
  const avg = average(squad.map((p) => overall(p)));
  const rows = squad.map((player) => {
    const v = influence(save, player, avg);
    return { player, influence: v, tier: tierOf(v) };
  });
  rows.sort((a, b) => b.influence - a.influence);
  const inf = new Map(rows.map((r) => [r.player.id, r.influence]));
  return { players: rows, groups: socialGroups(save, squad, inf), captain: rows[0]?.player };
}

// ───────────── weekly dynamics ─────────────

export interface DynamicsWeek {
  /** Messages for the inbox. */
  notes: string[];
}

/**
 * One week of dressing-room life for the user's club: training ratings,
 * settling in, mood spreading through social groups, cohesion and rapport
 * drift. AI clubs only track cohesion.
 */
export function weeklyDynamics(save: SaveGame, rng: Rng, signingsThisWeek: Record<string, number>): DynamicsWeek {
  const out: DynamicsWeek = { notes: [] };
  // cohesion for every club: grows with a stable squad, drops with arrivals
  for (const club of Object.values(save.clubs)) {
    const before = club.cohesion ?? 60;
    const arrivals = signingsThisWeek[club.id] ?? 0;
    let c = before + 1.2 - arrivals * 5;
    if (club.isUser) {
      const xi = club.tactics.lineup;
      const overlap = xi.filter((id) => save.dynamics.lastXI.includes(id)).length;
      c += overlap >= 9 ? 0.8 : overlap <= 6 ? -0.8 : 0;
      save.dynamics.lastXI = [...xi];
    }
    club.cohesion = clamp(c, 10, 100);
  }

  const club = save.clubs[save.userClubId];
  const squad = squadOf(save, club.id);
  const h = hierarchy(save);
  const inf = new Map(h.players.map((r) => [r.player.id, r.influence]));
  for (const p of squad) {
    // training rating: attitude, mood, fitness and a little luck
    const r = clamp(6 + (p.traits.professionalism - 10) * 0.15 + (p.morale - 60) / 30 + (p.fitness - 85) / 40 + rng.normal() * 0.7, 1, 10);
    p.training = [...(p.training ?? []), Math.round(r * 10) / 10].slice(-4);
    // settling in after a move
    if ((p.settled ?? 100) < 100) {
      const sameNat = squad.filter((x) => x.nationality === p.nationality).length;
      p.settled = clamp((p.settled ?? 100) + 3 + p.traits.adaptability / 4 + (sameNat >= 3 ? 2 : 0), 0, 100);
      if (p.settled < 40) p.morale = clamp(p.morale - 1, 0, 100);
    }
    // rapport drifts back toward neutral slowly
    p.rapport = (p.rapport ?? 50) + (50 - (p.rapport ?? 50)) * 0.02;
  }
  // mood spreads: unhappy leaders drag their group down, happy leaders lift it
  for (const g of h.groups) {
    const leadInf = inf.get(g.leader.id) ?? 0;
    if (leadInf < 34) continue;
    const pull = g.leader.morale < 35 ? -(leadInf >= 60 ? 2 : 1) : g.leader.morale >= 75 ? 1 : 0;
    if (!pull) continue;
    for (const m of g.members) if (m !== g.leader) m.morale = clamp(m.morale + pull, 0, 100);
    if (pull < -1) out.notes.push(`${g.leader.firstName} ${g.leader.lastName}'s unhappiness is spreading through the ${g.name.toLowerCase()}.`);
  }
  return out;
}

/** In-match effect of cohesion: a small edge in link-up play (−0.5 … +0.5). */
export function cohesionEdge(club: { cohesion?: number }): number {
  return ((club.cohesion ?? 60) - 50) / 100;
}

// ───────────── conversations ─────────────

export type Topic = "praise_form" | "criticise_form" | "praise_training" | "criticise_training" | "playing_time" | "warn_conduct" | "reassure" | "fire_up" | "discuss_future";

export const TOPICS: Record<Topic, { label: string; blurb: string }> = {
  praise_form: { label: "Praise his form", blurb: "Tell him he's playing well." },
  criticise_form: { label: "Criticise his form", blurb: "Tell him his performances aren't good enough." },
  praise_training: { label: "Praise his training", blurb: "Recognise the work he's putting in." },
  criticise_training: { label: "Criticise his training", blurb: "Demand more effort on the training ground." },
  playing_time: { label: "Discuss playing time", blurb: "Talk about his role and minutes." },
  warn_conduct: { label: "Warn about his conduct", blurb: "Cards and dissent hurt the team." },
  reassure: { label: "Reassure him", blurb: "Lift a player who's struggling." },
  fire_up: { label: "Fire him up for the next match", blurb: "Get him ready for a big game." },
  discuss_future: { label: "Discuss his future", blurb: "Talk about his ambitions at the club." },
};

export type Reaction = "delighted" | "motivated" | "accepts" | "indifferent" | "unhappy" | "angry";
export const REACTION_INFO: Record<Reaction, { label: string; tone: "good" | "neutral" | "bad" }> = {
  delighted: { label: "Delighted", tone: "good" },
  motivated: { label: "Motivated", tone: "good" },
  accepts: { label: "Accepts", tone: "neutral" },
  indifferent: { label: "Indifferent", tone: "neutral" },
  unhappy: { label: "Unhappy", tone: "bad" },
  angry: { label: "Angry", tone: "bad" },
};

export interface TalkResult {
  reaction: Reaction;
  /** What he says back. */
  reply: string;
  morale: number;
  rapport: number;
  /** Something else happened (a promise, team-mates siding with him…). */
  extra?: string;
}

const trainingAvg = (p: Player) => (p.training?.length ? average(p.training) : 6);

/** Which topics make sense for this player right now (others are greyed out with a reason). */
export function topicAvailability(save: SaveGame, p: Player): Record<Topic, string | null> {
  const form = averageForm(p);
  return {
    praise_form: form === null ? "He hasn't played recently." : null,
    criticise_form: form === null ? "He hasn't played recently." : null,
    praise_training: null,
    criticise_training: null,
    playing_time: null,
    warn_conduct: p.season.yellows + p.season.reds * 2 < 2 ? "His discipline has been fine." : null,
    reassure: null,
    fire_up: null,
    discuss_future: null,
  };
}

/**
 * Have a word with a player. How he takes it depends on whether it's fair
 * (form, training, minutes), his personality, your rapport and how often
 * you've said it before. Mutates the save.
 */
export function talkTo(save: SaveGame, playerId: string, topic: Topic, rng: Rng): TalkResult {
  const p = save.players[playerId];
  const t = p.traits;
  const week = save.calendarIndex;
  const rap = p.rapport ?? 50;
  const trust = (rap - 50) / 50; // −1 … +1
  const recent = p.talks?.[topic] !== undefined && week - p.talks[topic]! < 3;
  const form = averageForm(p);
  const tr = trainingAvg(p);
  const resolve = factor(t.determination * 0.6 + t.professionalism * 0.4, -1, 1); // −1 … +1
  const temper = factor(t.aggression, -1, 1) - factor(t.sportsmanship, -0.5, 0.5);
  const roll = rng.range(-0.25, 0.25);
  const name = p.firstName;
  let res: TalkResult;

  const score = (base: number) => base + trust * 0.3 + roll - (recent ? 0.5 : 0);
  const pick = (v: number): Reaction => (v > 0.8 ? "delighted" : v > 0.35 ? "motivated" : v > 0 ? "accepts" : v > -0.35 ? "indifferent" : v > -0.8 ? "unhappy" : "angry");
  const effect = (r: Reaction) =>
    ({ delighted: [8, 8], motivated: [5, 4], accepts: [2, 1], indifferent: [0, -1], unhappy: [-6, -6], angry: [-12, -12] })[r] as [number, number];

  switch (topic) {
    case "praise_form": {
      const deserved = form !== null && form >= 6.9;
      const r = pick(score(deserved ? 0.7 : -0.3));
      res = { reaction: r, reply: deserved ? (r === "delighted" ? "Thanks boss, I'm feeling sharp." : "Appreciate it.") : "I know I haven't been at my best... but thanks.", morale: effect(r)[0], rapport: effect(r)[1] };
      if (r === "delighted" || r === "motivated") p.boost = { conf: 0.12, nerves: 0, frus: 0, week };
      break;
    }
    case "criticise_form": {
      const deserved = form !== null && form < 6.5;
      const base = deserved ? 0.15 + resolve * 0.6 - Math.max(0, temper) * 0.4 : -0.6 - Math.max(0, temper) * 0.4;
      const r = pick(score(base));
      res = {
        reaction: r,
        reply: !deserved ? "That's not fair. I've been doing my job." : r === "motivated" || r === "delighted" ? "You're right. I'll show you on Saturday." : r === "angry" ? "Maybe if I had better players around me..." : "Fine.",
        morale: r === "motivated" ? 2 : effect(r)[0],
        rapport: effect(r)[1],
      };
      if (r === "motivated" || r === "delighted") p.boost = { conf: 0.08, nerves: 0, frus: 0, week };
      break;
    }
    case "praise_training": {
      const deserved = tr >= 6.8;
      const r = pick(score(deserved ? 0.6 : -0.2));
      res = { reaction: r, reply: deserved ? "I've been putting the work in." : "Thanks... I'll keep at it.", morale: effect(r)[0], rapport: effect(r)[1] };
      break;
    }
    case "criticise_training": {
      const deserved = tr < 5.8;
      const base = deserved ? 0.1 + factor(t.professionalism, -0.6, 0.8) : -0.7;
      const r = pick(score(base));
      res = { reaction: r, reply: !deserved ? "I train as hard as anyone here." : r === "motivated" ? "I'll step it up." : "Whatever you say.", morale: r === "motivated" ? 1 : effect(r)[0], rapport: effect(r)[1] };
      // a professional who takes it on board really does train harder
      if (r === "motivated" || r === "delighted") p.traits.professionalism = Math.min(20, p.traits.professionalism + 0.3);
      break;
    }
    case "playing_time": {
      const share = recentShare(p);
      const expects = STATUS_INFO[p.status].expects;
      if (share >= expects - 0.05) {
        const r = pick(score(0.2));
        res = { reaction: r, reply: "I'm happy with how things are going.", morale: effect(r)[0] * 0.5, rapport: 1 };
      } else {
        // promise him minutes
        promisePlaytime(p, week);
        const r = pick(score(0.4 - factor(t.ambition, 0, 0.4)));
        res = { reaction: r, reply: r === "angry" || r === "unhappy" ? "I've heard that before." : "I'll hold you to that.", morale: effect(r)[0] + 3, rapport: effect(r)[1], extra: "You promised him more minutes over the next six weeks." };
      }
      break;
    }
    case "warn_conduct": {
      const base = 0.2 + factor(t.sportsmanship, -0.4, 0.6) - Math.max(0, temper) * 0.5;
      const r = pick(score(base));
      res = { reaction: r, reply: r === "angry" ? "The referee had it in for me." : "Understood. I'll keep my head.", morale: Math.min(0, effect(r)[0]), rapport: effect(r)[1] };
      // a warning that lands keeps him calmer next match
      if (r !== "angry" && r !== "unhappy") p.boost = { conf: 0, nerves: 0, frus: -0.25, week };
      break;
    }
    case "reassure": {
      const needs = p.morale < 55 || (form !== null && form < 6.4);
      const r = pick(score(needs ? 0.55 : -0.1));
      res = { reaction: r, reply: needs ? (r === "unhappy" || r === "angry" ? "Words won't fix this." : "Thanks, boss. That means a lot.") : "I'm fine, honestly.", morale: needs ? effect(r)[0] + 2 : 0, rapport: effect(r)[1] };
      if (needs && (r === "delighted" || r === "motivated")) p.boost = { conf: 0.15, nerves: -0.1, frus: 0, week };
      break;
    }
    case "fire_up": {
      const nervy = t.pressure < 9;
      const r = pick(score(0.35 + (nervy ? 0.1 : 0) - Math.max(0, temper) * 0.2));
      res = { reaction: r, reply: r === "angry" ? "I don't need a pep talk." : "I'm ready. Let's go.", morale: effect(r)[0] * 0.5, rapport: effect(r)[1] * 0.5 };
      if (r !== "angry") p.boost = { conf: 0.1, nerves: nervy ? -0.2 : -0.05, frus: temper > 0.3 ? 0.08 : 0, week };
      break;
    }
    case "discuss_future": {
      const ambitious = t.ambition >= 14;
      const good = overall(p) >= average(squadOf(save, p.clubId).map((x) => overall(x)));
      const r = pick(score(ambitious ? (good ? 0.1 : -0.2) : 0.4) + factor(t.loyalty, -0.2, 0.3));
      res = {
        reaction: r,
        reply: ambitious ? (r === "unhappy" || r === "angry" ? "I want to play at a higher level." : "I see my future here if we're going places.") : "I'm happy here.",
        morale: effect(r)[0] * 0.6,
        rapport: effect(r)[1],
      };
      break;
    }
  }

  p.morale = clamp(p.morale + res.morale, 0, 100);
  p.rapport = clamp(rap + res.rapport, 0, 100);
  p.talks = { ...(p.talks ?? {}), [topic]: week };
  if (recent) res.reply = `"You've already told me that." ${res.reply}`;

  // influential players' anger spreads to their friends
  if ((res.reaction === "angry" || res.reaction === "unhappy") && influence(save, p) >= 50) {
    const h = hierarchy(save);
    const group = h.groups.find((g) => g.members.includes(p));
    if (group) {
      for (const m of group.members) if (m !== p) m.morale = clamp(m.morale - (res.reaction === "angry" ? 3 : 1), 0, 100);
      res.extra = `${res.extra ? res.extra + " " : ""}His friends in the ${group.name.toLowerCase()} have taken his side.`;
    }
  }
  void name;
  return res;
}

// ───────────── team meetings ─────────────

export type MeetingTopic = "praise" | "demand" | "league" | "next";
export const MEETINGS: Record<MeetingTopic, { label: string; blurb: string }> = {
  praise: { label: "Praise the squad", blurb: "Recognise recent performances." },
  demand: { label: "Demand more", blurb: "Results aren't good enough." },
  league: { label: "Discuss the league position", blurb: "Remind them what the target is." },
  next: { label: "Focus on the next match", blurb: "Set the tone for the next game." },
};

/** Points from the user's last three results (any competition). */
function recentResults(save: SaveGame): number {
  const fixtures = [...save.leagues.flatMap((l) => l.fixtures), ...save.cup.rounds.flatMap((r) => r.fixtures)].filter(
    (f) => f.result && (f.homeId === save.userClubId || f.awayId === save.userClubId),
  );
  return fixtures.slice(-3).reduce((a, f) => {
    const home = f.homeId === save.userClubId;
    const us = home ? f.result!.homeGoals : f.result!.awayGoals;
    const them = home ? f.result!.awayGoals : f.result!.homeGoals;
    return a + (us > them ? 3 : us === them ? 1 : 0);
  }, 0);
}

export function teamMeeting(save: SaveGame, topic: MeetingTopic, rng: Rng): { reaction: Reaction; text: string } {
  const squad = squadOf(save, save.userClubId);
  const pts = recentResults(save);
  const tooSoon = save.calendarIndex - save.dynamics.lastMeeting < 4;
  const mood = average(squad.map((p) => p.morale));
  let base = 0;
  let text = "";
  switch (topic) {
    case "praise":
      base = pts >= 6 ? 0.6 : pts >= 3 ? 0.1 : -0.5;
      text = pts >= 6 ? "The players lap it up." : pts >= 3 ? "The squad listens politely." : "Some players exchange looks: praise after these results?";
      break;
    case "demand":
      base = pts <= 3 ? 0.4 : pts >= 7 ? -0.6 : -0.1;
      text = pts <= 3 ? "The message gets through: they know they've let you down." : pts >= 7 ? "The squad feels hard done by after a good run." : "A mixed response.";
      break;
    case "league":
      base = 0.2 + (mood - 60) / 100;
      text = "You remind them of the objective. The leaders nod along.";
      break;
    case "next":
      base = 0.3;
      text = "You set out what you expect in the next game.";
      break;
  }
  if (tooSoon) {
    base -= 0.6;
    text += " They've heard plenty of speeches lately; some switch off.";
  }
  const v = base + rng.range(-0.2, 0.2);
  const reaction: Reaction = v > 0.6 ? "delighted" : v > 0.25 ? "motivated" : v > 0 ? "accepts" : v > -0.3 ? "indifferent" : v > -0.6 ? "unhappy" : "angry";
  const delta = { delighted: 6, motivated: 4, accepts: 1, indifferent: 0, unhappy: -3, angry: -6 }[reaction];
  for (const p of squad) {
    // each player reacts a little differently: rapport and personality
    const own = delta * (0.7 + ((p.rapport ?? 50) / 100) * 0.6) + (topic === "demand" ? factor(p.traits.determination, -1.5, 1.5) : 0);
    p.morale = clamp(p.morale + own, 0, 100);
    if (topic === "next" && delta > 0) p.boost = { conf: 0.05, nerves: -0.05, frus: 0, week: save.calendarIndex };
  }
  save.dynamics.lastMeeting = save.calendarIndex;
  save.dynamics.meetings++;
  return { reaction, text };
}

// ───────────── players come to you ─────────────

const reqId = (save: SaveGame, p: Player, kind: string) => `rq_${kind}_${p.id}_${save.calendarIndex}`;

/** New requests this week (at most two, and never a duplicate). */
export function generateRequests(save: SaveGame, rng: Rng): PlayerRequest[] {
  const out: PlayerRequest[] = [];
  const squad = squadOf(save, save.userClubId);
  const has = (p: Player, kind: string) => save.requests.some((r) => r.playerId === p.id && r.kind === kind);
  const add = (r: PlayerRequest) => {
    if (out.length < 2) out.push(r);
  };
  for (const p of squad) {
    if (p.unhappyWeeks >= 2 && !p.promise && !has(p, "playtime") && rng.chance(0.5)) {
      add({ id: reqId(save, p, "playtime"), playerId: p.id, kind: "playtime", week: save.calendarIndex, text: `${p.firstName} ${p.lastName} wants to talk about his lack of games.`, options: [
        { key: "promise", label: "Promise him more minutes" },
        { key: "explain", label: "Explain his role in the squad" },
        { key: "fight", label: "Tell him to fight for his place" },
      ] });
    }
    const contractLeft = p.contract.expires - (save.leagues[0]?.season ?? 1);
    if (contractLeft <= 0 && (p.status === "key" || p.status === "regular") && p.traits.ambition >= 11 && !has(p, "contract") && !p.loan && rng.chance(0.25)) {
      add({ id: reqId(save, p, "contract"), playerId: p.id, kind: "contract", week: save.calendarIndex, text: `${p.firstName} ${p.lastName} wants to know where he stands: his contract runs out this summer.`, options: [
        { key: "open", label: "Open contract talks" },
        { key: "later", label: "Promise talks at the end of the season" },
        { key: "no", label: "Tell him there's no new deal" },
      ] });
    }
    if (save.offers.some((o) => o.playerId === p.id) && p.traits.ambition >= 13 && !has(p, "bid") && rng.chance(0.6)) {
      add({ id: reqId(save, p, "bid"), playerId: p.id, kind: "bid", week: save.calendarIndex, text: `${p.firstName} ${p.lastName} has heard about the bid and is unsettled.`, options: [
        { key: "notforsale", label: "He's not for sale" },
        { key: "consider", label: "We'll consider offers" },
        { key: "go", label: "He can go if the price is right" },
      ] });
    }
    if ((p.settled ?? 100) < 40 && !has(p, "settling") && (p.joinedSeason ?? 0) === (save.leagues[0]?.season ?? 1) && rng.chance(0.3)) {
      add({ id: reqId(save, p, "settling"), playerId: p.id, kind: "settling", week: save.calendarIndex, text: `${p.firstName} ${p.lastName} is struggling to settle in.`, options: [
        { key: "buddy", label: "Ask a senior player to look after him" },
        { key: "reassure", label: "Reassure him it takes time" },
        { key: "adapt", label: "Tell him he needs to adapt" },
      ] });
    }
  }
  return out;
}

/** Answer a player's request. Returns what happened. */
export function answerRequest(save: SaveGame, requestId: string, option: string): { text: string; reaction: Reaction } {
  const req = save.requests.find((r) => r.id === requestId);
  if (!req) return { text: "", reaction: "indifferent" };
  save.requests = save.requests.filter((r) => r.id !== requestId);
  const p = save.players[req.playerId];
  if (!p) return { text: "", reaction: "indifferent" };
  const t = p.traits;
  const set = (morale: number, rapport: number, reaction: Reaction, text: string) => {
    p.morale = clamp(p.morale + morale, 0, 100);
    p.rapport = clamp((p.rapport ?? 50) + rapport, 0, 100);
    return { text, reaction };
  };
  switch (`${req.kind}:${option}`) {
    case "playtime:promise":
      promisePlaytime(p, save.calendarIndex);
      return set(6, 4, "accepts", `${p.lastName} accepts your promise. Keep it.`);
    case "playtime:explain":
      return t.ambition >= 14 ? set(-4, -3, "unhappy", `${p.lastName} isn't satisfied with your explanation.`) : set(2, 1, "accepts", `${p.lastName} understands his role.`);
    case "playtime:fight":
      return t.determination >= 13 ? set(3, 0, "motivated", `${p.lastName} is determined to prove you wrong.`) : set(-6, -5, "angry", `${p.lastName} storms out.`);
    case "contract:open":
      return set(5, 4, "delighted", `${p.lastName} is pleased. Open his contract from his profile.`);
    case "contract:later":
      return t.loyalty >= 12 ? set(1, 1, "accepts", `${p.lastName} will wait.`) : set(-4, -3, "unhappy", `${p.lastName} wanted an answer now.`);
    case "contract:no":
      p.transferRequest = t.loyalty < 12;
      return set(-10, -8, "angry", `${p.lastName} is furious${p.transferRequest ? " and has handed in a transfer request" : ""}.`);
    case "bid:notforsale":
      return t.loyalty >= 11 ? set(4, 3, "motivated", `${p.lastName} is happy to stay and fight for the club.`) : set(-7, -5, "unhappy", `${p.lastName} feels he's being held back.`);
    case "bid:consider":
      return set(0, 0, "accepts", `${p.lastName} will wait to see what happens.`);
    case "bid:go":
      return set(4, -2, "accepts", `${p.lastName} appreciates your honesty.`);
    case "settling:buddy": {
      p.settled = clamp((p.settled ?? 50) + 15, 0, 100);
      return set(5, 3, "motivated", `A senior player takes ${p.lastName} under his wing.`);
    }
    case "settling:reassure":
      p.settled = clamp((p.settled ?? 50) + 6, 0, 100);
      return set(3, 2, "accepts", `${p.lastName} feels a little better.`);
    case "settling:adapt":
      return t.adaptability >= 12 ? set(1, -1, "accepts", `${p.lastName} gets on with it.`) : set(-6, -4, "unhappy", `${p.lastName} feels isolated.`);
  }
  return { text: "", reaction: "indifferent" };
}
