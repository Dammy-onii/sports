import { currentSeason } from "./career";
import { staffRating } from "./economy";
import { appointStaff, endStaffAppointment } from "./staff";
import type { SaveGame, ScoutAssignment } from "./save";
import type { Club, Stadium, StaffRole } from "./types";

/**
 * Club-management actions on the user's club: staff, academy facilities and
 * scout assignments. All mutate the save in place (use with `act`).
 */

type Result = { ok: boolean; reason?: string };

function charge(save: SaveGame, label: string, amount: number) {
  const club = save.clubs[save.userClubId];
  club.balance -= amount;
  save.ledger.unshift({ season: currentSeason(save), week: save.calendarIndex + 1, label, amount: -amount });
}

/** Weeks of wages paid as compensation when a staff member is sacked. */
export const STAFF_SEVERANCE_WEEKS = 8;
/** Signing-on fee for a new staff member, in weeks of their wage. */
export const STAFF_SIGNING_WEEKS = 4;

export function hireStaff(save: SaveGame, staffId: string): Result {
  const club = save.clubs[save.userClubId];
  const s = save.staffMarket.find((x) => x.id === staffId);
  if (!s) return { ok: false, reason: "They've taken another job." };
  const fee = s.wage * STAFF_SIGNING_WEEKS;
  const current = club.staff[s.role];
  const severance = current ? current.wage * STAFF_SEVERANCE_WEEKS : 0;
  if (club.balance < fee + severance) return { ok: false, reason: "You can't afford the signing-on fee." };
  if (current) {
    appointStaff(current, club, currentSeason(save), save.calendarIndex + 1);
    endStaffAppointment(current, currentSeason(save), save.calendarIndex + 1);
    charge(save, `Compensation: ${current.name}`, severance);
    save.staffMarket.push(current);
  }
  charge(save, `Staff signing: ${s.name}`, fee);
  club.staff[s.role] = s;
  appointStaff(s, club, currentSeason(save), save.calendarIndex + 1);
  save.staffMarket = save.staffMarket.filter((x) => x.id !== s.id);
  return { ok: true };
}

export function fireStaff(save: SaveGame, role: StaffRole): Result {
  const club = save.clubs[save.userClubId];
  const current = club.staff[role];
  if (!current) return { ok: false, reason: "Nobody in that role." };
  appointStaff(current, club, currentSeason(save), save.calendarIndex + 1);
  endStaffAppointment(current, currentSeason(save), save.calendarIndex + 1);
  charge(save, `Compensation: ${current.name}`, current.wage * STAFF_SEVERANCE_WEEKS);
  delete club.staff[role];
  save.staffMarket.push(current);
  return { ok: true };
}

export const MAX_ACADEMY = 5;

export function academyUpgradeCost(level: number): number {
  return 750_000 * level * level;
}

export function upgradeAcademy(save: SaveGame): Result {
  const club = save.clubs[save.userClubId];
  if (club.academy >= MAX_ACADEMY) return { ok: false, reason: "The academy is already world-class." };
  const cost = academyUpgradeCost(club.academy);
  if (club.balance < cost) return { ok: false, reason: "The club can't fund it right now." };
  charge(save, `Academy upgrade to level ${club.academy + 1}`, cost);
  club.academy += 1;
  return { ok: true };
}

export function facilitiesUpgradeCost(level: number): number {
  return 1_000_000 * level * level;
}

/** Training ground: players develop faster (see docs/DEPTH_PLAN.md §1). */
export function upgradeFacilities(save: SaveGame): Result {
  const club = save.clubs[save.userClubId];
  if (club.facilities.training >= MAX_ACADEMY) return { ok: false, reason: "The training ground is already world-class." };
  const cost = facilitiesUpgradeCost(club.facilities.training);
  if (club.balance < cost) return { ok: false, reason: "The club can't fund it right now." };
  charge(save, `Training ground upgrade to level ${club.facilities.training + 1}`, cost);
  club.facilities.training += 1;
  return { ok: true };
}

/** A better chief scout can run more assignments at once. */
export function maxAssignments(save: SaveGame): number {
  return 1 + Math.floor(staffRating(save.clubs[save.userClubId].staff, "scout") / 7);
}

export function addAssignment(save: SaveGame, kind: ScoutAssignment["kind"], value: string): Result {
  if (save.scouting.assignments.length >= maxAssignments(save)) return { ok: false, reason: "Your scout is at capacity. Hire a better one or drop an assignment." };
  if (save.scouting.assignments.some((a) => a.kind === kind && a.value === value)) return { ok: false, reason: "Already assigned." };
  save.scouting.assignments.push({ id: `sa_${kind}_${value}_${save.calendarIndex}`, kind, value });
  return { ok: true };
}

