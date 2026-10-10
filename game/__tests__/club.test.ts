import { describe, expect, it } from "vitest";
import { completeRound, newCareer } from "../career";
import { academyUpgradeCost, addAssignment, fireStaff, hireStaff, maxAssignments, upgradeAcademy } from "../club";
import { dedupeShortNames } from "../generate";
import { knowledgeOf } from "../scouting";

const colors = { primary: "#fff", secondary: "#000" };
const fresh = (seed: number) => newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors, formation: "4-3-3", seed });

describe("club management", () => {
  it("hiring replaces the incumbent, charges fees and returns them to the market", () => {
    const save = fresh(5);
    const club = save.clubs[save.userClubId];
    club.balance = 50_000_000;
    const old = club.staff.coach!;
    const pick = save.staffMarket.find((s) => s.role === "coach")!;
    const before = club.balance;
    expect(hireStaff(save, pick.id).ok).toBe(true);
    expect(club.staff.coach?.id).toBe(pick.id);
    expect(save.staffMarket.some((s) => s.id === old.id)).toBe(true);
    expect(save.staffMarket.some((s) => s.id === pick.id)).toBe(false);
    expect(club.balance).toBeLessThan(before);
    expect(save.ledger[0].amount).toBeLessThan(0);
    expect(fireStaff(save, "coach").ok).toBe(true);
    expect(club.staff.coach).toBeUndefined();
  });

  it("academy upgrades cost money and cap at level 5", () => {
    const save = fresh(6);
    const club = save.clubs[save.userClubId];
    club.balance = 0;
    expect(upgradeAcademy(save).ok).toBe(false);
    club.balance = 500_000_000;
    const lvl = club.academy;
    const cost = academyUpgradeCost(lvl);
    if (lvl < 5) {
      expect(upgradeAcademy(save).ok).toBe(true);
      expect(club.academy).toBe(lvl + 1);
      expect(club.balance).toBe(500_000_000 - cost);
    }
    while (club.academy < 5) upgradeAcademy(save);
    expect(upgradeAcademy(save).ok).toBe(false);
  });

  it("scout assignments are capped and produce knowledge after a week", () => {
    let save = fresh(7);
    save.scouting.assignments = [];
    const cap = maxAssignments(save);
    expect(addAssignment(save, "position", "ATT").ok).toBe(true);
    expect(addAssignment(save, "position", "ATT").ok).toBe(false);
    for (const v of ["GK", "DEF", "MID", "ATT"].slice(0, cap)) addAssignment(save, "position", v);
    expect(save.scouting.assignments.length).toBeLessThanOrEqual(cap);
    const known = (s: typeof save) => Object.values(s.players).filter((p) => p.clubId !== s.userClubId).reduce((a, p) => a + knowledgeOf(s, p), 0);
    const before = known(save);
    save = completeRound(save);
    expect(known(save)).toBeGreaterThan(before);
  }, 30_000);

  it("every club gets a unique short name, and old saves are repaired", () => {
    for (const seed of [1, 2, 3, 31, 99]) {
      const save = fresh(seed);
      const names = Object.values(save.clubs).map((c) => c.shortName);
      expect(new Set(names).size).toBe(names.length);
      const [a, b] = Object.values(save.clubs);
      b.shortName = a.shortName;
      dedupeShortNames(save.clubs);
      expect(new Set(Object.values(save.clubs).map((c) => c.shortName)).size).toBe(names.length);
      expect(save.clubs[save.userClubId].shortName).toBe("TST");
    }
  });
});
