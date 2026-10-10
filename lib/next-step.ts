import { prepFixtureId } from "@/game/prep";
import { isSeasonOver, userSlotFixture, weekLabel } from "@/game/career";
import type { SaveGame } from "@/game/save";

export type NextStep =
  | { kind: "jobs"; label: string; href: string }
  | { kind: "season"; label: string }
  | { kind: "resume"; label: string; href: string }
  | { kind: "play"; label: string; href: string; sub: string }
  | { kind: "advance"; label: string; sub: string };

/** The single most important thing to do next (the Continue button). */
export function nextStep(save: SaveGame): NextStep {
  if (save.jobOffers) return { kind: "jobs", label: "Choose your next job", href: "/jobs" };
  if (isSeasonOver(save)) return { kind: "season", label: `Start season ${save.leagues[0].season + 1}` };
  const mine = userSlotFixture(save);
  if (mine && save.liveMatch?.fixtureId === mine.fixture.id && save.liveMatch.tick > 0) {
    return { kind: "resume", label: `Resume match · ${Math.min(90, Math.floor(save.liveMatch.tick / 60))}′`, href: "/match" };
  }
  if (mine) {
    const opp = save.clubs[mine.fixture.homeId === save.userClubId ? mine.fixture.awayId : mine.fixture.homeId];
    return { kind: "play", label: `Play ${mine.label}`, href: "/match", sub: `${mine.fixture.homeId === save.userClubId ? "vs" : "at"} ${opp.name}` };
  }
  return { kind: "advance", label: "Continue", sub: weekLabel(save) };
}

export interface PendingItem {
  label: string;
  /** Link target, or "press" to open the press conference. */
  href: string | "press";
  tone: "warn" | "info";
}

/** Things waiting for the manager (shown as chips beside Continue). */
export function pendingItems(save: SaveGame): PendingItem[] {
  const out: PendingItem[] = [];
  if (save.press) out.push({ label: "Press conference", href: "/media", tone: "info" });
  if (save.requests?.length) out.push({ label: `${save.requests.length} player${save.requests.length > 1 ? "s want" : " wants"} a word`, href: "/dynamics", tone: "info" });
  if (save.youthIntake?.players.length) out.push({ label: `Youth intake (${save.youthIntake.players.length})`, href: "/youth", tone: "info" });
  if (save.offers.length) out.push({ label: `Offers (${save.offers.length})`, href: "/transfers?tab=offers", tone: "info" });
  const unhappy = Object.values(save.players).filter((p) => p.clubId === save.userClubId && (p.transferRequest || p.unhappyWeeks >= 2)).length;
  if (unhappy) out.push({ label: `${unhappy} unhappy`, href: "/squad?view=morale", tone: "warn" });
  const season = save.leagues[0].season;
  const expiring = Object.values(save.players).filter((p) => p.clubId === save.userClubId && !p.loan && p.contract.expires <= season).length;
  if (expiring) out.push({ label: `${expiring} contract${expiring > 1 ? "s" : ""} expiring`, href: "/squad?view=contracts", tone: "warn" });
  const fixtureId = prepFixtureId(save);
  if (fixtureId && save.prep?.fixtureId !== fixtureId && !save.liveMatch) out.push({ label: "Opposition report", href: "/prep", tone: "info" });
  return out;
}