export function removeAssignment(save: SaveGame, id: string) {
  save.scouting.assignments = save.scouting.assignments.filter((a) => a.id !== id);
}

// ───────────── stadium & attendance ─────────────

const STADIUM_WORDS = ["Park", "Road", "Lane", "Ground", "Stadium", "Arena", "Meadow"];

export function defaultStadium(club: Club): Stadium {
  const word = STADIUM_WORDS[club.name.length % STADIUM_WORDS.length];
  return {
    name: `${club.name.split(" ")[0]} ${word}`,
    capacity: Math.round((6000 + club.reputation * 300) / 500) * 500,
    ticketPrice: Math.round(12 + club.reputation * 0.06),
  };
}

/** The ticket price fans think is fair for this club. */
export function fairPrice(club: Club) {
  return 12 + club.reputation * 0.06;
}

/**
 * How many come through the gates: reputation, division, form, league
 * position, the opponent, derbies and the ticket price, capped by capacity.
 */
export function attendance(club: Club, opts: { tier: number; formPoints: number; position: number; clubs: number; opponentRep: number; derby: boolean; fans?: number }): number {
  const st = club.stadium ?? defaultStadium(club);
  let demand = 2500 + club.reputation * 230 + (opts.tier === 1 ? 3000 : 0);
  demand *= 0.85 + (opts.formPoints / 15) * 0.3; // last five results
  demand *= 1.1 - ((opts.position - 1) / Math.max(1, opts.clubs - 1)) * 0.2;
  demand *= 1 + Math.max(0, opts.opponentRep - club.reputation) / 200;
  if (opts.derby) demand *= 1.25;
  if (opts.fans !== undefined) demand *= 0.85 + opts.fans / 333; // the supporters' mood
  demand *= Math.pow(fairPrice(club) / Math.max(3, st.ticketPrice), 0.8);
  return Math.round(Math.min(st.capacity, Math.max(500, demand)));
}

export const SEAT_COST = 1500;
export const EXPANSIONS = [
  { seats: 2000, weeks: 8 },
  { seats: 5000, weeks: 16 },
];

export function setTicketPrice(save: SaveGame, price: number) {
  const club = save.clubs[save.userClubId];
  club.stadium = { ...(club.stadium ?? defaultStadium(club)), ticketPrice: Math.max(5, Math.min(80, Math.round(price))) };
}

/** Start a stadium expansion at the club's own cost. */
export function expandStadium(save: SaveGame, seats: number): Result {
  const club = save.clubs[save.userClubId];
  const st = (club.stadium ??= defaultStadium(club));
  if (st.expansion) return { ok: false, reason: "An expansion is already under way." };
  const plan = EXPANSIONS.find((e) => e.seats === seats);
  if (!plan) return { ok: false, reason: "Unknown project." };
  const cost = seats * SEAT_COST;
  if (club.balance < cost) return { ok: false, reason: "The club can't fund it." };
  charge(save, `Stadium expansion (+${seats.toLocaleString()} seats)`, cost);
  st.expansion = { seats, weeksLeft: plan.weeks };
  return { ok: true };
}

/** Weekly progress on any stadium works. Returns clubs whose expansion finished. */
export function stadiumWeek(save: SaveGame): string[] {
  const done: string[] = [];
  for (const club of Object.values(save.clubs)) {
    const st = club.stadium;
    if (!st?.expansion) continue;
    st.expansion.weeksLeft--;
    if (st.expansion.weeksLeft <= 0) {
      st.capacity += st.expansion.seats;
      st.expansion = undefined;
      done.push(club.id);
    }
  }
  return done;
}

// ───────────── budgets & the board ─────────────

/** Season transfer budget: a share of the balance, more if the board is happy. */
export function seasonTransferBudget(save: SaveGame): number {
  const club = save.clubs[save.userClubId];
  const share = 0.3 + (save.board.confidence - 50) / 250;
  return Math.max(0, Math.round((club.balance * share) / 50_000) * 50_000);
}

