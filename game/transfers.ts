import { totalRounds } from "./competition";
import { acceptsTerms, contractDemand, interest, newContract } from "./economy";
import { overall, playerValue, formatMoney } from "./ratings";
import type { Rng } from "./rng";
import { hashString } from "./rng";
import type { SaveGame, TransferOffer } from "./save";
import { autoPickLineup, autoRoles, repairLineup } from "./tactics";
import type { InboxAction, Player, Position } from "./types";

export const MIN_SQUAD = 16;
export const MAX_SQUAD = 30;
/** Club id used for players without a club. */
export const FREE_AGENT = "FA";

const GROUP: Record<Position, "GK" | "DEF" | "MID" | "ATT"> = {
  GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF", DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID", LW: "ATT", RW: "ATT", ST: "ATT",
};
const MIN_IN_GROUP = { GK: 2, DEF: 6, MID: 6, ATT: 3 };

function squad(save: SaveGame, clubId: string) {
  return Object.values(save.players).filter((p) => p.clubId === clubId);
}

function round(save: SaveGame) {
  return save.leagues[0].currentRound;
}

function season(save: SaveGame) {
  return save.leagues[0].season;
}

function tierOf(save: SaveGame, clubId: string) {
  return save.leagues.find((l) => l.clubIds.includes(clubId))?.tier ?? 2;
}

/** Pre-season (first 4 matchdays), mid-season (matchdays 11–13) and the summer break. */
export function isWindowOpen(save: SaveGame): boolean {
  const r = round(save);
  const total = totalRounds(save.leagues[0]);
  return r < 4 || (r >= 10 && r < 13) || r >= total;
}

export function windowLabel(save: SaveGame): string {
  const r = round(save);
  if (r >= totalRounds(save.leagues[0])) return "Summer window open";
  if (r < 4) return `Pre-season window · closes after matchday 4`;
  if (r >= 10 && r < 13) return "January window · closes after matchday 13";
  return r < 10 ? `Window closed · reopens at matchday 11` : "Window closed until the summer";
}

/** Deadline day: the last week of an open window. */
export function isDeadlineWeek(save: SaveGame): boolean {
  const r = round(save);
  return r === 3 || r === 12;
}

/** Is the player in his club's first-choice XI? */
function isKeyPlayer(save: SaveGame, p: Player) {
  return save.clubs[p.clubId]?.tactics.lineup.includes(p.id) ?? false;
}

export function clubStrength(save: SaveGame, clubId: string) {
  const xi = save.clubs[clubId]?.tactics.lineup.map((id) => save.players[id]).filter(Boolean) ?? [];
  return xi.reduce((a, p) => a + overall(p), 0) / Math.max(1, xi.length);
}

export function askingPrice(save: SaveGame, p: Player): number {
  if (p.clubId === FREE_AGENT) return 0;
  const base = playerValue(p);
  const key = isKeyPlayer(save, p) ? 1.4 : 1.1;
  const young = p.age <= 21 ? 1.15 : 1;
  // nearly out of contract or wants out: cheaper
  const expiring = p.contract.expires <= season(save) ? 0.6 : 1;
  const unsettled = p.transferRequest ? 0.8 : 1;
  return Math.max(25_000, Math.round((base * key * young * expiring * unsettled) / 5_000) * 5_000);
}

export type BidResult =
  | { kind: "accepted"; fee: number }
  | { kind: "counter"; fee: number; reason: string }
  | { kind: "rejected"; reason: string };

/** How an AI club responds to the user's bid. Deterministic for a given save state. */
export function evaluateBid(save: SaveGame, playerId: string, fee: number): BidResult {
  const p = save.players[playerId];
  if (!p || p.clubId === save.userClubId) return { kind: "rejected", reason: "Player not available." };
  if (p.clubId === FREE_AGENT) return { kind: "accepted", fee: 0 };
  if (p.loan) return { kind: "rejected", reason: "He's on loan there; you'd have to deal with his parent club." };
  const seller = squad(save, p.clubId);
  if (seller.length <= MIN_SQUAD + 2) return { kind: "rejected", reason: `${save.clubs[p.clubId].name} can't spare any more players.` };
  const g = GROUP[p.positions[0]];
  const depth = seller.filter((x) => GROUP[x.positions[0]] === g).length;
  const asking = askingPrice(save, p);
  const needed = depth <= MIN_IN_GROUP[g] ? asking * 1.6 : asking;
  if (fee >= needed) return { kind: "accepted", fee };
  if (fee >= needed * 0.8) return { kind: "counter", fee: Math.round(needed / 5_000) * 5_000, reason: "We'd do it for a bit more." };
  return { kind: "rejected", reason: depth <= MIN_IN_GROUP[g] ? "He's essential to us. We're short in that position." : "That bid is nowhere near our valuation." };
}

