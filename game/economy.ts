import { COACH_AREAS, deriveSkills } from "./development";
import { overall } from "./ratings";
import type { Rng } from "./rng";
import type { Contract, Player, SquadStatus, StaffMember, StaffRole } from "./types";

/**
 * Money: wages, contract demands, willingness to join, staff and weekly
 * club income. Numbers are tuned so a mid-table club roughly breaks even.
 */

/** Weekly wage a player of this level commands. */
export function marketWage(ovr: number, age: number, tier = 2): number {
  const base = Math.pow(Math.max(ovr - 35, 2), 2.3) * 9;
  const ageF = age >= 32 ? 0.8 : age <= 20 ? 0.6 : 1;
  const tierF = tier === 1 ? 1.25 : 1;
  return Math.max(500, Math.round((base * ageF * tierF) / 50) * 50);
}

export function contractYears(age: number): number {
  return age <= 22 ? 4 : age <= 28 ? 3 : age <= 31 ? 2 : 1;
}

export function newContract(p: Pick<Player, "attributes" | "positions" | "age">, season: number, tier: number, rng?: Rng): Contract {
  const ovr = overall(p as Player);
  const years = contractYears(p.age) - (rng ? rng.int(0, 1) : 0);
  return { wage: marketWage(ovr, p.age, tier), expires: season + Math.max(0, years - 1) };
}

const STATUS_WAGE: Record<SquadStatus, number> = { key: 1.25, regular: 1, rotation: 0.85, backup: 0.7, prospect: 0.6 };

/** What a player asks for to sign or renew. */
export function contractDemand(p: Player, opts: { tier: number; status?: SquadStatus; season: number }): { wage: number; years: number } {
  const ovr = overall(p);
  let wage = marketWage(ovr, p.age, opts.tier) * STATUS_WAGE[opts.status ?? p.status];
  if (p.morale < 40) wage *= 1.15; // an unhappy player wants paying to stay
  if (p.transferRequest) wage *= 1.25;
  // never take a pay cut to renew unless he's old
  if (p.age < 31) wage = Math.max(wage, p.contract?.wage ?? 0);
  return { wage: Math.round(wage / 50) * 50, years: contractYears(p.age) };
}

/** Will he accept these terms? */
export function acceptsTerms(p: Player, offer: { wage: number; years: number }, demand: { wage: number; years: number }): { ok: boolean; reason?: string } {
  if (offer.wage < demand.wage * 0.95) return { ok: false, reason: `He wants at least £${Math.round(demand.wage / 1000)}k a week.` };
  if (p.age >= 31 && offer.years > 2) return { ok: false, reason: "At his age he only wants a short deal." };
  if (offer.years < 1 || offer.years > 5) return { ok: false, reason: "Contracts run 1–5 years." };
  return { ok: true };
}

/**
 * 0–1: how keen a player is to join a club. Ambitious players won't drop to a
 * much smaller club; everyone likes joining a bigger one.
 */
export function interest(p: Player, from: { reputation: number }, to: { reputation: number; strength: number }, managerRep: number): number {
  const ovr = overall(p);
  const stepUp = (to.reputation - from.reputation) / 40; // -1 (big drop) … +1 (big move)
  const tooGood = Math.max(0, (ovr - to.strength - 6) / 15); // would he be a star in a weak team?
  const keen = 0.65 + stepUp * 0.5 - tooGood * 0.6 + (managerRep - 50) / 250;
  return Math.max(0, Math.min(1, keen));
}

// ───────────── staff ─────────────

const STAFF_FIRST = ["Alan", "Marta", "Pep", "Diego", "Kofi", "Lena", "Sven", "Rui", "Ola", "Tomas", "Mika", "Femi", "Ines", "Jurgen", "Carlo", "Yaw"];
const STAFF_LAST = ["Harding", "Okoro", "Lindqvist", "Ferreira", "Mensah", "Brandt", "Costa", "Ivanova", "Moreau", "Ruiz", "Adeyemi", "Kowalski", "Byrne", "Sato"];