/** Move money between the transfer budget and the weekly wage budget (£40 of fees per £1/week of wages). */
export function rebalanceBudget(save: SaveGame, toWages: number): Result {
  const b = save.board;
  const fees = b.transferBudget ?? 0;
  if (toWages > 0 && toWages > fees) return { ok: false, reason: "Not enough transfer budget." };
  if (toWages < 0 && -toWages / 40 > b.wageBudget * 0.3) return { ok: false, reason: "The board won't cut the wage budget that far." };
  b.transferBudget = Math.round(fees - toWages);
  b.wageBudget = Math.round(b.wageBudget + toWages / 40);
  return { ok: true };
}

export type BoardAsk = "transfer" | "wages" | "training" | "academy" | "stadium";

export const BOARD_ASKS: Record<BoardAsk, { label: string; blurb: string }> = {
  transfer: { label: "More transfer funds", blurb: "Ask for a bigger transfer budget." },
  wages: { label: "A bigger wage budget", blurb: "Room to pay better players." },
  training: { label: "Upgrade the training ground", blurb: "The board pays for better facilities." },
  academy: { label: "Upgrade the youth academy", blurb: "The board invests in youth." },
  stadium: { label: "Expand the stadium", blurb: "The board funds 2,000 more seats." },
};

/**
 * Ask the board for something. The answer depends on confidence, finances
 * and how recently you asked; nagging costs confidence.
 */
export function askBoard(save: SaveGame, ask: BoardAsk): { ok: boolean; text: string } {
  const b = save.board;
  const club = save.clubs[save.userClubId];
  b.asked ??= {};
  const last = b.asked[ask];
  if (last !== undefined && save.calendarIndex - last < 6) {
    b.confidence = Math.max(0, b.confidence - 2);
    return { ok: false, text: "The board says you asked them very recently and is irritated you've raised it again." };
  }
  b.asked[ask] = save.calendarIndex;
  const conf = b.confidence;
  const rich = club.balance > 3_000_000;
  const decline = (why: string) => ({ ok: false, text: `The board declines: ${why}` });
  switch (ask) {
    case "transfer": {
      if (conf < 55) return decline("results need to improve first.");
      if (!rich) return decline("the finances can't support it.");
      const extra = Math.round((club.balance * (conf >= 75 ? 0.15 : 0.08)) / 50_000) * 50_000;
      b.transferBudget = (b.transferBudget ?? 0) + extra;
      return { ok: true, text: `The board adds ${formatMoneyShort(extra)} to the transfer budget.` };
    }
    case "wages": {
      if (conf < 55) return decline("results need to improve first.");
      const extra = Math.round((b.wageBudget * (conf >= 75 ? 0.1 : 0.05)) / 500) * 500;
      if (club.balance < extra * 30) return decline("the club can't commit to higher wages.");
      b.wageBudget += extra;
      return { ok: true, text: `The wage budget rises by ${formatMoneyShort(extra)} a week.` };
    }
    case "training":
    case "academy": {
      const level = ask === "training" ? club.facilities.training : club.academy;
      if (level >= MAX_ACADEMY) return decline("the facilities are already top class.");
      const cost = ask === "training" ? facilitiesUpgradeCost(level) : academyUpgradeCost(level);
      if (conf < 65) return decline("they want to see more progress first.");
      if (club.balance < cost * 1.5) return decline("it's too expensive right now.");
      club.balance -= cost;
      save.ledger.unshift({ season: save.leagues[0].season, week: save.calendarIndex + 1, label: `Board-funded ${ask === "training" ? "training ground" : "academy"} upgrade`, amount: -cost });
      if (ask === "training") club.facilities.training++;
      else club.academy++;
      return { ok: true, text: `The board approves the ${ask === "training" ? "training ground" : "academy"} upgrade to level ${level + 1}.` };
    }
    case "stadium": {
      const st = (club.stadium ??= defaultStadium(club));
      if (st.expansion) return decline("work is already under way.");
      const full = (st.lastAttendance ?? 0) >= st.capacity * 0.95;
      if (!full) return decline("the ground isn't selling out yet.");
      if (conf < 60 || club.balance < 2000 * SEAT_COST * 1.5) return decline("they can't justify it right now.");
      club.balance -= 2000 * SEAT_COST;
      save.ledger.unshift({ season: save.leagues[0].season, week: save.calendarIndex + 1, label: "Board-funded stadium expansion", amount: -2000 * SEAT_COST });
      st.expansion = { seats: 2000, weeksLeft: 8 };
      return { ok: true, text: "The board approves 2,000 extra seats. Work starts now and takes eight weeks." };
    }
  }
}

function formatMoneyShort(v: number) {
  return v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}m` : `£${Math.round(v / 1000)}k`;
}