/** How keen the player is on joining the user's club (0–1). */
export function userInterest(save: SaveGame, p: Player): number {
  const to = save.clubs[save.userClubId];
  const from = p.clubId === FREE_AGENT ? { reputation: Math.max(10, to.reputation - 20) } : save.clubs[p.clubId];
  return interest(p, from, { reputation: to.reputation, strength: clubStrength(save, to.id) }, save.manager?.reputation ?? 40);
}

/** What he'd want to sign for the user's club. */
export function signingDemand(save: SaveGame, p: Player) {
  return contractDemand(p, { tier: tierOf(save, save.userClubId), status: overall(p) >= clubStrength(save, save.userClubId) ? "key" : "regular", season: season(save) });
}

function nextShirt(save: SaveGame, clubId: string, preferred: number) {
  const used = new Set(squad(save, clubId).map((p) => p.shirt));
  if (!used.has(preferred)) return preferred;
  for (let n = 2; n < 99; n++) if (!used.has(n)) return n;
  return 99;
}

function logTransfer(save: SaveGame, p: Player, from: string, to: string, fee: number) {
  save.transferLog = [
    { season: season(save), round: round(save), playerId: p.id, playerName: `${p.firstName} ${p.lastName}`, fromClubId: from, toClubId: to, fee },
    ...save.transferLog,
  ].slice(0, 200);
}

function refreshTactics(save: SaveGame, clubId: string) {
  const club = save.clubs[clubId];
  if (!club) return;
  const sq = squad(save, clubId);
  if (club.isUser) {
    club.tactics = { ...club.tactics, ...repairLineup(sq, club.tactics.formation, club.tactics.lineup, club.tactics.bench) };
  } else {
    const picked = autoPickLineup(sq, club.tactics.formation);
    club.tactics = { ...club.tactics, ...picked, roles: autoRoles(save.players, club.tactics.formation, picked.lineup) };
  }
}

/** Move a player between clubs (or to/from free agency), settle the fee and set his new deal. */
export function executeTransfer(save: SaveGame, playerId: string, toClubId: string, fee: number, contract?: { wage: number; years: number }) {
  const p = save.players[playerId];
  const from = p.clubId;
  if (save.clubs[from]) save.clubs[from].balance += fee;
  if (save.clubs[toClubId]) save.clubs[toClubId].balance -= fee;
  // the user's transfer budget: fees come out of it, half of sales go back in
  if (save.board.transferBudget !== undefined) {
    if (toClubId === save.userClubId) save.board.transferBudget = Math.max(0, save.board.transferBudget - fee);
    if (from === save.userClubId) save.board.transferBudget += Math.round(fee * 0.5);
  }
  p.clubId = toClubId;
  p.loan = undefined;
  p.shirt = nextShirt(save, toClubId, p.shirt);
  p.morale = Math.min(100, p.morale + 10);
  p.transferRequest = false;
  p.unhappyWeeks = 0;
  // a new club: settling in starts again, and he has no history with the manager
  if (save.clubs[toClubId]) {
    p.joinedSeason = save.leagues[0]?.season ?? 1;
    p.settled = Math.max(0, Math.min(100, 20 + (p.traits.adaptability ?? 10) * 2.5));
    p.rapport = 50;
    p.talks = {};
  }
  p.promise = undefined;
  p.mentorId = undefined;
  p.minutesHistory = [];
  if (toClubId !== FREE_AGENT) {
    p.contract = contract
      ? { wage: contract.wage, expires: season(save) + contract.years - 1 }
      : newContract(p, season(save), tierOf(save, toClubId));
  }
  if (toClubId === save.userClubId) save.knowledge[p.id] = 100;
  save.transferList = save.transferList.filter((id) => id !== playerId);
  save.shortlist = save.shortlist.filter((id) => id !== playerId);
  save.offers = save.offers.filter((o) => o.playerId !== playerId);
  logTransfer(save, p, from, toClubId, fee);
  refreshTactics(save, from);
  refreshTactics(save, toClubId);
}

export type BuyResult =
  | { ok: true; fee: number }
  | { ok: false; reason: string; counter?: number }
  /** Fee agreed: now personal terms are needed. */
  | { ok: false; stage: "terms"; fee: number; demand: { wage: number; years: number }; reason: string };

