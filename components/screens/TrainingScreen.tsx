"use client";

import { Fragment, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { squadOf } from "@/game/career";
import { ATTRIBUTE_LABELS, TRAINING_FOCUS } from "@/game/constants";
import { SKILL_LABELS, staffRating } from "@/game/economy";
import { COACH_AREAS, coachSkills } from "@/game/development";
import { developmentReport, perceivedPotential, type DevReportLine } from "@/game/progress";
import type { SaveGame } from "@/game/save";
import { Sparkline } from "../charts";
import { currentAbility, overall, traitBand } from "@/game/ratings";
import type { MatchPrepFocus, Player, Position, TrainingFocus, TrainingIntensity } from "@/game/types";
import { updateSave, useCareer, useOnboarding } from "@/lib/store/save-store";
import { ALL_POSITIONS, PlayerLink, PotentialStars } from "../PlayerParts";
import { ButtonLink, Card, CardHeader, Meter, Ovr, PageHeader, PosBadge, Segmented, StatTile, Tabs, Tag, attrTextColor, cn } from "../ui";

const FOCUS_BLURB: Record<TrainingFocus, string> = {
  balanced: "Even development across every area.",
  attacking: "Sharper finishing, dribbling and composure.",
  defending: "Better tackling, marking, heading and positioning.",
  physical: "Pace, stamina and strength. Players tire less.",
  technical: "Passing, dribbling and vision. Keepers improve too.",
  tactical: "Decision making, work rate and positioning.",
};

const INTENSITY: Record<TrainingIntensity, { blurb: string; settles: number }> = {
  light: { blurb: "Slow growth, quick recovery, very low injury risk.", settles: 97 },
  normal: { blurb: "Steady growth and normal recovery.", settles: 92 },
  intense: { blurb: "Fastest growth, but players recover slowly and pick up more knocks.", settles: 80 },
};

type Filter = "all" | "young" | "plans";

type View = "plan" | "development";

export function TrainingScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const view = (params.get("view") as View) || "plan";
  useOnboarding("training");
  return (
    <div>
      <PageHeader eyebrow="Team" title="Training" subtitle="The team plan runs every week. Individual plans add a personal focus, a new position to learn, or a senior mentor." />
      <Tabs
        value={view}
        onChange={(v) => router.replace(v === "plan" ? "/training" : `/training?view=${v}`)}
        options={[
          { value: "plan", label: "Plan" },
          { value: "development", label: "Development" },
        ]}
        className="mb-4"
      />
      {view === "plan" ? <PlanView /> : <DevelopmentView />}
    </div>
  );
}

