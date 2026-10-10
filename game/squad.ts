import { overall } from "./ratings";
import type { Player, SquadStatus } from "./types";

/** Share of minutes each squad status expects. */
export const STATUS_INFO: Record<SquadStatus, { label: string; expects: number; blurb: string }> = {
  key: { label: "Key player", expects: 0.85, blurb: "Expects to start almost every game." },
  regular: { label: "Regular starter", expects: 0.6, blurb: "Expects to start most games." },
  rotation: { label: "Squad rotation", expects: 0.35, blurb: "Happy with regular chances." },
  backup: { label: "Backup", expects: 0.1, blurb: "Accepts he'll play occasionally." },
  prospect: { label: "Hot prospect", expects: 0.15, blurb: "Wants some first-team minutes to develop." },
};

export const STATUS_ORDER: SquadStatus[] = ["key", "regular", "rotation", "backup", "prospect"];

/** Sensible statuses from the squad's pecking order. */
export function autoStatuses(squad: Player[]): Record<string, SquadStatus> {
  const out: Record<string, SquadStatus> = {};
  const ranked = [...squad].sort((a, b) => overall(b) - overall(a));
  ranked.forEach((p, i) => {
    const ovr = overall(p);
    if (p.age <= 20 && p.potential / 10 - ovr / 5 > 2 && i > 8) out[p.id] = "prospect";
    else out[p.id] = i < 4 ? "key" : i < 11 ? "regular" : i < 17 ? "rotation" : "backup";
  });
  return out;
}

export function recentShare(p: Player): number {
  const h = p.minutesHistory ?? [];
  if (!h.length) return STATUS_INFO[p.status ?? "rotation"].expects;
  return h.reduce((a, b) => a + b, 0) / h.length;
}

export interface MoraleEvent {
  playerId: string;
  kind: "unhappy" | "request" | "promiseKept" | "promiseBroken";
}

/**
 * Weekly morale from playing time vs status, promises, and transfer requests.
 * Mutates players; returns notable events for the inbox.
 */
export function weeklyMorale(squad: Player[], calendarIndex: number): MoraleEvent[] {
  const events: MoraleEvent[] = [];
  for (const p of squad) {
    if (p.loan) continue;
    const share = recentShare(p);
    const expects = STATUS_INFO[p.status ?? "rotation"].expects;
    if ((p.minutesHistory?.length ?? 0) >= 3) {
      const gap = share - expects;
      if (gap < -0.15) p.morale -= Math.min(5, -gap * 12);
      else if (gap > 0.1) p.morale += Math.min(2, gap * 6);
    }
    // promises come due
    if (p.promise && calendarIndex >= p.promise.until) {
      if (share >= expects - 0.1) {
        p.morale += 5;
        events.push({ playerId: p.id, kind: "promiseKept" });
      } else {
        p.morale -= 25;
        p.transferRequest = true;
        events.push({ playerId: p.id, kind: "promiseBroken" });
      }
      p.promise = undefined;
    }
    p.morale = Math.max(0, Math.min(100, p.morale));
    p.unhappyWeeks = p.morale < 35 ? (p.unhappyWeeks ?? 0) + 1 : 0;
    if (p.unhappyWeeks === 2) events.push({ playerId: p.id, kind: "unhappy" });
    if (p.unhappyWeeks >= 4 && !p.transferRequest && !p.promise) {
      p.transferRequest = true;
      events.push({ playerId: p.id, kind: "request" });
    }
  }
  return events;
}

/** Record this week's minutes (share of 90) for every squad member of a club that played. */
export function recordMinutes(squad: Player[], minutes: Record<string, number>) {
  for (const p of squad) {
    const share = Math.min(1, (minutes[p.id] ?? 0) / 90);
    p.minutesHistory = [...(p.minutesHistory ?? []), share].slice(-6);
  }
}

/** Promise playing time: a morale lift now, judged in six weeks. */
export function promisePlaytime(p: Player, calendarIndex: number) {
  p.promise = { kind: "playtime", until: calendarIndex + 6, made: calendarIndex };
  p.morale = Math.min(100, p.morale + 15);
  p.unhappyWeeks = 0;
  p.transferRequest = false;
}

/** Changing status: demotions sting, promotions please. */
export function setStatus(p: Player, status: SquadStatus) {
  const rank = (s: SquadStatus) => ({ key: 4, regular: 3, rotation: 2, prospect: 1.5, backup: 1 })[s];
  const d = rank(status) - rank(p.status ?? "rotation");
  p.morale = Math.max(0, Math.min(100, p.morale + (d < 0 ? d * 6 : d * 3)));
  p.status = status;
}