/**
 * The user's transfer bid. Step 1 (no `terms`): the selling club decides on
 * the fee. Step 2 (with `terms`): the player decides on the contract.
 */
export function buyPlayer(save: SaveGame, playerId: string, fee: number, terms?: { wage: number; years: number }): BuyResult {
  if (!isWindowOpen(save)) return { ok: false, reason: "The transfer window is closed." };
  const club = save.clubs[save.userClubId];
  const p = save.players[playerId];
  if (!p) return { ok: false, reason: "Player not found." };
  const budget = Math.min(club.balance, save.board.transferBudget ?? club.balance);
  if (fee > budget) return { ok: false, reason: `Your transfer budget is ${formatMoney(budget)}. Ask the board for more, or move money from the wage budget.` };
  if (squad(save, club.id).length >= MAX_SQUAD) return { ok: false, reason: `Squad is full (${MAX_SQUAD}). Sell someone first.` };
  const res = evaluateBid(save, playerId, fee);
  if (res.kind === "counter") return { ok: false, reason: res.reason, counter: res.fee };
  if (res.kind === "rejected") return { ok: false, reason: res.reason };
  if (userInterest(save, p) < 0.25) {
    return { ok: false, reason: `${p.lastName} isn't interested in joining a club at your level right now.` };
  }
  const demand = signingDemand(save, p);
  if (!terms) return { ok: false, stage: "terms", fee, demand, reason: "Fee agreed. Now agree personal terms." };
  const verdict = acceptsTerms(p, terms, demand);
  if (!verdict.ok) return { ok: false, stage: "terms", fee, demand, reason: verdict.reason ?? "He turned the offer down." };
  const sellerName = save.clubs[p.clubId]?.name ?? "free agency";
  executeTransfer(save, playerId, club.id, fee, terms);
  pushInbox(
    save,
    `Signed: ${p.firstName} ${p.lastName}`,
    `${p.firstName} ${p.lastName} (${p.positions[0]}, ${overall(p)} OVR) joins from ${sellerName}${fee ? ` for ${formatMoney(fee)}` : " on a free"}, on ${formatMoney(terms.wage)}/wk for ${terms.years} year${terms.years > 1 ? "s" : ""}.`,
    { kind: "player", playerId },
  );
  return { ok: true, fee };
}

// ───────────── loans ─────────────

/** Can this AI player be borrowed? Young or fringe players only. */
export function loanAvailable(save: SaveGame, p: Player): boolean {
  if (p.clubId === save.userClubId || p.clubId === FREE_AGENT || p.loan) return false;
  return !isKeyPlayer(save, p) && (p.age <= 23 || p.status === "backup" || p.status === "rotation");
}

/** Borrow a player for the rest of the season, paying `wageShare` of his wages. */
export function loanIn(save: SaveGame, playerId: string, wageShare: number): { ok: boolean; reason?: string } {
  if (!isWindowOpen(save)) return { ok: false, reason: "The transfer window is closed." };
  const p = save.players[playerId];
  if (!p || !loanAvailable(save, p)) return { ok: false, reason: "His club won't loan him out." };
  if (squad(save, save.userClubId).length >= MAX_SQUAD) return { ok: false, reason: `Squad is full (${MAX_SQUAD}).` };
  const needed = p.age <= 21 ? 0.5 : 0.75;
  if (wageShare < needed) return { ok: false, reason: `They want you to cover at least ${Math.round(needed * 100)}% of his wages.` };
  if (userInterest(save, p) < 0.2) return { ok: false, reason: `${p.lastName} doesn't fancy the move.` };
  const from = p.clubId;
  p.clubId = save.userClubId;
  p.loan = { fromClubId: from, untilSeason: season(save), wageShare };
  p.shirt = nextShirt(save, save.userClubId, p.shirt);
  p.minutesHistory = [];
  save.knowledge[p.id] = 100;
  logTransfer(save, p, from, save.userClubId, 0);
  refreshTactics(save, from);
  refreshTactics(save, save.userClubId);
  pushInbox(save, `Loan: ${p.firstName} ${p.lastName}`, `${p.firstName} ${p.lastName} joins on loan from ${save.clubs[from].name} until the end of the season.`, { kind: "player", playerId });
  return { ok: true };
}

