import { describe, expect, it } from "vitest";
import { acceptOffer, askingPrice, buyPlayer, evaluateBid, isWindowOpen } from "../transfers";
import { completeRound, newCareer, squadOf } from "../career";
import { overall } from "../ratings";

const user = { name: "Test FC", shortName: "TST", colors: { primary: "#fff", secondary: "#000" }, formation: "4-3-3" as const };

describe("transfers", () => {
  const fresh = () => newCareer({ managerName: "T", clubName: "Test FC", shortName: "TST", colors: user.colors, formation: "4-4-2", seed: 21 });

  it("rejects lowball bids and accepts bids at the asking price", () => {
    const save = fresh();
    const target = Object.values(save.players).find((p) => p.clubId !== save.userClubId && !save.clubs[p.clubId].tactics.lineup.includes(p.id))!;
    const asking = askingPrice(save, target);
    expect(evaluateBid(save, target.id, Math.round(asking * 0.3)).kind).toBe("rejected");
    save.clubs[save.userClubId].balance = asking * 3;
    const sellerId = target.clubId;
    const before = save.clubs[sellerId].balance;
    // step 1: fee agreed → personal terms needed
    const step1 = buyPlayer(save, target.id, asking * 2);
    expect(step1.ok).toBe(false);
    expect("stage" in step1 && step1.stage).toBe("terms");
    const demand = "demand" in step1 ? step1.demand : { wage: 0, years: 1 };
    // a stingy wage is turned down
    const stingy = buyPlayer(save, target.id, asking * 2, { wage: Math.round(demand.wage * 0.5), years: demand.years });
    expect(stingy.ok).toBe(false);
    // step 2: meet his demands
    const res = buyPlayer(save, target.id, asking * 2, demand);
    expect(res.ok).toBe(true);
    expect(save.players[target.id].contract.wage).toBe(demand.wage);
    expect(save.players[target.id].clubId).toBe(save.userClubId);
    expect(save.clubs[sellerId].balance).toBe(before + asking * 2);
    expect(save.clubs[save.userClubId].balance).toBe(asking);
    expect(save.transferLog[0].playerId).toBe(target.id);
  });

  it("can't buy with the window closed or without funds", () => {
    const save = fresh();
    const target = Object.values(save.players).find((p) => p.clubId !== save.userClubId)!;
    save.clubs[save.userClubId].balance = 0;
    expect(buyPlayer(save, target.id, 1_000_000).ok).toBe(false);
    for (const l of save.leagues) l.currentRound = 6;
    expect(isWindowOpen(save)).toBe(false);
  });

  it("AI clubs bid for listed players and accepting sells them", () => {
    let save = fresh();
    // a mid-ranking squad player: clubs at his level will bid
    const ranked = squadOf(save, save.userClubId).sort((a, b) => overall(b) - overall(a));
    const mine = ranked[Math.floor(ranked.length / 2)];
    save.transferList = [mine.id];
    for (let i = 0; i < 4 && !save.offers.length; i++) save = completeRound(save);
    expect(save.offers.length).toBeGreaterThan(0);
    const offer = save.offers[0];
    const res = acceptOffer(save, offer.id);
    expect(res.ok).toBe(true);
    expect(save.players[offer.playerId].clubId).toBe(offer.fromClubId);
    expect(save.clubs[save.userClubId].tactics.lineup).not.toContain(offer.playerId);
  }, 60_000);
});