function PlanView() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const plan = save.training;
  const squad = squadOf(save, club.id);
  const [filter, setFilter] = useState<Filter>("all");
  const avgFitness = squad.reduce((a, p) => a + p.fitness, 0) / squad.length;
  const lastReport = save.inbox.find((m) => m.title === "Training report");
  const coach = staffRating(club.staff, "coach");
  const physio = staffRating(club.staff, "physio");
  const withPlans = squad.filter((p) => p.focus || p.retrain || p.mentorId).length;
  const delegated = save.delegation.training;

  const rows = squad
    .filter((p) => (filter === "young" ? p.age <= 23 : filter === "plans" ? p.focus || p.retrain || p.mentorId : true))
    .sort((a, b) => (filter === "young" ? stars(save, b) - stars(save, a) : order(a) - order(b) || overall(b) - overall(a)));

  function set(fn: (d: typeof plan) => void) {
    updateSave((d) => fn(d.training));
  }

  const skills = coachSkills(club.staff);
  const prep = FOCUS_PREP[save.training.matchPrep ?? "none"];
  return (
    <div>
      {delegated && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-highlight px-4 py-2.5 text-sm">
          <span>Your assistant is setting the team plan each week. Individual plans still apply.</span>
          <ButtonLink href="/settings" size="sm" variant="ghost">
            Take it back
          </ButtonLink>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Squad fitness" value={`${Math.round(avgFitness)}%`} />
        <StatTile label="First-team coach" value={`${coach}/20`} hint="Overall; see area skills below" />
        <StatTile label="Head physio" value={`${physio}/20`} hint="Recovery and knocks" />
        <StatTile label="Individual plans" value={withPlans} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className={cn(delegated && "pointer-events-none opacity-60")}>
          <CardHeader title="Team focus" subtitle="Attributes in the focus grow about 2.5× faster." />
          <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3">
            {(Object.keys(TRAINING_FOCUS) as TrainingFocus[]).map((f) => (
              <button key={f} onClick={() => set((d) => (d.focus = f))} aria-pressed={plan.focus === f} className={cn("rounded-md border p-3 text-left transition", plan.focus === f ? "border-text bg-highlight" : "border-line hover:border-text/50")}>
                <div className="text-sm font-semibold">{TRAINING_FOCUS[f].label}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{FOCUS_BLURB[f]}</div>
                {TRAINING_FOCUS[f].keys.length > 0 && <div className="mt-2 text-[10px] text-muted">{TRAINING_FOCUS[f].keys.map((k) => ATTRIBUTE_LABELS[k]).join(" · ")}</div>}
              </button>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className={cn("p-4", delegated && "pointer-events-none opacity-60")}>
            <div className="mb-3 text-sm font-semibold">Intensity</div>
            <Segmented
              value={plan.intensity}
              onChange={(v) => set((d) => (d.intensity = v))}
              options={[
                { value: "light", label: "Light" },
                { value: "normal", label: "Normal" },
                { value: "intense", label: "Intense" },
              ]}
            />
            <p className="mt-3 text-sm text-muted">{INTENSITY[plan.intensity].blurb}</p>
            <p className="mt-1 text-xs text-muted">Regular starters settle around {INTENSITY[plan.intensity].settles}% fitness.</p>
            <Meter value={avgFitness} className="mt-3" label="Squad fitness" />
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold">Match preparation</span>
              <ButtonLink href="/prep" size="sm" variant="ghost">
                Set up
              </ButtonLink>
            </div>
            <p className="text-sm">{prep.label}</p>
            <p className="text-xs text-muted">{prep.blurb}</p>
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold">Coaching & facilities</div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
              {COACH_AREAS.map((a) => (
                <Fragment key={a}>
                  <dt className="text-muted">{SKILL_LABELS[a]} coaching</dt>
                  <dd className={cn("tabular font-medium", attrTextColor(skills[a]))}>{skills[a]}</dd>
                </Fragment>
              ))}
              <dt className="mt-1 text-muted">Training ground</dt>
              <dd className="mt-1 tabular font-medium">{club.facilities.training}/5</dd>
              <dt className="text-muted">Youth academy</dt>
              <dd className="tabular font-medium">{club.academy}/5</dd>
            </dl>
            <p className="mt-2 text-[11px] text-muted">Each area&apos;s coaching speeds up the attributes it trains. Upgrade facilities on the Finances page; hire coaches on the Staff page.</p>
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold">Last report</div>
            <p className="whitespace-pre-line text-sm text-muted">{lastReport ? lastReport.body : "Training reports appear here after each week."}</p>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div>
            <div className="text-sm font-semibold">Individual plans</div>
            <div className="text-xs text-muted">Personal focus triples growth in those attributes. Young, intelligent players learn new positions fastest. Mentors are 27+ and pass on composure and consistency to players aged 23 or under.</div>
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Everyone" },
              { value: "young", label: "23 and under" },
              { value: "plans", label: "With plans" },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Player</th>
                <th className="num">Age</th>
                <th className="num">OVR</th>
                <th>Pot.</th>
                <th className="num">Fit</th>
                <th>Personal focus</th>
                <th>Learn position</th>
                <th>Mentor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <PlanRow key={p.id} p={p} squad={squad} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted">
                    Nobody here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const FOCUS_PREP: Record<MatchPrepFocus, { label: string; blurb: string }> = {
  none: { label: "None", blurb: "All training time goes on development." },
  familiarity: { label: "Tactical familiarity", blurb: "Drilling the current system. Costs about a fifth of the week's development." },
  setPiecesAttack: { label: "Attacking set pieces", blurb: "More dangerous corners and free kicks this match." },
  setPiecesDefence: { label: "Defending set pieces", blurb: "Their set pieces are less dangerous this match." },
  opposition: { label: "Opposition analysis", blurb: "Better report and more effective opposition instructions." },
};

const stars = (save: SaveGame, p: Player) => {
  const [lo, hi] = perceivedPotential(save, p);
  return lo + hi;
};

const POS_ORDER: Position[] = ["GK", "CB", "LB", "RB", "DM", "CM", "LM", "RM", "AM", "LW", "RW", "ST"];
const order = (p: Player) => POS_ORDER.indexOf(p.positions[0]);

function PlanRow({ p, squad }: { p: Player; squad: Player[] }) {
  const save = useCareer();
  const set = (fn: (d: Player) => void) => updateSave((s) => fn(s.players[p.id]));
  const mentors = squad.filter((m) => m.age >= 27 && m.id !== p.id);
  return (
    <tr>
      <td>
        <PosBadge pos={p.positions[0]} />
      </td>
      <td className="whitespace-nowrap">
        <PlayerLink p={p} />
        {p.injuryWeeks > 0 && <span className="ml-1 text-[10px] text-loss-ink">INJ</span>}
      </td>
      <td className="num">{p.age}</td>
      <td className="num">
        <Ovr value={overall(p)} />
      </td>
      <td>
        <PotentialStars save={save} p={p} />
      </td>
      <td className={cn("num", p.fitness < 75 && "text-loss-ink")}>{Math.round(p.fitness)}%</td>
      <td>
        <select className="input h-8 w-36 py-0 text-xs" aria-label={`Personal focus for ${p.lastName}`} value={p.focus ?? ""} onChange={(e) => set((d) => void (d.focus = (e.target.value || undefined) as TrainingFocus | undefined))}>
          <option value="">None</option>
          {(Object.keys(TRAINING_FOCUS) as TrainingFocus[])
            .filter((f) => f !== "balanced")
            .map((f) => (
              <option key={f} value={f}>
                {TRAINING_FOCUS[f].label}
              </option>
            ))}
        </select>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <select
            className="input h-8 w-28 py-0 text-xs"
            aria-label={`New position for ${p.lastName}`}
            value={p.retrain?.pos ?? ""}
            onChange={(e) => set((d) => void (d.retrain = e.target.value ? { pos: e.target.value as Position, progress: 0 } : undefined))}
          >
            <option value="">—</option>
            {ALL_POSITIONS.filter((x) => !p.positions.includes(x)).map((x) => (
              <option key={x} value={x}>
                {x} ({overall(p, x)})
              </option>
            ))}
          </select>
          {p.retrain && <span className="text-[11px] text-muted tabular">{Math.round(p.retrain.progress)}%</span>}
        </div>
      </td>
      <td>
        {p.age <= 23 ? (
          <select className="input h-8 w-36 py-0 text-xs" aria-label={`Mentor for ${p.lastName}`} value={p.mentorId ?? ""} onChange={(e) => set((d) => void (d.mentorId = e.target.value || undefined))}>
            <option value="">None</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName[0]}. {m.lastName} ({m.age})
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

const VERDICT: Record<DevReportLine["verdict"], { label: string; tone: "good" | "bad" | "neutral" | "highlight" }> = {
  flying: { label: "Flying", tone: "highlight" },
  progressing: { label: "Progressing", tone: "good" },
  steady: { label: "Steady", tone: "neutral" },
  stalling: { label: "Stalling", tone: "bad" },
  declining: { label: "Declining", tone: "bad" },
};

/** The coach's development view: who's growing, who's stalling and why. */
function DevelopmentView() {
  const save = useCareer();
  const lines = new Map(developmentReport(save).map((l) => [l.playerId, l]));
  const squad = squadOf(save, save.userClubId).sort((a, b) => a.age - b.age);
  const [sort, setSort] = useState<"age" | "season" | "recent">("age");
  const seasonChange = (p: Player) => {
    const log = save.dev[p.id];
    return log ? currentAbility(p) - log.startCA : 0;
  };
  const rows = [...squad].sort((a, b) =>
    sort === "season" ? seasonChange(b) - seasonChange(a) : sort === "recent" ? (lines.get(b.id)?.change ?? 0) - (lines.get(a.id)?.change ?? 0) : a.age - b.age,
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div>
          <div className="text-sm font-semibold">Squad development</div>
          <div className="text-xs text-muted">Ability change this season and over the last four weeks, with the coach&apos;s verdict. Potential is your coaches&apos; estimate.</div>
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: "age", label: "By age" },
            { value: "season", label: "This season" },
            { value: "recent", label: "Last 4 weeks" },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Player</th>
              <th className="num">Age</th>
              <th className="num">OVR</th>
              <th>Potential</th>
              <th className="num">Season</th>
              <th className="num">4 wks</th>
              <th>Trend</th>
              <th>Professionalism</th>
              <th>Coach says</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const l = lines.get(p.id);
              const sc = seasonChange(p);
              const log = save.dev[p.id];
              return (
                <tr key={p.id}>
                  <td>
                    <PosBadge pos={p.positions[0]} />
                  </td>
                  <td className="whitespace-nowrap">
                    <PlayerLink p={p} />
                  </td>
                  <td className="num">{p.age}</td>
                  <td className="num">
                    <Ovr value={overall(p)} />
                  </td>
                  <td>
                    <PotentialStars save={save} p={p} />
                  </td>
                  <td className={cn("num tabular", sc > 0.5 ? "text-win-ink" : sc < -0.5 ? "text-loss-ink" : "text-muted")}>{sc > 0 ? "+" : ""}{sc.toFixed(1)}</td>
                  <td className={cn("num tabular", (l?.change ?? 0) > 0.3 ? "text-win-ink" : (l?.change ?? 0) < -0.3 ? "text-loss-ink" : "text-muted")}>{l ? `${l.change > 0 ? "+" : ""}${l.change.toFixed(1)}` : "–"}</td>
                  <td>{log && log.points.length > 1 ? <Sparkline values={log.points.slice(-16).map((x) => x[1])} width={80} height={22} /> : <span className="text-xs text-muted">–</span>}</td>
                  <td className="text-xs">{traitBand("professionalism", p.traits.professionalism)}</td>
                  <td className="text-xs">
                    {l ? (
                      <>
                        <Tag tone={VERDICT[l.verdict].tone}>{VERDICT[l.verdict].label}</Tag>
                        {l.reason && <span className="ml-1.5 text-muted">{l.reason}</span>}
                      </>
                    ) : (
                      <span className="text-muted">Not enough data yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-muted">Changes are in ability points (about two per OVR point). Young players grow fastest with minutes, good coaching and a professional attitude; most stop improving in their mid-twenties.</p>
    </Card>
  );
}
