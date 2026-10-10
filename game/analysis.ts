import { MAX_SUBS, playerRating } from "./engine";
import { HEAT_COLS, HEAT_ROWS, type MatchState, type MPlayer, type Side } from "./engine/types";
import { ROLES } from "./roles";
import type { ShoutId, TeamInstructions } from "./types";

export type NoteKind =
  | "fatigue"
  | "discipline"
  | "matchup"
  | "struggling"
  | "chances"
  | "possession"
  | "pressing"
  | "praise"
  | "scoreline"
  | "subs"
  | "shape"
  | "shooting"
  | "opponent"
  | "injury";

/** Something the user can do with one tap. */
export type NoteAction =
  | { type: "shout"; shout: ShoutId; label: string }
  | { type: "instruction"; key: keyof TeamInstructions; delta: number; label: string };

export interface AssistantNote {
  /** Stable identity, so the feed knows when something is new or resolved. */
  key: string;
  kind: NoteKind;
  /** Higher = more urgent; the UI shows the top few. */
  priority: number;
  text: string;
  /** What the assistant would do about it (better assistants suggest more). */
  advice?: string;
  playerId?: string;
  action?: NoteAction;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);

/**
 * What the assistant manager has noticed, from the user's point of view.
 * `quality` (1–20, the assistant's rating) controls how much he picks up and
 * whether he offers advice. Returned most urgent first.
 */
