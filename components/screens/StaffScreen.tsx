"use client";

import { fireStaff, hireStaff, STAFF_SEVERANCE_WEEKS, STAFF_SIGNING_WEEKS } from "@/game/club";
import { SKILL_LABELS, STAFF_INFO, STAFF_SKILLS } from "@/game/economy";
import { formatMoney } from "@/game/ratings";
import type { StaffMember, StaffRole } from "@/game/types";
import { act, useCareer } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { Button, Card, PageHeader, StatTile, attrTextColor, cn } from "../ui";

const ROLES: StaffRole[] = ["assistant", "coach", "scout", "physio", "gkCoach", "fitnessCoach", "analyst", "youthCoach"];

export function StaffScreen() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const total = ROLES.reduce((a, r) => a + (club.staff[r]?.wage ?? 0), 0);
  return (
    <div>
      <PageHeader
        eyebrow="Club"
        title="Staff"
        subtitle={`New staff cost ${STAFF_SIGNING_WEEKS} weeks' wages to sign. Replacing or sacking someone costs ${STAFF_SEVERANCE_WEEKS} weeks' wages in compensation. Better clubs attract better staff; the market refreshes each summer.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Staff wages" value={`${formatMoney(total)}/wk`} />
        <StatTile label="Balance" value={formatMoney(club.balance)} />
        <StatTile label="Club reputation" value={Math.round(club.reputation)} hint="Drives who will work for you" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((role) => {
          const current = club.staff[role];
          const market = save.staffMarket.filter((s) => s.role === role).sort((a, b) => b.rating - a.rating);
          return (
            <Card key={role} className="flex flex-col">
              <div className="px-4 pt-3.5 pb-3">
                <div className="eyebrow">{STAFF_INFO[role].label}</div>
                <p className="mt-1 text-xs text-muted">{STAFF_INFO[role].effect}</p>
              </div>
              <div className="mx-4 mb-3 flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
                {current ? (
                  <>
                    <Rating value={current.rating} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{current.name}</div>
                      <div className="text-xs text-muted">{formatMoney(current.wage)}/wk</div>
                      <Skills m={current} />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!confirm(`Sack ${current.name}? Compensation: ${formatMoney(current.wage * STAFF_SEVERANCE_WEEKS)}.`)) return;
                        const r = act((d) => fireStaff(d, role));
                        toast(r.ok ? `${current.name} has left the club.` : (r.reason ?? ""), r.ok ? "info" : "bad");
                      }}
                    >
                      Sack
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-muted">Vacant. The role works as if filled by a 4/20.</span>
                )}
              </div>
              <div className="border-t border-line px-4 py-2">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Available</div>
                {market.length === 0 && <p className="py-2 text-sm text-muted">Nobody available until the summer.</p>}
                <ul className="divide-y divide-line">
                  {market.map((s) => {
                    const fee = s.wage * STAFF_SIGNING_WEEKS + (current ? current.wage * STAFF_SEVERANCE_WEEKS : 0);
                    const better = !current || s.rating > current.rating;
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-2">
                        <Rating value={s.rating} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">{s.name}</div>
                          <div className="text-xs text-muted">
                            {formatMoney(s.wage)}/wk · upfront {formatMoney(fee)}
                          </div>
                          <Skills m={s} />
                        </div>
                        <Button
                          size="sm"
                          variant={better ? "primary" : "secondary"}
                          disabled={club.balance < fee}
                          onClick={() => {
                            const r = act((d) => hireStaff(d, s.id));
                            toast(r.ok ? `${s.name} joins as ${STAFF_INFO[role].label.toLowerCase()}.` : (r.reason ?? ""), r.ok ? "good" : "bad");
                          }}
                        >
                          {current ? "Replace" : "Hire"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Rating({ value }: { value: number }) {
  return <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-sm font-semibold tabular", attrTextColor(value))}>{value}</span>;
}

/** Specialist skills (coaches and assistants). */
function Skills({ m }: { m: StaffMember }) {
  const keys = STAFF_SKILLS[m.role];
  if (!keys || !m.skills) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
      {keys.map((k) => (
        <span key={k} className="text-muted">
          {SKILL_LABELS[k]} <span className={cn("font-semibold tabular", attrTextColor(m.skills?.[k as keyof typeof m.skills] ?? m.rating))}>{m.skills?.[k as keyof typeof m.skills] ?? m.rating}</span>
        </span>
      ))}
    </div>
  );
}
