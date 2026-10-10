"use client";

import { CAMP_COST, clubStrength, friendlyOptions, planFor, setPlan } from "@/game/calendar";
import { formatMoney } from "@/game/ratings";
import type { PreseasonPlan } from "@/game/save";
import { updateSave, useCareer } from "@/lib/store/save-store";
import { Card, Crest, cn } from "./ui";

/** Plan the pre-season weeks: friendlies (pick the opponent), a training camp, or rest. */
export function PreseasonCard() {
  const save = useCareer();
  const weeks = save.calendar.map((s, i) => ({ s, i })).filter((x) => x.s.kind === "preseason");
  if (!weeks.length || save.calendarIndex > weeks[weeks.length - 1].i) return null;
  const opts = friendlyOptions(save);
  const mine = clubStrength(save, save.userClubId);
  const planOf = (week: number): PreseasonPlan => planFor(save, week);
  const choose = (week: number, plan: PreseasonPlan) => updateSave((d) => setPlan(d, week, plan));

  return (
    <Card className="mb-4 p-4">
      <div className="mb-1 text-sm font-semibold">Pre-season</div>
      <p className="mb-3 text-xs text-muted">
        Players come back from the summer rusty. Friendlies restore match sharpness, a training camp ({formatMoney(CAMP_COST)}) builds cohesion and tactical familiarity, and rest tops up fitness.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {weeks.map(({ s, i }) => {
          const week = (s as { week: number }).week;
          const plan = planOf(week);
          const done = i < save.calendarIndex;
          const current = i === save.calendarIndex;
          const friendly = save.preseason.friendlies.find((f) => f.id.endsWith(`_${week}`) && f.result);
          return (
            <div key={i} className={cn("min-w-0 rounded-md border p-3", current ? "border-text" : "border-line", done && "opacity-60")}>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold">Week {week + 1}</span>
                {current && <span className="rounded bg-highlight px-1.5">This week</span>}
                {done && friendly?.result && (
                  <span className="tabular">
                    {friendly.result.homeGoals}–{friendly.result.awayGoals}
                  </span>
                )}
              </div>
              <select
                className="input h-8 w-full min-w-0 truncate py-0 text-xs"
                disabled={done}
                aria-label={`Pre-season week ${week + 1}`}
                value={plan.kind === "friendly" ? `f:${plan.opponentId}:${plan.home ? "h" : "a"}` : plan.kind}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "camp" || v === "rest") choose(week, { kind: v });
                  else {
                    const [, opponentId, ha] = v.split(":");
                    choose(week, { kind: "friendly", opponentId, home: ha === "h" });
                  }
                }}
              >
                {opts.flatMap((o) => [
                  <option key={`${o.club.id}h`} value={`f:${o.club.id}:h`}>
                    Friendly v {o.club.name} (home) · {o.strength > mine + 2 ? "stronger" : o.strength < mine - 2 ? "weaker" : "similar"}
                  </option>,
                  <option key={`${o.club.id}a`} value={`f:${o.club.id}:a`}>
                    Friendly at {o.club.name} (away)
                  </option>,
                ])}
                {plan.kind === "friendly" && !opts.some((o) => o.club.id === plan.opponentId) && (
                  <option value={`f:${plan.opponentId}:${plan.home ? "h" : "a"}`}>Friendly v {save.clubs[plan.opponentId]?.name}</option>
                )}
                <option value="camp">Training camp</option>
                <option value="rest">Rest and recovery</option>
              </select>
              {plan.kind === "friendly" && save.clubs[plan.opponentId] && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  <Crest design={save.clubs[plan.opponentId].crest} colors={save.clubs[plan.opponentId].colors} label={save.clubs[plan.opponentId].shortName} size={14} />
                  {save.clubs[plan.opponentId].name}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