export function assistantNotes(s: MatchState, side: Side, quality = 12): AssistantNote[] {
  const notes: AssistantNote[] = [];
  const minute = Math.floor(s.tick / 60);
  if (minute < 8) return notes;
  const us = s.teams[side];
  const them = s.teams[other(side)];
  const ours = us.playerIdx.map((i) => s.players[i]).filter((p) => p.onPitch);
  const theirs = them.playerIdx.map((i) => s.players[i]).filter((p) => p.onPitch);
  const advise = quality >= 8;
  const sharp = quality >= 12;
  const diff = s.score[side] - s.score[other(side)];
  const ins = us.instructions;
  const subsLeft = MAX_SUBS - us.subsUsed;

  // Fatigue: one note listing everyone who's flagging
  const tired = ours.filter((p) => p.pos !== "GK" && p.energy < 0.6).sort((a, b) => a.energy - b.energy);
  if (tired.length) {
    const names = tired.slice(0, 3).map((p) => `${p.shortName} (${Math.round(p.energy * 100)}%)`).join(", ");
    notes.push({
      key: `fatigue:${tired.map((p) => p.id).join(",")}`,
      kind: "fatigue",
      priority: 70 + (0.6 - tired[0].energy) * 100 + tired.length * 2,
      text: tired.length === 1 ? `${names} is running on empty.` : `Tiring legs: ${names}${tired.length > 3 ? ` and ${tired.length - 3} more` : ""}.`,
      advice: advise ? (subsLeft > 0 ? "Fresh legs would help; tired players lose pace, tackles and concentration." : "No subs left: lower the pressing to save energy.") : undefined,
      playerId: tired[0].id,
      action: subsLeft === 0 && ins.pressing > 1 ? { type: "instruction", key: "pressing", delta: -1, label: "Press less" } : undefined,
    });
  }

  // Playing on with a knock
  for (const p of ours) {
    if (p.injured) notes.push({ key: `injury:${p.id}`, kind: "injury", priority: 95, text: `${p.shortName} is carrying a knock.`, advice: "Take him off before it gets worse.", playerId: p.id });
  }

  // Discipline: booked players who might see red
  for (const p of ours) {
    if (p.yellow > 0 && !p.sentOff && (p.traits.aggression >= 12 || p.fx.tackle === 1)) {
      notes.push({
        key: `discipline:${p.id}`,
        kind: "discipline",
        priority: 72 + p.traits.aggression,
        text: `${p.shortName} is on a yellow${p.traits.aggression >= 12 ? " and has a short fuse" : " and has been told to tackle hard"}.`,
        advice: advise ? "Take him off, or calm things down." : undefined,
        playerId: p.id,
        action: us.shout !== "calm" ? { type: "shout", shout: "calm", label: "Shout 'Calm down'" } : undefined,
      });
    }
  }

  // Matchups: an opponent who keeps beating us
  const threatOf = (p: (typeof theirs)[number]) => p.st.dribbles + p.st.keyPasses * 2 + p.st.shots;
  const danger = [...theirs].sort((a, b) => threatOf(b) - threatOf(a))[0];
  if (danger && threatOf(danger) >= 4 && quality >= 6) {
    const ap = avgPos(s, danger);
    const mirror = { x: 1 - ap.x, y: 1 - ap.y };
    const marker = ours
      .filter((p) => p.pos !== "GK")
      .map((p) => ({ p, d: Math.hypot(avgPos(s, p).x - mirror.x, avgPos(s, p).y - mirror.y) }))
      .sort((a, b) => a.d - b.d)[0]?.p;
    const alreadyMarked = !!us.opposition[danger.id]?.markTight;
    notes.push({
      key: `matchup:${danger.id}:${alreadyMarked ? "m" : ""}`,
      kind: "matchup",
      priority: 68 + danger.st.dribbles * 3,
      text: `Their ${danger.pos} ${danger.shortName} is causing problems (${danger.st.dribbles} dribbles, ${danger.st.keyPasses} key passes)${marker ? `, mostly against ${marker.shortName}` : ""}.`,
      advice: advise
        ? alreadyMarked
          ? "He's still getting free despite tight marking: go in harder on him or drop the line."
          : `Mark ${danger.shortName} tightly (opposition instructions)${marker && (marker.pos === "LB" || marker.pos === "RB") ? `, or make ${marker.shortName} a defensive full-back` : ""}.`
        : undefined,
      playerId: marker?.id,
      action: !alreadyMarked && us.shout !== "focus" ? { type: "shout", shout: "focus", label: "Shout 'Concentrate'" } : undefined,
    });
  }

  // Our weakest link
  if (minute >= 25) {
    const worst = ours
      .filter((p) => p.ticksPlayed > 900)
      .map((p) => ({ p, r: playerRating(s, p) }))
      .sort((a, b) => a.r - b.r)[0];
    if (worst && worst.r < 6) {
      const unsure = worst.p.roleFam < 0.5;
      notes.push({
        key: `struggling:${worst.p.id}`,
        kind: "struggling",
        priority: 55 + (6 - worst.r) * 20,
        text: `${worst.p.shortName} is having a tough game (${worst.r.toFixed(1)}).`,
        advice: advise ? (unsure ? `He doesn't know the ${ROLES[worst.p.role].label} role (${Math.round(worst.p.roleFam * 100)}%): try a role he knows.` : `A change of role or a substitution.`) : undefined,
        playerId: worst.p.id,
      });
    }
  }

  // Players who don't know their role (sharp assistants spot it early)
  if (sharp && minute >= 10) {
    const lost = ours.filter((p) => p.pos !== "GK" && p.roleFam < 0.35);
    if (lost.length) {
      notes.push({
        key: `role:${lost.map((p) => p.id).join(",")}`,
        kind: "shape",
        priority: 42,
        text: `${lost.map((p) => p.shortName).join(", ")} ${lost.length > 1 ? "look" : "looks"} unsure in ${lost.length > 1 ? "their roles" : "his role"}.`,
        advice: "A familiar role would get more out of them.",
        playerId: lost[0].id,
      });
    }
  }

  // The whole shape is loose (an unfamiliar system)
  if (us.fam < 0.55 && minute >= 12) {
    notes.push({
      key: `fam:${us.formation}`,
      kind: "shape",
      priority: 52,
      text: `We look unsure of the ${us.formation} (${Math.round(us.fam * 100)}% familiar): gaps between the lines.`,
      advice: advise ? "Switch to a system the squad knows, or keep it simple: a deeper line and less pressing." : undefined,
    });
  }

  // Chance quality
  const xgFor = us.stats.xg;
  const xgAgainst = them.stats.xg;
  if (minute >= 20 && xgAgainst - xgFor > 0.7) {
    notes.push({
      key: "chances:against",
      kind: "chances",
      priority: 65 + (xgAgainst - xgFor) * 10,
      text: `They're creating the better chances (xG ${xgAgainst.toFixed(2)} vs ${xgFor.toFixed(2)}).`,
      advice: advise ? "Drop the defensive line or lower the mentality to close the space." : undefined,
      action: ins.defensiveLine > 1 ? { type: "instruction", key: "defensiveLine", delta: -1, label: "Drop the line" } : undefined,
    });
  }
  if (minute >= 30 && xgFor - xgAgainst > 1 && diff <= 0 && quality >= 8) {
    notes.push({
      key: "chances:wasteful",
      kind: "chances",
      priority: 40,
      text: `We're the better side on chances (xG ${xgFor.toFixed(2)} vs ${xgAgainst.toFixed(2)}) but it isn't going in.`,
      advice: "Stay patient: keep doing what we're doing.",
    });
  }

  // Shot selection: lots of hopeful efforts from distance
  const ourShots = s.events.filter((e) => e.side === side && e.xg !== undefined);
  const longShots = ourShots.filter((e) => (e.xg ?? 0) < 0.05).length;
  if (minute >= 25 && ourShots.length >= 6 && longShots / ourShots.length > 0.6 && quality >= 9) {
    notes.push({
      key: "shooting:long",
      kind: "shooting",
      priority: 44,
      text: `Too many hopeful shots: ${longShots} of our ${ourShots.length} were poor chances.`,
      advice: "Work it into the box: tell shooters to shoot less, or play shorter.",
    });
  }

  // Sterile possession
  const poss = us.stats.possessionTicks / Math.max(1, us.stats.possessionTicks + them.stats.possessionTicks);
  if (minute >= 30 && poss > 0.58 && us.stats.shots <= 3) {
    notes.push({
      key: "possession:sterile",
      kind: "possession",
      priority: 50,
      text: `Plenty of the ball (${Math.round(poss * 100)}%) but little threat (${us.stats.shots} shots).`,
      advice: advise ? "A quicker tempo or more direct passing." : undefined,
      action: ins.tempo < 5 ? { type: "instruction", key: "tempo", delta: 1, label: "Raise tempo" } : undefined,
    });
  }

  // Passing: they play through us / we keep giving it away
  const theirAcc = them.stats.passes ? them.stats.passesCompleted / them.stats.passes : 0;
  const ourAcc = us.stats.passes ? us.stats.passesCompleted / us.stats.passes : 1;
  if (minute >= 20 && theirAcc > 0.86 && quality >= 10) {
    notes.push({
      key: "pressing:through",
      kind: "pressing",
      priority: 45,
      text: `They're passing through us too easily (${Math.round(theirAcc * 100)}% accuracy).`,
      advice: "Press higher.",
      action: ins.pressing < 5 ? { type: "instruction", key: "pressing", delta: 1, label: "Press more" } : undefined,
    });
  }
  if (minute >= 20 && ourAcc < 0.72) {
    const pressed = them.instructions.pressing >= 4;
    notes.push({
      key: "pressing:sloppy",
      kind: "pressing",
      priority: 48,
      text: `We keep giving the ball away (${Math.round(ourAcc * 100)}% passing)${pressed && sharp ? " under their press" : ""}.`,
      advice: advise ? (pressed ? "Go more direct to play over the press." : "Lower the tempo and keep it simple.") : undefined,
      action: pressed ? { type: "instruction", key: "directness", delta: 1, label: "More direct" } : ins.tempo > 1 ? { type: "instruction", key: "tempo", delta: -1, label: "Lower tempo" } : undefined,
    });
  }

  // What the opposition has changed (sharp assistants notice)
  if (sharp) {
    const last = [...s.events].reverse().find((e) => (e.type === "tactics" || e.type === "shout") && e.side !== side && s.tick - e.tick < 600);
    if (last) {
      const m = them.instructions.mentality;
      notes.push({
        key: `opponent:${last.tick}`,
        kind: "opponent",
        priority: 58,
        text: m >= 4 ? "They've gone more attacking." : m <= 2 ? "They're sitting back to protect what they have." : "They've changed something tactically.",
        advice: m >= 4 ? "Space will open up behind them: raise the tempo and hit them on the break." : m <= 2 ? "Be patient and use the width." : undefined,
      });
    }
  }

  // Managing the scoreline late on
  if (minute >= 70) {
    if (diff > 0 && ins.mentality >= 3 && us.shout !== "focus") {
      notes.push({
        key: `scoreline:protect:${diff}`,
        kind: "scoreline",
        priority: 60 + minute / 10,
        text: `We're ${diff} up with ${Math.max(1, 90 - minute)} minutes left.`,
        advice: advise ? "See it out: a more cautious mentality and 'Concentrate'." : undefined,
        action: { type: "shout", shout: "focus", label: "Shout 'Concentrate'" },
      });
    } else if (diff < 0 && ins.mentality <= 3) {
      notes.push({
        key: `scoreline:chase:${diff}`,
        kind: "scoreline",
        priority: 62 + minute / 10,
        text: `We need ${-diff === 1 ? "a goal" : `${-diff} goals`} and time is running out.`,
        advice: advise ? "Go for it: more attacking, and get bodies forward." : undefined,
        action: { type: "instruction", key: "mentality", delta: 1, label: "More attacking" },
      });
    } else if (diff === 0 && minute >= 75 && subsLeft >= 2 && quality >= 8) {
      notes.push({ key: "scoreline:level", kind: "scoreline", priority: 35, text: "Level going into the last 15.", advice: "Fresh attackers could win it." });
    }
  }

  // Unused substitutes
  if (minute >= 65 && subsLeft >= 3) {
    notes.push({ key: `subs:${subsLeft}`, kind: "subs", priority: 38 + (minute - 65), text: `${subsLeft} substitutions still unused.`, advice: advise ? "Fresh legs now could make the difference." : undefined });
  }

  // Emotions: who's losing it, who's rattled, who's flying
  const hothead = ours.filter((p) => p.emo.frus > 0.62).sort((a, b) => b.emo.frus - a.emo.frus)[0];
  if (hothead && quality >= 7) {
    const booked = hothead.yellow > 0;
    notes.push({
      key: `emo:frus:${hothead.id}`,
      kind: "discipline",
      priority: (booked ? 85 : 66) + hothead.emo.frus * 10,
      text: `${hothead.shortName} is losing his cool${booked ? " and he's already on a yellow" : ""}.`,
      advice: advise ? (booked ? "Get him off before he sees red, or calm everyone down." : "Calm him down before he does something rash.") : undefined,
      playerId: hothead.id,
      action: us.shout !== "calm" ? { type: "shout", shout: "calm", label: "Shout 'Calm down'" } : undefined,
    });
  }
  const nervy = ours.filter((p) => p.emo.nerves > 0.5);
  if (nervy.length && quality >= 9) {
    notes.push({
      key: `emo:nerves:${nervy.map((p) => p.id).join(",")}`,
      kind: "struggling",
      priority: 50 + nervy.length * 3,
      text: `${nervy.slice(0, 3).map((p) => p.shortName).join(", ")} ${nervy.length > 1 ? "look" : "looks"} nervous out there.`,
      advice: "A word of encouragement, or keep it simple: a calmer tempo.",
      playerId: nervy[0].id,
      action: us.shout !== "encourage" ? { type: "shout", shout: "encourage", label: "Shout 'Encourage'" } : undefined,
    });
  }
  const low = ours.filter((p) => p.emo.conf < -0.4)[0];
  if (low && quality >= 8) {
    notes.push({ key: `emo:low:${low.id}`, kind: "struggling", priority: 46, text: `${low.shortName}'s confidence has gone.`, advice: "Encourage him, or give him a simpler role.", playerId: low.id });
  }

  // Credit where due
  const star = ours.map((p) => ({ p, r: playerRating(s, p) })).sort((a, b) => b.r - a.r)[0];
  if (star && star.r >= 7.8) {
    notes.push({ key: `praise:${star.p.id}`, kind: "praise", priority: 20, text: `${star.p.shortName} is having a superb game (${star.r.toFixed(1)}).`, playerId: star.p.id });
  }

  // Poorer assistants notice less and suggest no quick fixes
  const limit = quality >= 15 ? 6 : quality >= 10 ? 5 : quality >= 6 ? 4 : 2;
  return notes
    .map((n) => (advise ? n : { ...n, action: undefined }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export function avgPos(s: MatchState, p: MPlayer): { x: number; y: number } {
  const [sx, sy, n] = s.analytics.pos[p.idx] ?? [0, 0, 0];
  return n ? { x: sx / n, y: sy / n } : { x: 0.5, y: 0.5 };
}

// ───────────── post-match report ─────────────

export interface ReportPlayer {
  id: string;
  name: string;
  shirt: number;
  pos: string;
  side: Side;
  rating: number;
  minutes: number;
  goals: number;
  assists: number;
  /** Team-relative average position (0–1, attacking right). */
  ax: number;
  ay: number;
  /** Normalised heatmap (0–1 per cell), only stored for the user's team. */
  heat?: number[];
}

export interface MatchReport {
  id: string;
  fixtureId: string;
  competition: string;
  season: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  score: [number, number];
  /** Shootout score when a knockout tie was level. */
  penalties?: [number, number];
  /** Team stats [home, away]. */
  stats: [Record<string, number>, Record<string, number>];
  /** Cumulative xG per minute [home, away]. */
  xg: [number[], number[]];
  /** Per minute, home minus away threat (positive = home on top). */
  momentum: number[];
  players: ReportPlayer[];
  /** Pass links within the user's team: [fromId, toId, count]. */
  links: [string, string, number][];
  playerOfMatch: string;
  events: { minute: number; type: string; side: Side; player?: string; other?: string }[];
}

export function buildReport(
  s: MatchState,
  meta: { id: string; fixtureId: string; competition: string; season: number; userSide: Side | null },
): MatchReport {
  const mins = Math.max(90, ...s.events.map((e) => e.minute));
  const xg: [number[], number[]] = [new Array(mins + 1).fill(0), new Array(mins + 1).fill(0)];
  for (const e of s.events) if (e.xg !== undefined) xg[e.side][e.minute] += e.xg;
  for (const side of [0, 1] as const) for (let m = 1; m <= mins; m++) xg[side][m] += xg[side][m - 1];

  const players: ReportPlayer[] = s.players
    .filter((p) => p.used)
    .map((p) => {
      const heat = s.analytics.heat[p.idx];
      const max = Math.max(1, ...heat);
      const pos = avgPos(s, p);
      return {
        id: p.id,
        name: p.shortName,
        shirt: p.shirt,
        pos: p.pos,
        side: p.side,
        rating: playerRating(s, p),
        minutes: Math.round(p.ticksPlayed / 60),
        goals: p.st.goals,
        assists: p.st.assists,
        ax: pos.x,
        ay: pos.y,
        heat: meta.userSide === null || p.side === meta.userSide ? heat.map((v) => Math.round((v / max) * 100) / 100) : undefined,
      };
    });
  const pom = [...players].sort((a, b) => b.rating - a.rating)[0];
  const links: [string, string, number][] = Object.entries(s.analytics.links)
    .map(([k, n]) => {
      const [a, b] = k.split("-").map(Number);
      return [s.players[a], s.players[b], n] as const;
    })
    .filter(([a, b]) => meta.userSide === null || (a.side === meta.userSide && b.side === meta.userSide))
    .map(([a, b, n]) => [a.id, b.id, n]);

  const stat = (side: Side) => {
    const t = s.teams[side].stats;
    const total = s.teams[0].stats.possessionTicks + s.teams[1].stats.possessionTicks;
    return {
      possession: Math.round((t.possessionTicks / Math.max(1, total)) * 100),
      shots: t.shots,
      onTarget: t.shotsOnTarget,
      xg: Math.round(t.xg * 100) / 100,
      passes: t.passes,
      passAccuracy: t.passes ? Math.round((t.passesCompleted / t.passes) * 100) : 0,
      tackles: t.tackles,
      corners: t.corners,
      fouls: t.fouls,
      offsides: t.offsides,
      yellows: t.yellows,
      reds: t.reds,
      saves: t.saves,
    };
  };

  return {
    id: meta.id,
    fixtureId: meta.fixtureId,
    competition: meta.competition,
    season: meta.season,
    homeId: s.teams[0].clubId,
    awayId: s.teams[1].clubId,
    homeName: s.teams[0].name,
    awayName: s.teams[1].name,
    score: [s.score[0], s.score[1]],
    stats: [stat(0), stat(1)],
    xg,
    momentum: [...s.analytics.momentum].map((v) => Math.round((v ?? 0) * 100) / 100),
    players,
    links,
    playerOfMatch: pom?.id ?? "",
    events: s.events
      .filter((e) => ["goal", "yellow", "red", "sub", "injury", "penalty"].includes(e.type))
      .map((e) => ({ minute: e.minute, type: e.type, side: e.side, player: e.player, other: e.other })),
  };
}

export { HEAT_COLS, HEAT_ROWS };
