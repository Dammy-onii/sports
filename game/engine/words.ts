import type { AttributeKey } from "../types";
import type { MPlayer } from "./types";

/**
 * A word with one player from the touchline. How he takes it depends on his
 * attributes, personality, how he's feeling and how he's playing, so the same
 * line fires up one player and winds up another.
 */
export type WordId = "praise" | "encourage" | "demand" | "calm" | "focus" | "stuckIn" | "careful" | "express";

export interface WordInfo {
  label: string;
  /** What you shout to him. */
  line: string;
  /** What it's for, in plain words. */
  blurb: string;
  /** Which of his qualities decide how he takes it. */
  decidedBy: string;
}

export const WORDS: Record<WordId, WordInfo> = {
  praise: { label: "Praise", line: "Great stuff, keep it up!", blurb: "Builds confidence. Rings hollow if he's playing badly; a player low on professionalism may switch off.", decidedBy: "His rating, confidence and professionalism" },
  encourage: { label: "Lift him", line: "Head up, you're fine. Next one.", blurb: "For a player whose confidence has gone or who looks nervous.", decidedBy: "His confidence, nerves and determination" },
  demand: { label: "Demand more", line: "I need more from you!", blurb: "More work rate and bite. Determined players respond; hot-heads and fragile players can react badly.", decidedBy: "His determination, temperament and confidence" },
  calm: { label: "Calm down", line: "Calm down, keep your head.", blurb: "Takes the heat out of a frustrated or wound-up player.", decidedBy: "His composure, temperament and frustration" },
  focus: { label: "Concentrate", line: "Switch on, stay with your man.", blurb: "Sharper concentration, positioning and marking for a while.", decidedBy: "His concentration and professionalism" },
  stuckIn: { label: "Win your battles", line: "Get stuck in, win your duels!", blurb: "More tackling, strength and bravery. A hot-head may go too far and give fouls away.", decidedBy: "His bravery, strength and temperament" },
  careful: { label: "Careful, you're booked", line: "You're on a yellow, stay on your feet.", blurb: "Fewer rash challenges from a booked player.", decidedBy: "His decisions and temperament" },
  express: { label: "Express yourself", line: "Go on, take them on. Enjoy it.", blurb: "Freedom to dribble and try things. Brilliant for flair players, confusing for others.", decidedBy: "His flair, technique and confidence" },
};

export const WORD_IDS = Object.keys(WORDS) as WordId[];

export type WordOutcome = "fired" | "good" | "unmoved" | "bad";

export const OUTCOME_LABEL: Record<WordOutcome, string> = {
  fired: "Fired up",
  good: "Responds well",
  unmoved: "Unmoved",
  bad: "Reacts badly",
};

/** Game seconds a word keeps working, and before you can speak to the same player again. */
export const WORD_DURATION = 600;
export const WORD_COOLDOWN = 240;

export interface WordEffect {
  conf: number;
  nerves: number;
  frus: number;
  morale: number;
  mult: Partial<Record<AttributeKey, number>>;
}

interface Ctx {
  /** His match rating so far (6.5 before he's done much). */
  rating: number;
  /** How many words he's had in the last 15 minutes (people tune out nagging). */
  recent: number;
}

const z = (v: number) => (v - 10) / 10; // 1–20 → about −0.9 … +1

/** Is this word something you could sensibly say to him right now? */
export function wordAvailable(p: MPlayer, word: WordId): boolean {
  if (!p.onPitch || p.sentOff) return false;
  if (word === "careful") return p.yellow > 0;
  return true;
}

/**
 * How well he'll take it: a score from about −1 (furious) to +1 (fired up).
 * Pure and deterministic, so the UI can show the assistant's read beforehand.
 */
