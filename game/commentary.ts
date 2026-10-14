import type { MatchEvent, MatchState } from "./engine/types";
import { TALKS } from "./roles";
import { OUTCOME_LABEL, WORDS, type WordId, type WordOutcome } from "./engine/words";

const SHOUT_LINES: Record<string, string> = {
  encourage: "Heads up, keep going!",
  demand: "More! Win every ball!",
  calm: "Calm down, keep it simple!",
  push: "Push up! Get forward!",
  focus: "Concentrate! Stay tight!",
};

function pick(templates: string[], seed: number): string {
  return templates[Math.abs(seed) % templates.length];
}

function fill(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const T = {
  kickoff: ["{team} get us underway.", "And we're off! {team} kick off.", "The referee blows and {team} start things."],
  goal: [
    "GOAL! {p} finds the net for {team}! {score}",
    "GOAL! {p} makes no mistake. {score}",
    "It's in! {p} scores for {team}! {score}",
    "GOAL! What a finish from {p}! {score}",
  ],
  goalAssist: [
    "GOAL! {a} picks out {p}, who finishes in style. {score}",
    "GOAL! Lovely ball from {a} and {p} tucks it away. {score}",
    "GOAL! {p} converts {a}'s pass. {score}",
  ],
  goalHeader: ["GOAL! {p} rises highest and heads it in! {score}", "GOAL! A towering header from {p}! {score}"],
  goalPen: ["GOAL! {p} sends the keeper the wrong way from the spot. {score}", "GOAL! {p} buries the penalty. {score}"],
  saved: ["{p} tries his luck but {k} gathers.", "Shot from {p}, comfortable save for {k}.", "{k} keeps out {p}'s effort."],
  bigSave: ["What a save! {k} denies {p} from close range!", "Brilliant stop by {k} to keep out {p}!", "{p} should score, but {k} is equal to it!"],
  penSaved: ["SAVED! {k} guesses right and stops {p}'s penalty!"],
  wide: ["{p} fires wide.", "{p} drags it past the post.", "Over the bar from {p}.", "{p} lets fly, but it's off target."],
  widePen: ["{p} blazes the penalty over!"],
  blocked: ["{p}'s shot is blocked.", "Brave block to deny {p}.", "{p} shoots, but it's charged down."],
  foul: ["Foul by {p} on {o}.", "{p} brings down {o}.", "Free kick given against {p}."],
  yellow: ["Yellow card for {p}.", "{p} goes into the book.", "The referee shows {p} a yellow."],
  red: ["RED CARD! {p} is sent off!", "{p} sees red! {team} are down to ten."],
  second: ["Second yellow for {p}! He's off!"],
  corner: ["Corner to {team}.", "{team} win a corner."],
  freekick: ["Free kick in a dangerous position for {team}.", "{team} have a free kick within range."],
  penalty: ["PENALTY! {p} is brought down in the box!", "The referee points to the spot! Penalty to {team}!"],
  sub: ["Substitution for {team}: {p} replaces {o}.", "{team} make a change. {p} on, {o} off."],
  injury: ["{p} is down injured.", "Concern for {team} as {p} goes down hurt."],
  halftime: ["Half-time: {score}.", "The referee blows for the break. {score}."],
  fulltime: ["Full-time! {score}.", "That's it! Final score: {score}."],
  tactics: ["{team} make a tactical change.", "{team}'s manager is changing things from the touchline."],
  chance: ["{team} are building in the final third.", "{p} looks for a way through.", "Promising move from {team}."],
  tackle: ["Superb tackle from {p} to dispossess {o}.", "{p} wins it back with a crunching challenge."],
  offside: ["Flag up: {p} is caught offside.", "{p} mistimes his run and the flag goes up."],
  heavy_touch: ["A heavy touch from {p} and the chance is gone.", "{p} lets it get away from him.", "Poor first touch by {p}."],
  claim: ["{p} comes off his line and claims it confidently.", "Strong hands from {p} to pluck the cross out of the air."],
  dissent: ["{p} is booked for dissent. He's lost his cool.", "Yellow card for {p} for arguing with the referee."],
  on_fire: ["{p} is buzzing out there, wanting the ball at every chance.", "Confidence is flowing through {p} now.", "{p} looks like he could do anything today."],
  head_down: ["{p}'s head has gone down.", "{p} looks short of confidence.", "Not {p}'s day. He's hiding a little."],
  rattled: ["{p} looks rattled.", "Nerves are getting to {p}.", "{p} seems overwhelmed by the occasion."],
  frustrated: ["{p} slams the turf in frustration.", "{p} throws his arms up. Things aren't going his way.", "Frustration growing for {p}."],
  losing_head: ["{p} is losing his head! Someone needs to calm him down.", "{p} is seeing red out there. A card waiting to happen.", "{p} squares up to an opponent. Tempers flaring!"],
};

export function commentaryFor(e: MatchEvent, s: MatchState): string {
  const team = s.teams[e.side];
  const byId = (id?: string) => (id ? s.players.find((p) => p.id === id) : undefined);
  const p = byId(e.player);
  const o = byId(e.other);
  const scoreArr = e.score ?? s.score;
  const vars = {
    team: team.name,
    p: p?.shortName ?? "",
    o: o?.shortName ?? "",
    a: o?.shortName ?? "",
    k: o?.shortName ?? "the keeper",
    score: `${s.teams[0].shortName} ${scoreArr[0]}–${scoreArr[1]} ${s.teams[1].shortName}`,
  };
  const seed = e.tick * 31 + e.type.length;
  let list: string[];
  switch (e.type) {
    case "goal":
      list = e.penalty ? T.goalPen : e.header ? T.goalHeader : e.other ? T.goalAssist : T.goal;
      break;
    case "shot_saved":
      list = e.penalty ? T.penSaved : T.saved;
      break;
    case "big_save":
      list = e.penalty ? T.penSaved : T.bigSave;
      break;
    case "shot_wide":
      list = e.penalty ? T.widePen : T.wide;
      break;
    case "shot_blocked":
      list = T.blocked;
      break;
    case "red":
      list = e.text === "second" ? T.second : T.red;
      break;
    case "shout":
      return e.text === "none"
        ? `${team.name}'s manager stops shouting instructions.`
        : `${team.name}'s manager is on the touchline: "${SHOUT_LINES[e.text ?? ""] ?? "Come on!"}"`;
    case "yellow":
      list = e.text === "dissent" ? T.dissent : T.yellow;
      break;
    case "tactics":
      if (e.text && team.isAI) return `${team.name}'s manager makes a change: ${e.text}.`;
      list = T.tactics;
      break;
    case "emotion":
      list = (T as Record<string, string[]>)[e.text ?? ""] ?? [""];
      break;
    case "word": {
      const [word, outcome, reply] = (e.text ?? "").split("|");
      const info = WORDS[word as WordId];
      return `${team.shortName} manager to ${p?.shortName ?? ""}: "${info?.line ?? ""}" ${reply ?? ""} (${OUTCOME_LABEL[outcome as WordOutcome] ?? ""})`;
    }
    case "talk":
      return `${team.name} get a team talk: "${TALKS[e.text as keyof typeof TALKS]?.line ?? ""}"`;
    default:
      list = (T as Record<string, string[]>)[e.type] ?? [""];
  }
  return fill(pick(list, seed), vars);
}

/** Events that pause-worthy / get a highlight treatment in the UI. */
export const KEY_EVENTS = new Set<MatchEvent["type"]>(["goal", "red", "penalty", "big_save", "halftime", "fulltime"]);
