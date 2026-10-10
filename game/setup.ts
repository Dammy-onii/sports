import type { MatchPrepEffects, MatchSetup, TeamSetup } from "./engine/types";
import { overall } from "./ratings";
import { aiMatchPlan } from "./managers";
import { autoPickLineup, autoRoles, autoSetPieces, repairLineup } from "./tactics";
import type { Club, MatchPrepFocus, OppInstruction, Player } from "./types";

export function teamSetupFor(club: Club, players: Record<string, Player>, isAI: boolean): TeamSetup {
  const squad = Object.values(players).filter((p) => p.clubId === club.id);
  const { lineup, bench } = repairLineup(squad, club.tactics.formation, club.tactics.lineup, club.tactics.bench);
  return {
    clubId: club.id,
    name: club.name,
    shortName: club.shortName,
    colors: club.colors,
    crest: club.crest,
    formation: club.tactics.formation,
    instructions: club.tactics.instructions,
    lineup: lineup.map((id) => players[id]).filter(Boolean),
    bench: bench.map((id) => players[id]).filter(Boolean),
    isAI,
    // AI clubs pick roles to suit their players; the user's choices are kept
    roles: isAI || !club.tactics.roles ? autoRoles(players, club.tactics.formation, lineup) : club.tactics.roles,
    setPieces: club.tactics.setPieces ?? autoSetPieces(lineup.map((id) => players[id])),
    familiarity: club.familiarity,
    playerInstructions: isAI ? undefined : club.tactics.playerInstructions,
    cohesion: club.cohesion,
  };
}

/** What a week of match-specific training gives on the day. */
export function prepEffects(focus: MatchPrepFocus | undefined): MatchPrepEffects {
  return {
    setPiecesAttack: focus === "setPiecesAttack",
    setPiecesDefence: focus === "setPiecesDefence",
    opposition: focus === "opposition",
  };
}

/**
 * The opposition instructions an AI manager gives: tight marking on the most
 * dangerous attacker, pressing centre-backs who can't pass, and going in hard
 * on a tricky winger. Better-run (higher reputation) clubs do more of it.
 */
export function aiOppositionInstructions(ai: Club, opponent: TeamSetup): Record<string, OppInstruction> {
  const out: Record<string, OppInstruction> = {};
  const xi = opponent.lineup;
  const attackers = xi.filter((p) => ["ST", "AM", "LW", "RW"].includes(p.positions[0]));
  const danger = [...attackers].sort((a, b) => b.attributes.finishing + b.attributes.dribbling + b.attributes.pace - (a.attributes.finishing + a.attributes.dribbling + a.attributes.pace))[0];
  if (danger && overall(danger) >= 55) out[danger.id] = { markTight: true };
  if (ai.reputation >= 35) {
    for (const p of xi) {
      if ((p.positions[0] === "CB" || p.positions[0] === "GK") && p.attributes.passing < 9) out[p.id] = { ...out[p.id], press: "more" };
    }
  }
  if (ai.reputation >= 55) {
    const trickster = [...xi].filter((p) => p.positions[0] !== "GK").sort((a, b) => b.attributes.dribbling - a.attributes.dribbling)[0];
    if (trickster && trickster.attributes.dribbling >= 14) out[trickster.id] = { ...out[trickster.id], tackle: "hard" };
  }
  return out;
}

export interface UserPrep {
  /** The user's side in this match. */
  side: "home" | "away";
  opposition: Record<string, OppInstruction>;
  focus?: MatchPrepFocus;
}

/** An AI club sets up for this particular opponent (docs/DEPTH_PLAN.md §7). */
function planFor(ai: Club, opp: Club, players: Record<string, Player>, home: boolean, big: boolean, rotate: boolean): Club {
  if (!ai.manager || ai.isUser) return ai;
  const squad = Object.values(players).filter((p) => p.clubId === ai.id);
  const oppSquad = Object.values(players).filter((p) => p.clubId === opp.id);
  const plan = aiMatchPlan(ai, squad, { club: opp, squad: oppSquad, instructions: opp.tactics.instructions }, { home, big });
  // early cup ties against weaker sides: rest the best three if the squad is deep
  const rested = new Set(rotate && squad.length >= 20 ? [...squad].sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((p) => p.id) : []);
  const pool = squad.filter((p) => !rested.has(p.id));
  const picked = autoPickLineup(pool, plan.formation);
  return { ...ai, tactics: { ...ai.tactics, formation: plan.formation, instructions: plan.instructions, ...picked, roles: autoRoles(players, plan.formation, picked.lineup) } };
}

export function matchSetupFor(
  home: Club,
  away: Club,
  players: Record<string, Player>,
  opts: { homeAI?: boolean; awayAI?: boolean; prep?: UserPrep; bigMatch?: boolean; rotate?: { home?: boolean; away?: boolean } } = {},
): MatchSetup {
  const big = !!opts.bigMatch;
  const hClub = planFor(home, away, players, true, big, !!opts.rotate?.home);
  const aClub = planFor(away, home, players, false, big, !!opts.rotate?.away);
  const h = teamSetupFor(hClub, players, opts.homeAI ?? !home.isUser);
  const a = teamSetupFor(aClub, players, opts.awayAI ?? !away.isUser);
  for (const [setup, club] of [[h, hClub], [a, aClub]] as const) {
    const m = club.manager;
    if (m && !club.isUser) setup.manager = { name: m.name, style: m.style, adaptability: m.adaptability, knowledge: m.knowledge, formations: m.formations };
  }
  h.bigMatch = a.bigMatch = opts.bigMatch;
  // AI managers prepare for their opponent; the user's prep comes from the save
  if (!home.isUser) h.opposition = aiOppositionInstructions(home, a);
  if (!away.isUser) a.opposition = aiOppositionInstructions(away, h);
  if (opts.prep) {
    const mine = opts.prep.side === "home" ? h : a;
    mine.opposition = opts.prep.opposition;
    mine.prep = prepEffects(opts.prep.focus);
  }
  return { home: h, away: a };
}
