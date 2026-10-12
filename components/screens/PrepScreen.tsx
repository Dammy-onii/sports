"use client";

import Link from "next/link";
import { familiarityLabel, INSTRUCTION_KEYS } from "@/game/familiarity";
import { FORMATIONS as FORMATION_SLOTS, INSTRUCTION_LABELS } from "@/game/constants";
import { oppositionReport, recommendedInstructions, squadReadiness, type OppositionReport } from "@/game/prep";
import { fmtRange, knowledgeOf, ovrRange } from "@/game/scouting";
import type { MatchPrepFocus, OppInstruction, Player } from "@/game/types";
import { updateSave, useCareer } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { PlayerLink } from "../PlayerParts";
import { TrainingTiming } from "../TrainingTiming";
import { MatchTrainingTimer, useTrainingClock } from "../MatchTrainingTimer";
import { selectMatchPrep } from "@/game/training-session";
import { Button, ButtonLink, Card, Crest, Empty, FormPills, Meter, PageHeader, Panel, PosBadge, StatTile, Tag, cn } from "../ui";

const FOCUS: { value: MatchPrepFocus; label: string; blurb: string }[] = [
  { value: "none", label: "No match prep", blurb: "All training time goes on development." },
  { value: "familiarity", label: "Tactical familiarity", blurb: "Drill the current formation, instructions and roles." },
  { value: "setPiecesAttack", label: "Attacking set pieces", blurb: "Corners and free kicks about 12% more dangerous this match." },
  { value: "setPiecesDefence", label: "Defending set pieces", blurb: "Their corners and free kicks about 12% less dangerous." },
  { value: "opposition", label: "Opposition analysis", blurb: "Sharper report, more scouting of their XI, opposition instructions 30% more effective." },
];