export const STAFF_INFO: Record<StaffRole, { label: string; effect: string }> = {
  assistant: { label: "Assistant manager", effect: "Spots more during matches and gives better advice; runs delegated duties." },
  coach: { label: "First-team coach", effect: "Players develop faster in training." },
  scout: { label: "Chief scout", effect: "Scouts more players each week and judges potential more accurately." },
  physio: { label: "Head physio", effect: "Fewer training injuries and quicker recoveries." },
  gkCoach: { label: "Goalkeeping coach", effect: "Keepers develop faster." },
  fitnessCoach: { label: "Fitness coach", effect: "Physical attributes develop faster; better recovery." },
  analyst: { label: "Data analyst", effect: "Sharper opposition reports and in-match insight." },
  youthCoach: { label: "Youth coach", effect: "Under-20s develop faster; better academy prospects." },
};

export function staffWage(rating: number): number {
  return Math.round((rating * rating * 40) / 50) * 50;
}

/** Which specialist skills each staff role has. */
export const STAFF_SKILLS: Partial<Record<StaffRole, string[]>> = {
  coach: [...COACH_AREAS, "judging"],
  assistant: ["tactical", "judging", "motivating"],
  fitnessCoach: ["physical", "recovery"],
};

export const SKILL_LABELS: Record<string, string> = {
  attacking: "Attacking",
  technical: "Technical",
  defending: "Defending",
  tactical: "Tactical",
  physical: "Fitness",
  recovery: "Recovery",
  goalkeeping: "Goalkeeping",
  judging: "Judging potential",
  motivating: "Motivating",
};

export function withSkills(m: StaffMember): StaffMember {
  const keys = STAFF_SKILLS[m.role];
  if (keys && !m.skills) m.skills = deriveSkills(m.id, m.rating, keys);
  return m;
}

export function generateStaff(rng: Rng, role: StaffRole, rating: number): StaffMember {
  const r = Math.max(1, Math.min(20, Math.round(rating)));
  return withSkills({
    id: `s_${rng.fork().toString(36)}`,
    name: `${rng.pick(STAFF_FIRST)} ${rng.pick(STAFF_LAST)}`,
    role,
    rating: r,
    wage: staffWage(r),
    history: [],
  });
}

/** Staff level a club of this reputation can attract. */
export function staffLevel(reputation: number): number {
  return 5 + (reputation / 100) * 10;
}

/** Staff rating used by game systems (missing staff counts as poor). */
export function staffRating(staff: Partial<Record<StaffRole, StaffMember>> | undefined, role: StaffRole): number {
  return staff?.[role]?.rating ?? 4;
}

// ───────────── weekly club finances ─────────────

export interface WeekMoney {
  lines: { label: string; amount: number }[];
  total: number;
}

export function weeklyIncome(rep: number, tier: number, opts: { homeGame: boolean; leagueWeek: boolean; gate?: number }): { label: string; amount: number }[] {
  const lines: { label: string; amount: number }[] = [];
  lines.push({ label: "Sponsorship", amount: Math.round(rep * (tier === 1 ? 2600 : 1800)) });
  if (opts.leagueWeek) lines.push({ label: "TV & broadcast", amount: tier === 1 ? 200_000 : 60_000 });
  if (opts.homeGame) lines.push({ label: "Gate receipts", amount: Math.round(opts.gate ?? 60_000 + rep * (tier === 1 ? 4000 : 3000)) });
  return lines;
}

/**
 * Running costs: stadium, travel, admin and facility upkeep. Sized so a
 * typical club roughly breaks even over a season (prize money and transfers
 * decide whether it's a good year), checked with scripts/longrun.ts.
 */
export function weeklyCosts(rep: number, tier: number, facilities: { training: number; academy: number }): { label: string; amount: number }[] {
  const operating = (tier === 1 ? 120_000 : 30_000) + rep * (tier === 1 ? 1800 : 1500);
  const upkeep = (facilities.training + facilities.academy) * 4000;
  return [
    { label: "Operating costs", amount: -Math.round(operating / 1000) * 1000 },
    { label: "Facilities upkeep", amount: -upkeep },
  ];
}