export function wordScore(p: MPlayer, word: WordId, ctx: Ctx): number {
  const a = p.attrs;
  const t = p.traits;
  const e = p.emo;
  // professionals and players who like you listen more; nagging wears thin
  let s = z(t.professionalism) * 0.15 + ((p.rapport ?? 50) - 50) / 250 - ctx.recent * 0.18;
  switch (word) {
    case "praise":
      s += ctx.rating >= 7 ? 0.45 : ctx.rating >= 6.5 ? 0.25 : -0.15;
      if (e.conf > 0.45 && t.professionalism < 9) s -= 0.35; // already cocky: he coasts
      break;
    case "encourage":
      s += 0.1 + Math.max(0, -e.conf) * 0.8 + e.nerves * 0.6 + z(t.determination) * 0.15;
      if (e.conf > 0.3 && e.nerves < 0.2) s -= 0.25; // he didn't need it
      break;
    case "demand":
      s += z(t.determination) * 0.45 - z(t.aggression) * (e.frus > 0.3 ? 0.4 : 0.2) + (ctx.rating < 6.3 ? 0.15 : -0.2);
      if (e.conf < -0.3) s -= 0.35; // kicking a man when he's down
      break;
    case "calm":
      s += (e.frus > 0.35 || e.nerves > 0.4 ? 0.3 : -0.15) + z(a.composure) * 0.3 - z(t.aggression) * 0.3;
      break;
    case "focus":
      s += 0.15 + z(a.concentration) * 0.35 + z(t.professionalism) * 0.15;
      break;
    case "stuckIn":
      s += 0.1 + z(a.bravery) * 0.3 + z(a.strength) * 0.15 + z(t.aggression) * 0.1;
      break;
    case "careful":
      s += 0.15 + z(a.decisions) * 0.3 - z(t.aggression) * 0.35;
      break;
    case "express":
      s += z(a.flair) * 0.55 + z(a.technique) * 0.2 + e.conf * 0.25 - 0.05;
      break;
  }
  return Math.max(-1, Math.min(1, s));
}

export function outcomeOf(score: number): WordOutcome {
  return score >= 0.45 ? "fired" : score >= 0.15 ? "good" : score > -0.15 ? "unmoved" : "bad";
}

/** What the word does to him, given how he took it. */
export function wordEffect(p: MPlayer, word: WordId, outcome: WordOutcome): WordEffect {
  const k = outcome === "fired" ? 1.3 : outcome === "good" ? 1 : outcome === "unmoved" ? 0.25 : 0;
  const fx: WordEffect = { conf: 0, nerves: 0, frus: 0, morale: 0, mult: {} };
  const boost = (key: AttributeKey, v: number) => (fx.mult[key] = 1 + (v - 1) * k);
  if (outcome === "bad") {
    // it backfires: wound up, rattled or sulking
    const hothead = p.traits.aggression >= 13;
    fx.frus = hothead ? 0.3 : 0.12;
    fx.conf = hothead ? -0.03 : -0.12;
    fx.morale = -3;
    if (word === "praise") fx.mult.workRate = 0.95; // complacent
    if (word === "express") fx.mult.decisions = 0.95; // unsure what you want
    if (word === "stuckIn" && hothead) fx.mult.tackling = 1.04; // he goes in harder... and wilder
    return fx;
  }
  fx.morale = outcome === "unmoved" ? 0 : outcome === "fired" ? 3 : 2;
  switch (word) {
    case "praise":
      fx.conf = 0.15 * k;
      break;
    case "encourage":
      fx.conf = 0.2 * k;
      fx.nerves = -0.2 * k;
      break;
    case "demand":
      fx.conf = 0.05 * k;
      fx.frus = 0.08 * k;
      boost("workRate", 1.08);
      boost("tackling", 1.03);
      boost("stamina", 1.03);
      break;
    case "calm":
      fx.frus = -0.4 * k;
      fx.nerves = -0.15 * k;
      boost("composure", 1.05);
      break;
    case "focus":
      fx.nerves = -0.1 * k;
      boost("concentration", 1.08);
      boost("positioning", 1.04);
      boost("marking", 1.04);
      break;
    case "stuckIn":
      fx.conf = 0.05 * k;
      fx.frus = 0.08 * k;
      boost("tackling", 1.06);
      boost("strength", 1.03);
      boost("bravery", 1.06);
      break;
    case "careful":
      fx.frus = -0.3 * k;
      boost("decisions", 1.05);
      boost("tackling", 0.97);
      break;
    case "express":
      fx.conf = 0.12 * k;
      boost("dribbling", 1.05);
      boost("technique", 1.04);
      boost("flair", 1.08);
      break;
  }
  return fx;
}

const REPLIES: Record<WordOutcome, string[]> = {
  fired: ["\"Yes, boss!\"", "\"I've got this.\"", "\"Watch me now.\"", "He claps his hands and gets going."],
  good: ["\"Got it.\"", "He nods.", "A thumbs-up back to the bench.", "\"OK, boss.\""],
  unmoved: ["He barely looks over.", "A shrug.", "\"Yeah, yeah.\"", "He doesn't seem to hear it."],
  bad: ["\"Leave me alone!\"", "He waves you away.", "He shakes his head and mutters something.", "\"Don't tell me how to play!\""],
};

/** His reply, chosen deterministically so replays read the same. */
export function wordReply(p: MPlayer, outcome: WordOutcome, tick: number): string {
  const list = REPLIES[outcome];
  return list[(p.idx * 7 + Math.floor(tick / 60)) % list.length];
}