/** Send one of your players out on loan to a club in need (lower or same tier). */
export function loanOut(save: SaveGame, playerId: string): { ok: boolean; reason?: string; clubName?: string } {
  if (!isWindowOpen(save)) return { ok: false, reason: "The transfer window is closed." };
  const p = save.players[playerId];
  if (!p || p.clubId !== save.userClubId || p.loan) return { ok: false, reason: "Not available to loan out." };
  if (squad(save, save.userClubId).length <= MIN_SQUAD) return { ok: false, reason: `You need at least ${MIN_SQUAD} players.` };
  const ovr = overall(p);
  const homes = Object.values(save.clubs)
    .filter((c) => !c.isUser && squad(save, c.id).length < MAX_SQUAD - 1 && clubStrength(save, c.id) <= ovr + 4)
    .sort((a, b) => (hashString(a.id + p.id) % 97) - (hashString(b.id + p.id) % 97));
  const club = homes[0];
  if (!club) return { ok: false, reason: "No club wants him at the moment." };
  p.clubId = club.id;
  p.loan = { fromClubId: save.userClubId, untilSeason: season(save), wageShare: 0.75 };
  logTransfer(save, p, save.userClubId, club.id, 0);
  refreshTactics(save, save.userClubId);
  refreshTactics(save, club.id);
  return { ok: true, clubName: club.name };
}

/** Loans end: players go back to their parent clubs. */
export function returnLoans(save: SaveGame, newSeason: number) {
  for (const p of Object.values(save.players)) {
    if (p.loan && p.loan.untilSeason < newSeason) {
      const from = p.clubId;
      p.clubId = p.loan.fromClubId;
      p.loan = undefined;
      p.minutesHistory = [];
      refreshTactics(save, from);
      refreshTactics(save, p.clubId);
    }
  }
}

// ───────────── contracts ─────────────

export function renewContract(save: SaveGame, playerId: string, offer: { wage: number; years: number }): { ok: boolean; reason?: string } {
  const p = save.players[playerId];
  if (!p || p.clubId !== save.userClubId || p.loan) return { ok: false, reason: "Not your player." };
  const demand = contractDemand(p, { tier: tierOf(save, save.userClubId), season: season(save) });
  if (p.transferRequest && offer.wage < demand.wage * 1.1) return { ok: false, reason: `${p.lastName} wants to leave. Only a big raise would change his mind.` };
  const verdict = acceptsTerms(p, offer, demand);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  p.contract = { wage: offer.wage, expires: season(save) + offer.years - 1 };
  p.morale = Math.min(100, p.morale + 8);
  p.transferRequest = false;
  return { ok: true };
}

/** Terminate a contract: pay half of what's left, and he becomes a free agent. */
export function releasePlayer(save: SaveGame, playerId: string): { ok: boolean; reason?: string; cost?: number } {
  const p = save.players[playerId];
  if (!p || p.clubId !== save.userClubId || p.loan) return { ok: false, reason: "Not your player." };
  if (squad(save, save.userClubId).length <= MIN_SQUAD) return { ok: false, reason: `You need at least ${MIN_SQUAD} players.` };
  const seasonsLeft = Math.max(0, p.contract.expires - season(save)) + 1;
  const cost = Math.round((p.contract.wage * 28 * seasonsLeft * 0.5) / 1000) * 1000;
  save.clubs[save.userClubId].balance -= cost;
  executeTransfer(save, playerId, FREE_AGENT, 0);
  return { ok: true, cost };
}

// ───────────── selling & offers ─────────────

export function acceptOffer(save: SaveGame, offerId: string): { ok: boolean; reason?: string } {
  const offer = save.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: "Offer has expired." };
  if (!isWindowOpen(save)) return { ok: false, reason: "The transfer window is closed." };
  if (squad(save, save.userClubId).length <= MIN_SQUAD) return { ok: false, reason: `You need at least ${MIN_SQUAD} players.` };
  const p = save.players[offer.playerId];
  executeTransfer(save, offer.playerId, offer.fromClubId, offer.fee);
  pushInbox(save, `Sold: ${p.firstName} ${p.lastName}`, `${p.firstName} ${p.lastName} has joined ${save.clubs[offer.fromClubId].name} for ${formatMoney(offer.fee)}.`);
  return { ok: true };
}

export function rejectOffer(save: SaveGame, offerId: string) {
  const offer = save.offers.find((o) => o.id === offerId);
  save.offers = save.offers.filter((o) => o.id !== offerId);
  // a player who wanted the move doesn't take it well
  const p = offer && save.players[offer.playerId];
  if (p?.transferRequest) p.morale = Math.max(0, p.morale - 10);
}

export function toggleListed(save: SaveGame, playerId: string) {
  save.transferList = save.transferList.includes(playerId) ? save.transferList.filter((id) => id !== playerId) : [...save.transferList, playerId];
}

