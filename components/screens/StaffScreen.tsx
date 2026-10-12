"use client";

import { fireStaff, hireStaff, STAFF_SEVERANCE_WEEKS, STAFF_SIGNING_WEEKS } from "@/game/club";
import { SKILL_LABELS, STAFF_INFO, STAFF_SKILLS } from "@/game/economy";
import { staffSkill } from "@/game/development";
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
      <Card className="mb-4 p-4">
        <h2 className="text-sm font-semibold">Choosing a fitness coach</h2>
        <p className="mt-1 text-sm text-muted">Compare Physical coaching for pace, stamina and strength development (it supplements your general coach), and Recovery for restoring fitness between matches. Overall is a quick summary; specialist skills drive the actual effects. Check wages and the total replacement cost too. The physio handles injury prevention and recovery from injury.</p>
        <p className="mt-2 text-xs text-muted">Work history records real appointments from this career. It gives context; previous employers do not add a performance bonus.</p>
      </Card>
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
                      <WorkHistory member={current} />
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
                  <span className="text-sm text-muted">{role === "fitnessCoach" ? "Vacant. Physical training uses your general coach; there is no specialist recovery bonus." : "Vacant. The role works as if filled by a 4/20."}</span>
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
                          {role === "fitnessCoach" && <div className="mt-1 text-[11px] text-muted">{["physical", "recovery"].map((skill) => {
                            const baseline = current ? staffSkill(club.staff, role, skill) : skill === "recovery" ? 10 : staffSkill(club.staff, "coach", "physical");
                            const difference = (s.skills?.[skill as keyof typeof s.skills] ?? s.rating) - baseline;
                            return <span key={skill} className="mr-3">{skill === "physical" ? "Physical" : "Recovery"} {difference > 0 ? "+" : ""}{difference} {current ? "vs current" : "vs baseline"}</span>;
                          })}</div>}
                          <WorkHistory member={s} />
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
  return (
    <span title={`Overall rating ${value} out of 20`} aria-label={`Overall rating ${value} out of 20`} className={cn("flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-line bg-surface font-semibold tabular", attrTextColor(value))}>
      <span className="text-[9px] font-normal text-muted">Overall</span>
      <span className="text-sm">{value}<span className="text-[9px] text-muted">/20</span></span>
    </span>
  );
}

/** Specialist skills (coaches and assistants). */
function Skills({ m }: { m: StaffMember }) {
  const keys = STAFF_SKILLS[m.role];
  if (!keys || !m.skills) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
      {keys.map((k) => (
        <span key={k} className="text-muted">
          {m.role === "fitnessCoach" && k === "physical" ? "Physical coaching" : SKILL_LABELS[k]} <span className={cn("font-semibold tabular", attrTextColor(m.skills?.[k as keyof typeof m.skills] ?? m.rating))}>{m.skills?.[k as keyof typeof m.skills] ?? m.rating}</span>
        </span>
      ))}
    </div>
  );
}

function WorkHistory({ member }: { member: StaffMember }) {
  if (!member.history?.length) return <p className="mt-1 text-[11px] text-muted">No previous appointments recorded.</p>;
  return <details className="mt-1 text-xs text-muted">
    <summary className="cursor-pointer underline-offset-2 hover:underline">Work history · {member.history.length} appointment{member.history.length === 1 ? "" : "s"}</summary>
    <ul className="mt-1 space-y-1">{[...member.history].reverse().map((job, i) => <li key={i}>
      <span className="font-medium text-text">{job.clubName}</span> · {STAFF_INFO[job.role].label}
      <span className="block text-[11px]">S{job.fromSeason} W{job.fromWeek} → {job.toSeason === undefined ? "Present" : `S${job.toSeason} W${job.toWeek}`}</span>
    </li>)}</ul>
  </details>;
}