/** Prepare for the next match: study them, plan for them, train for them. */
export function PrepScreen() {
  const save = useCareer();
  const now = useTrainingClock();
  const report = oppositionReport(save);
  const readiness = squadReadiness(save);
  if (!report) {
    return (
      <div>
        <PageHeader eyebrow="Team" title="Match preparation" />
        <Empty title="No match this week">You aren&apos;t playing this week. The next report appears when you have a fixture.</Empty>
      </div>
    );
  }
  const prep = save.prep?.fixtureId === report.fixture.id ? save.prep.opposition : {};
  const setOI = (playerId: string, oi: OppInstruction | null) =>
    updateSave((d) => {
      if (!d.prep || d.prep.fixtureId !== report.fixture.id) d.prep = { fixtureId: report.fixture.id, opposition: {} };
      if (oi && Object.values(oi).some(Boolean)) d.prep.opposition[playerId] = oi;
      else delete d.prep.opposition[playerId];
    });
  const focus = save.training.matchPrep ?? "none";
  const selectedFocus = FOCUS.find((f) => f.value === focus)!;

  return (
    <div>
      <PageHeader
        eyebrow={`Match preparation · ${report.home ? "Home" : "Away"}`}
        title={
          <span className="flex items-center gap-3">
            <Crest design={report.opponent.crest} colors={report.opponent.colors} label={report.opponent.shortName} size={40} />
            {report.opponent.name}
          </span>
        }
        subtitle={`Analysis quality ${report.quality}/20${report.quality < 10 ? ": a better assistant, or a week of opposition analysis, sharpens the report." : "."}`}
        actions={
          <>
            <ButtonLink href="/tactics" size="sm">
              Tactics
            </ButtonLink>
            <ButtonLink href="/match" size="sm" variant="primary">
              To the match
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="League position" value={report.position ? `${report.position}${["th", "st", "nd", "rd"][report.position % 10 > 3 || [11, 12, 13].includes(report.position) ? 0 : report.position % 10]}` : "–"} hint={`${report.played} played`} />
        <StatTile label="Goals for / against" value={`${report.goalsFor} / ${report.goalsAgainst}`} />
        <StatTile label="Home / away" value={<span className="text-sm">{report.homeRecord}<br />{report.awayRecord}</span>} />
        <StatTile label="Form" value={report.form.length ? <FormPills form={report.form.map((f) => f.result).reverse()} /> : "–"} hint={[...report.form].reverse().map((f) => `${f.score} ${f.home ? "v" : "@"} ${f.vs}`).join(" · ")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {report.manager && (
            <Card className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="text-muted">Manager:</span> <span className="font-medium">{report.manager.name}</span>
                </span>
                <span className="text-xs text-muted">{report.manager.style}</span>
              </div>
              <p className="text-xs text-muted">{report.manager.blurb}</p>
              {report.manager.reasons.length > 0 && <p className="mt-1 text-xs">Expect him to {report.manager.reasons.join("; ")}.</p>}
            </Card>
          )}
          <Panel title="How they play" subtitle={report.formationSure ? `Likely ${report.formation}` : "Formation unclear"}>
            <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[220px_1fr]">
              <PredictedXI report={report} />
              <dl className="flex flex-col gap-2 text-sm">
                {INSTRUCTION_KEYS.map((k) => {
                  const r = report.tactics[k];
                  const label = r.value === null ? "Unclear" : r.value <= 2 ? INSTRUCTION_LABELS[k].low : r.value >= 4 ? INSTRUCTION_LABELS[k].high : "Balanced";
                  return (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <dt className="text-muted">{INSTRUCTION_LABELS[k].label}</dt>
                      <dd className={cn("font-medium", r.value === null && "text-muted")}>
                        {label}
                        {r.approx && r.value !== null && <span className="ml-1 text-xs text-muted">(roughly)</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </Panel>

          <Panel title="Strengths and weaknesses" subtitle="What the analysts found, and what to do about it">
            <ul className="flex flex-col gap-2.5 px-4 pb-4">
              {report.items.length === 0 && <li className="text-sm text-muted">Nothing stands out. A well-balanced side.</li>}
              {report.items.map((it, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <Tag tone={it.kind === "strength" ? "bad" : "good"} className="mt-0.5 shrink-0">
                    {it.kind === "strength" ? "Threat" : "Weakness"}
                  </Tag>
                  <span>
                    <span className="font-medium">{it.text}</span>
                    {it.advice && <span className="block text-xs text-muted">→ {it.advice}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Key players">
            <ul className="flex flex-col divide-y divide-line px-4 pb-2">
              {report.keyPlayers.map(({ player, why }) => (
                <li key={player.id} className="flex items-center gap-3 py-2 text-sm">
                  <PosBadge pos={player.positions[0]} />
                  <span className="min-w-0 flex-1">
                    <PlayerLink p={player} /> <span className="text-xs text-muted">{fmtRange(ovrRange(player, knowledgeOf(save, player)))} OVR</span>
                    <span className="block text-xs text-muted">{why}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Opposition instructions"
            subtitle="How your players treat each of theirs in this match"
            action={
              <Button
                size="sm"
                onClick={() => {
                  const rec = recommendedInstructions(report);
                  updateSave((d) => void (d.prep = { fixtureId: report.fixture.id, opposition: rec }));
                  toast(Object.keys(rec).length ? "Applied the assistant's recommendations." : "The assistant has nothing to recommend.");
                }}
              >
                Use assistant&apos;s picks
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="table min-w-[420px]">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Mark</th>
                    <th>Close down</th>
                    <th>Tackling</th>
                  </tr>
                </thead>
                <tbody>
                  {report.xi.map(({ player, pos }) => {
                    const oi = prep[player.id] ?? {};
                    return (
                      <tr key={player.id}>
                        <td className="whitespace-nowrap">
                          <PosBadge pos={pos} className="mr-1.5" />
                          <PlayerLink p={player} />
                        </td>
                        <td>
                          <button
                            aria-pressed={!!oi.markTight}
                            onClick={() => setOI(player.id, { ...oi, markTight: !oi.markTight || undefined })}
                            className={cn("rounded-md border px-2 py-1 text-xs", oi.markTight ? "border-text bg-highlight font-medium" : "border-line text-muted hover:border-text")}
                          >
                            Tight
                          </button>
                        </td>
                        <td>
                          <Tri value={oi.press} options={[["less", "Less"], ["more", "More"]]} onChange={(v) => setOI(player.id, { ...oi, press: v as OppInstruction["press"] })} />
                        </td>
                        <td>
                          <Tri value={oi.tackle} options={[["soft", "Soft"], ["hard", "Hard"]]} onChange={(v) => setOI(player.id, { ...oi, tackle: v as OppInstruction["tackle"] })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-xs text-muted">Tight marking puts the nearest defender on him in your half. Hard tackling wins more balls off him but gives away more fouls and cards.</p>
          </Panel>

          <Panel title="Match training" subtitle="This week's sessions before the game. Any match prep costs about a fifth of the week's development.">
            <div className="flex flex-col gap-2 px-4 pb-4">
              <TrainingTiming save={save} />
              <MatchTrainingTimer save={save} now={now} />
              {FOCUS.map((f) => (
                <button
                  key={f.value}
                  aria-pressed={focus === f.value}
                  onClick={() => updateSave((d) => selectMatchPrep(d, f.value))}
                  className={cn("rounded-md border px-3 py-2 text-left", focus === f.value ? "border-text bg-highlight" : "border-line hover:border-text")}
                >
                  <span className="block text-sm font-semibold">{f.label}</span>
                  <span className="block text-xs text-muted">{f.blurb}</span>
                </button>
              ))}
              <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-sm" aria-live="polite">
                <p className="font-semibold">Selected plan · {selectedFocus.label}</p>
                {save.liveMatch?.fixtureId === report.fixture.id && <p className="mt-2 text-xs text-muted">This match has already kicked off. Changing the plan now affects weekly training and future matches; its current match bonuses were frozen at kickoff.</p>}
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted">Duration</dt><dd>60 seconds of real time for the drill. Start a fresh drill each career week.</dd>
                  <dt className="text-muted">Who trains</dt><dd>Your available squad. Injured players recover instead.</dd>
                  <dt className="text-muted">Next match</dt><dd>{report.opponent.name} · Week {save.calendarIndex + 1}. Only a completed drill supplies match bonuses at kickoff.</dd>
                  <dt className="text-muted">Development cost</dt><dd>{focus === "none" ? "None — full development time." : "20% less attribute growth this week. Fitness recovery still runs."}</dd>
                  <dt className="text-muted">Training effect</dt><dd>{focus === "familiarity" ? "Extra formation, instruction and role familiarity at the weekly update; the amount depends on coaching and existing familiarity." : focus === "opposition" ? "Analysis quality gains up to 5 points now, opposition instructions are 30% more effective in the match, and scouting knowledge of their XI increases after the match." : selectedFocus.blurb}</dd>
                  <dt className="text-muted">When it updates</dt><dd>Preparation becomes ready when the timer ends. Its match bonuses are frozen at kickoff; development and learned familiarity are recorded when the week ends.</dd>
                </dl>
              </div>
            </div>
          </Panel>

          <Panel title="Squad readiness" subtitle={`Tactical familiarity: ${familiarityLabel(readiness.familiarity.overall)}`}>
            <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
              {(
                [
                  ["Fitness", readiness.fitness],
                  ["Morale", readiness.morale],
                  ["Tactical familiarity", readiness.familiarity.overall * 100],
                ] as const
              ).map(([label, v]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between">
                    <span className="text-muted">{label}</span>
                    <span className="tabular">{Math.round(v)}%</span>
                  </div>
                  <Meter value={v} label={label} />
                </div>
              ))}
              {readiness.warnings.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-line pt-3 text-xs">
                  {readiness.warnings.map((w, i) => (
                    <li key={i}>
                      ⚠︎ {w.text}{" "}
                      {w.playerId && (
                        <Link href={`/player?id=${w.playerId}`} className="text-muted underline-offset-2 hover:underline">
                          view
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Tri({ value, options, onChange }: { value?: string; options: [string, string][]; onChange: (v: string | undefined) => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-line text-xs">
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)} className={cn("px-2 py-1", value === v ? "bg-highlight font-medium" : "text-muted hover:text-text")}>
          {label}
        </button>
      ))}
    </span>
  );
}

/** Their likely XI on a small vertical pitch (attacking downward toward us). */
function PredictedXI({ report }: { report: OppositionReport }) {
  const save = useCareer();
  return (
    <Card className="relative aspect-[68/90] w-full overflow-hidden border-0" style={{ background: "repeating-linear-gradient(0deg, var(--pitch-a) 0 10%, var(--pitch-b) 10% 20%)" }}>
      {report.xi.map(({ player, pos }, i) => {
        const slot = slotOf(report, i);
        return <Dot key={player.id} p={player} pos={pos} x={slot.y} y={slot.x} known={knowledgeOf(save, player) >= 60} colors={report.opponent.colors} />;
      })}
    </Card>
  );
}

function slotOf(report: OppositionReport, i: number) {
  // FORMATIONS slots: x = depth (0 own goal → 1), y = width
  return (FORMATION_SLOTS[report.formation] ?? [])[i] ?? { x: 0.5, y: 0.5 };
}

function Dot({ p, pos, x, y, known, colors }: { p: Player; pos: string; x: number; y: number; known: boolean; colors: { primary: string; secondary: string } }) {
  return (
    <span className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${8 + x * 84}%`, top: `${6 + (y / 0.68) * 84}%` }} title={`${p.firstName} ${p.lastName} (${pos})`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold" style={{ background: colors.primary, color: colors.secondary, borderColor: colors.secondary }}>
        {p.shirt}
      </span>
      <span className={cn("max-w-[60px] truncate rounded bg-surface/85 px-1 text-[9px] leading-3.5", !known && "italic")}>{p.lastName}</span>
    </span>
  );
}