export function toggleShortlist(save: SaveGame, playerId: string) {
  save.shortlist = save.shortlist.includes(playerId) ? save.shortlist.filter((id) => id !== playerId) : [...save.shortlist, playerId];
}

function pushInbox(save: SaveGame, title: string, body: string, action?: InboxAction) {
  save.inbox = [
    { id: `t_${season(save)}_${save.calendarIndex}_${save.inbox.length}_${title.length}`, round: round(save), title, body, read: false, action, tag: "Transfers" },
    ...save.inbox,
  ].slice(0, 80);
}

export function expireOffers(save: SaveGame, r: number) {
  save.offers = save.offers.filter((o) => o.expiresRound >= r + 1);
}

/** AI clubs bid for the user's listed or unsettled players (and occasionally a star). */
export function generateOffers(save: SaveGame, rng: Rng, r: number) {
  if (!isWindowOpen(save)) return;
  const userPlayers = squad(save, save.userClubId).filter((p) => !p.loan);
  const aiClubs = Object.values(save.clubs).filter((c) => !c.isUser);
  for (const p of userPlayers) {
    if (save.offers.some((o) => o.playerId === p.id)) continue;
    const listed = save.transferList.includes(p.id) || p.transferRequest;
    const chance = listed ? 0.6 : overall(p) >= 70 ? 0.04 : 0;
    if (!rng.chance(chance)) continue;
    const ovr = overall(p);
    const fits = aiClubs.filter((c) => Math.abs(clubStrength(save, c.id) - ovr) < 9);
    const value = playerValue(p);
    const fee = Math.round((value * (listed ? rng.range(0.7, 1.05) : rng.range(1.2, 1.5))) / 5_000) * 5_000;
    const buyers = fits.filter((c) => c.balance >= fee && squad(save, c.id).length < MAX_SQUAD);
    if (!buyers.length) continue;
    const buyer = rng.pick(buyers);
    const offer: TransferOffer = {
      id: `o_${season(save)}_${r}_${p.id}`,
      playerId: p.id,
      fromClubId: buyer.id,
      fee: Math.max(25_000, fee),
      expiresRound: r + 2,
    };
    save.offers.push(offer);
    pushInbox(save, `Offer for ${p.lastName}`, `${buyer.name} bid ${formatMoney(offer.fee)} for ${p.firstName} ${p.lastName}.`, { kind: "offer", offerId: offer.id });
  }
}

/** A trickle of AI-to-AI deals and free-agent signings so the world doesn't stand still. */
export function aiTransferActivity(save: SaveGame, rng: Rng) {
  if (!isWindowOpen(save)) return;
  const aiClubs = Object.values(save.clubs).filter((c) => !c.isUser);
  const deals = rng.int(1, 3) + (isDeadlineWeek(save) ? 2 : 0);
  // clubs with money to spare buy; clubs in debt sell first
  const reserve = (c: (typeof aiClubs)[number]) => c.balance - 4_000_000;
  const buyerW = aiClubs.map((c) => Math.max(0.2, reserve(c) / 1_000_000));
  const sellerW = aiClubs.map((c) => (c.balance < 0 ? 6 : c.balance < 2_000_000 ? 2.5 : 1));
  for (let i = 0; i < deals; i++) {
    const buyer = aiClubs[rng.weighted(buyerW)];
    const sellerClub = aiClubs[rng.weighted(sellerW)];
    if (buyer.id === sellerClub.id) continue;
    const sellerSquad = squad(save, sellerClub.id).filter((p) => !p.loan);
    if (sellerSquad.length <= MIN_SQUAD + 3 || squad(save, buyer.id).length >= MAX_SQUAD - 1) continue;
    const level = clubStrength(save, buyer.id);
    const targets = sellerSquad.filter((p) => !isKeyPlayer(save, p) && overall(p) > level - 6 && p.injuryWeeks === 0);
    if (!targets.length) continue;
    const p = rng.pick(targets);
    const fee = askingPrice(save, p);
    if (buyer.balance < fee) continue;
    executeTransfer(save, p.id, buyer.id, fee);
  }
  // thin squads pick up free agents
  const free = Object.values(save.players).filter((p) => p.clubId === FREE_AGENT && p.age < 34);
  for (const c of aiClubs) {
    if (squad(save, c.id).length >= 20 || !free.length) continue;
    const pick = free.sort((a, b) => overall(b) - overall(a)).shift()!;
    executeTransfer(save, pick.id, c.id, 0);
  }
}
