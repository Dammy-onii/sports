"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { currentSeason, leagueOfClub, squadOf } from "@/game/career";
import { coachSkills, developmentFactors } from "@/game/development";
import { perceivedPotential } from "@/game/progress";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, TRAINABILITY, TRAINING_FOCUS } from "@/game/constants";
import { averageForm, currentAbility, formatMoney, overall, playerValue, TRAIT_INFO, traitBand, type TraitKey } from "@/game/ratings";
import { attrRange, fmtRange, knowledgeOf, ovrRange, traitsKnown } from "@/game/scouting";
import { STATUS_INFO, STATUS_ORDER, promisePlaytime, recentShare, setStatus } from "@/game/squad";
import { isWindowOpen, loanAvailable, loanOut, releasePlayer, toggleListed, toggleShortlist } from "@/game/transfers";
import type { AttributeKey, Player, Position, SquadStatus, TrainingFocus } from "@/game/types";
import { act, updateSave, useCareer } from "@/lib/store/save-store";
import { Radar, PositionMap, Sparkline } from "../charts";
import { toast } from "../overlay";
import { TalkDialog } from "../TalkDialog";
import { ALL_POSITIONS, BidDialog, LoanDialog, PotentialStars, RADAR_AXES, RenewDialog, SeasonSheet, radarValues } from "../PlayerParts";
import { AttrBar, Button, ButtonLink, Card, Crest, Empty, Field, Meter, OvrChip, Panel, PosBadge, Tabs, Tag, attrTextColor, cn } from "../ui";

type Tab = "overview" | "attributes" | "stats" | "career" | "development" | "contract";

export function PlayerScreen() {
  const save = useCareer();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const p = save.players[id];
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "overview");
  const [dialog, setDialog] = useState<null | "bid" | "renew" | "loan" | "talk">(null);

  if (!p) {
    return <Empty title="Player not found">He may have retired or left the game world. <Link href="/squad" className="underline">Back to the squad</Link></Empty>;
  }

  const mine = p.clubId === save.userClubId;
  const k = knowledgeOf(save, p);
  const club = save.clubs[p.clubId];
  const season = currentSeason(save);
  const known = k >= 90;
  const ovrText = fmtRange(ovrRange(p, k));
  const windowOpen = isWindowOpen(save);

  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "attributes", label: "Attributes" },
    { value: "stats", label: "Season stats" },
    { value: "career", label: "Career" },
    ...(mine ? [{ value: "development" as Tab, label: "Development" }, { value: "contract" as Tab, label: "Contract & status" }] : []),
  ];

  return (
    <div>
      {/* Header */}
      <header className="mb-5 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-display text-4xl tabular">{p.shirt}</div>
          <div className="min-w-0">
            <div className="eyebrow flex flex-wrap items-center gap-2">
              {club ? (
                <span className="inline-flex items-center gap-1.5">
                  <Crest design={club.crest} colors={club.colors} label={club.shortName} size={14} />
                  {club.name}
                </span>
              ) : (
                "Free agent"
              )}
              {p.loan && <span>· on loan from {save.clubs[p.loan.fromClubId]?.name}</span>}
            </div>
            <h1 className="font-display text-4xl leading-none md:text-5xl">
              {p.firstName} {p.lastName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {p.positions.map((pos) => (
                <PosBadge key={pos} pos={pos} />
              ))}
              <span>
                {p.age} yrs · {p.nationality}
              </span>
              {mine && <Tag>{STATUS_INFO[p.status].label}</Tag>}
              {p.injuryWeeks > 0 && <Tag tone="bad">Injured {p.injuryWeeks} wk</Tag>}
              {p.suspension > 0 && <Tag tone="bad">Suspended {p.suspension}</Tag>}
              {p.transferRequest && <Tag tone="bad">Wants to leave</Tag>}
              {!mine && save.shortlist.includes(p.id) && <Tag tone="highlight">Shortlisted</Tag>}
            </div>
          </div>
        </div>
        <div className="flex items-end gap-5">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted">Overall</div>
            <OvrChip value={ovrText} className="mt-1 text-lg" />
          </div>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted">Potential</div>
            <div className="mt-1.5"><PotentialStars save={save} p={p} /></div>
          </div>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted">Value</div>
            <div className="mt-1 text-lg font-semibold tabular">{formatMoney(playerValue(p))}</div>
          </div>
        </div>
      </header>

      {/* Actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        {mine ? (
          <>
            <Button size="sm" variant="primary" onClick={() => setDialog("talk")}>
              Talk to him
            </Button>
            {!p.loan && (
              <Button size="sm" onClick={() => setDialog("renew")}>
                Renew contract
              </Button>
            )}
            {(p.unhappyWeeks >= 2 || p.transferRequest) && !p.promise && (
              <Button
                size="sm"
                variant="highlight"
                onClick={() => {
                  act((d) => promisePlaytime(d.players[p.id], d.calendarIndex));
                  toast(`Promised ${p.lastName} more minutes. Keep your word over the next six weeks.`);
                }}
              >
                Promise playing time
              </Button>
            )}
            {!p.loan && (
              <Button size="sm" onClick={() => act((d) => toggleListed(d, p.id))}>
                {save.transferList.includes(p.id) ? "Remove from transfer list" : "Transfer list"}
              </Button>
            )}
            {!p.loan && (
              <Button
                size="sm"
                disabled={!windowOpen}
                title={windowOpen ? undefined : "The transfer window is closed"}
                onClick={() => {
                  const r = act((d) => loanOut(d, p.id));
                  toast(r.ok ? `${p.lastName} joins ${r.clubName} on loan.` : (r.reason ?? "No takers."), r.ok ? "good" : "bad");
                }}
              >
                Loan out
              </Button>
            )}
            {!p.loan && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (!confirm(`Release ${p.firstName} ${p.lastName}? You pay half of his remaining wages as a settlement.`)) return;
                  const r = act((d) => releasePlayer(d, p.id));
                  toast(r.ok ? `${p.lastName} released (settlement ${formatMoney(r.cost ?? 0)}).` : (r.reason ?? "Couldn't release him."), r.ok ? "info" : "bad");
                }}
              >
                Release
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" disabled={!windowOpen} onClick={() => setDialog("bid")} title={windowOpen ? undefined : "The transfer window is closed"}>
              {p.clubId === "FA" ? "Offer a contract" : "Make a bid"}
            </Button>
            {loanAvailable(save, p) && (
              <Button size="sm" disabled={!windowOpen} onClick={() => setDialog("loan")}>
                Ask to loan
              </Button>
            )}
            <Button size="sm" onClick={() => act((d) => toggleShortlist(d, p.id))}>
              {save.shortlist.includes(p.id) ? "Remove from shortlist" : "Add to shortlist"}
            </Button>
            {!known && (
              <Button
                size="sm"
                disabled={save.scouting.queue.includes(p.id)}
                onClick={() => {
                  updateSave((d) => void (d.scouting.queue.includes(p.id) || d.scouting.queue.push(p.id)));
                  toast("Your scout will report back after the next match week.");
                }}
              >
                {save.scouting.queue.includes(p.id) ? "Scout requested" : "Scout him"}
              </Button>
            )}
            <span className="self-center text-xs text-muted">Scouting knowledge {Math.round(k)}%</span>
          </>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} options={tabs} className="mb-4" />

      {tab === "overview" && <Overview p={p} k={k} mine={mine} />}
      {tab === "attributes" && <Attributes p={p} k={k} start={mine ? save.dev[p.id]?.start : undefined} />}
      {tab === "career" && <CareerTab p={p} />}
      {tab === "stats" && (
        <Card className="p-4">
          <SeasonSheet p={p} />
        </Card>
      )}
      {tab === "development" && mine && (
        <div className="flex flex-col gap-4">
          <DevInsight p={p} />
          <Development p={p} />
        </div>
      )}
      {tab === "contract" && mine && <ContractTab p={p} season={season} onRenew={() => setDialog("renew")} />}

      {dialog === "bid" && <BidDialog save={save} p={p} open onClose={() => setDialog(null)} />}
      {dialog === "renew" && <RenewDialog save={save} p={p} open onClose={() => setDialog(null)} />}
      {dialog === "loan" && <LoanDialog save={save} p={p} open onClose={() => setDialog(null)} />}
      {dialog === "talk" && <TalkDialog player={p} open onClose={() => setDialog(null)} />}
    </div>
  );
}

function Overview({ p, k, mine }: { p: Player; k: number; mine: boolean }) {
  const ratings = Object.fromEntries(ALL_POSITIONS.map((pos) => [pos, overall(p, pos)])) as Record<Position, number>;
  const form = averageForm(p);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Profile" subtitle={k >= 90 ? "Exact attributes" : "Estimated from scouting"}>
        <div className="flex justify-center px-4 pb-4">
          <Radar axes={RADAR_AXES} series={[{ label: p.lastName, values: radarValues(p.attributes), color: "#2f8f57" }]} />
        </div>
      </Panel>
      <Panel title="Positions" subtitle="Rating in every position; outlined = natural">
        <div className="px-4 pb-4">
          <PositionMap ratings={ratings} natural={p.positions} />
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="Personality">
          <div className="flex flex-col gap-2 px-4 pb-4">
            {traitsKnown(k) ? (
              (Object.keys(TRAIT_INFO) as TraitKey[]).map((key) => {
                const v = Math.round(p.traits[key]);
                const good = TRAIT_INFO[key].highIsGood ? v : 21 - v;
                return (
                  <div key={key} title={TRAIT_INFO[key].blurb}>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">{TRAIT_INFO[key].label}</span>
                      <span className={cn("font-medium", attrTextColor(good))}>
                        {traitBand(key, v)} <span className="text-xs text-muted tabular">({v})</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">{TRAIT_INFO[key].blurb}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted">Scout him (60%+ knowledge) to learn his temperament, fitness record and consistency.</p>
            )}
          </div>
        </Panel>
        <Panel title="Condition & form">
          <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
            <div>
              <div className="mb-1 flex justify-between text-muted">
                <span>Fitness</span>
                <span className="tabular text-text">{Math.round(p.fitness)}%</span>
              </div>
              <Meter value={p.fitness} label="Fitness" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-muted">
                <span>Morale</span>
                <span className="tabular text-text">{Math.round(p.morale)}%</span>
              </div>
              <Meter value={p.morale} label="Morale" />
            </div>
            {mine && (
              <div className="flex justify-between text-muted">
                <span>Playing time (recent / expected)</span>
                <span className="tabular text-text">
                  {Math.round(recentShare(p) * 100)}% / {Math.round(STATUS_INFO[p.status].expects * 100)}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-muted">
              <span>Last 5 ratings {form ? `· avg ${form.toFixed(1)}` : ""}</span>
              <Sparkline values={p.form} min={5} max={9} width={110} height={28} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Attributes({ p, k, start }: { p: Player; k: number; start?: Player["attributes"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {ATTRIBUTE_GROUPS.filter((g) => g.label !== "Goalkeeping" || p.positions[0] === "GK").map((g) => (
        <Panel key={g.label} title={g.label}>
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            {g.keys.map((key) => {
              const range = attrRange(p, key, p.attributes[key], k);
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted">
                      {ATTRIBUTE_LABELS[key]}
                      {TRAINABILITY[key] !== "trainable" && (
                        <span className="ml-1 text-[10px] uppercase text-muted/70" title={TRAINABILITY[key] === "experience" ? "Grows with match experience, not training" : "Innate: can't be trained"}>
                          {TRAINABILITY[key] === "experience" ? "exp" : "innate"}
                        </span>
                      )}
                    </span>
                    <span className={cn("font-semibold tabular", attrTextColor(range[1]))}>
                      {start && <Change v={p.attributes[key] - start[key]} />}
                      {fmtRange(range)}
                    </span>
                  </div>
                  <AttrBar value={p.attributes[key]} range={range} />
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
      {k < 90 && <p className="text-xs text-muted md:col-span-2 lg:col-span-4">Ranges narrow as your scouts learn more about him. Playing against him helps too.</p>}
      {start && <p className="text-xs text-muted md:col-span-2 lg:col-span-4">Arrows show change since the start of the season.</p>}
      <p className="text-xs text-muted md:col-span-2 lg:col-span-4">
        <span className="uppercase">exp</span>: grows only with match experience, age and mentoring. <span className="uppercase">innate</span>: set at birth. Everything else can be trained.
      </p>
    </div>
  );
}

/** Small ↑/↓ marker for an attribute change. */
function Change({ v }: { v: number }) {
  if (Math.abs(v) < 0.25) return null;
  return (
    <span className={cn("mr-1.5 text-[11px] font-normal", v > 0 ? "text-win-ink" : "text-loss-ink")} title={`${v > 0 ? "+" : ""}${v.toFixed(1)} this season`}>
      {v > 0 ? "↑" : "↓"}
      {Math.abs(v).toFixed(1)}
    </span>
  );
}

function CareerTab({ p }: { p: Player }) {
  const save = useCareer();
  const rows = [...(p.history ?? [])].reverse();
  const current = save.clubs[p.clubId];
  return (
    <Card className="overflow-x-auto">
      <table className="table min-w-[560px]">
        <thead>
          <tr>
            <th>Season</th>
            <th>Club</th>
            <th className="num">Age</th>
            <th className="num">Apps</th>
            <th className="num">Goals</th>
            <th className="num">Assists</th>
            <th className="num">Avg rating</th>
            <th className="num">OVR</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-highlight/50">
            <td>{save.leagues[0].season} (now)</td>
            <td>{current?.name ?? "Free agent"}</td>
            <td className="num">{p.age}</td>
            <td className="num">{p.season.apps}</td>
            <td className="num">{p.season.goals}</td>
            <td className="num">{p.season.assists}</td>
            <td className="num">{p.season.apps ? (p.season.ratingSum / p.season.apps).toFixed(2) : "–"}</td>
            <td className="num">{knowledgeOf(save, p) >= 90 ? overall(p) : "?"}</td>
          </tr>
          {rows.map((h, i) => (
            <tr key={i}>
              <td>{h.season}</td>
              <td>{h.clubName}</td>
              <td className="num">{h.age}</td>
              <td className="num">{h.apps}</td>
              <td className="num">{h.goals}</td>
              <td className="num">{h.assists}</td>
              <td className="num">{h.rating ? h.rating.toFixed(2) : "–"}</td>
              <td className="num">{knowledgeOf(save, p) >= 90 ? h.ovr : "?"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-4 py-3 text-xs text-muted">His career record builds up season by season.</p>}
    </Card>
  );
}

/** How he's developing, and why: ability over time and the factors driving it. */
function DevInsight({ p }: { p: Player }) {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const log = save.dev[p.id];
  const f = developmentFactors(p, { focus: save.training.focus, intensity: save.training.intensity, coach: coachSkills(club.staff), facilities: club.facilities.training, academy: club.academy, tier: leagueOfClub(save, club.id).tier, matchPrep: !!save.training.matchPrep && save.training.matchPrep !== "none" });
  const [lo, hi] = perceivedPotential(save, p);
  const points = log?.points ?? [];
  const history = (p.history ?? []).map((h) => h.ca);
  const series = points.length > 1 ? points.map((x) => x[1]) : history.length > 1 ? history : [];
  const seasonChange = log ? currentAbility(p) - log.startCA : 0;
  const bar = (label: string, v: number, note: string) => (
    <div key={label}>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={cn("tabular", v >= 1.08 ? "text-win-ink" : v <= 0.92 ? "text-loss-ink" : "")}>×{v.toFixed(2)}</span>
      </div>
      <Meter value={Math.min(100, (v / 1.5) * 100)} label={label} />
      <p className="mt-0.5 text-[11px] text-muted">{note}</p>
    </div>
  );
  const ageNote = p.age <= 20 ? "Prime years for growth." : p.age <= 23 ? "Still developing, but slowing." : p.age <= 27 ? "Close to his peak; growth is small now." : p.age <= 30 ? "At his peak. Physical decline starts around 29." : "Declining: pace and stamina go first.";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Ability over time" subtitle={log ? `${seasonChange >= 0 ? "+" : ""}${seasonChange.toFixed(1)} ability this season` : "Weekly log starts when he's at your club"}>
        <div className="px-4 pb-4">
          {series.length > 1 ? <Sparkline values={series} width={420} height={90} className="w-full" /> : <p className="text-sm text-muted">Not enough history yet.</p>}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Current ability</dt>
            <dd className="text-right tabular">{Math.round(currentAbility(p))} / 200</dd>
            <dt className="text-muted">Coach&apos;s view of potential</dt>
            <dd className="text-right">
              {lo === hi ? `${lo}★` : `${lo}–${hi}★`}
            </dd>
          </dl>
        </div>
      </Panel>
      <Panel title="What drives his development" subtitle="Multipliers on his weekly growth right now">
        <div className="flex flex-col gap-3 px-4 pb-4">
          {bar("Age", f.age, ageNote)}
          {bar("Personality", f.personality, `${traitBand("professionalism", p.traits.professionalism)}, ${traitBand("determination", p.traits.determination).toLowerCase()}.`)}
          {bar("Match experience", f.experience, `${Math.round(f.minutesShare * 100)}% of recent minutes. Regular football speeds development.`)}
          {bar("Coaching", f.coaching, "Your coach's skill in the areas he's training.")}
          {bar("Facilities", f.facilities, `Training ground ${club.facilities.training}/5${p.age <= 18 ? `, academy ${club.academy}/5` : ""}.`)}
          {bar("Training load", f.training, `${save.training.intensity} intensity${f.training < 1 && save.training.matchPrep && save.training.matchPrep !== "none" ? ", with match prep" : ""}.`)}
          {bar("Room to grow", f.room, f.room < 0.4 ? "Close to his ceiling." : "Plenty of headroom.")}
        </div>
      </Panel>
    </div>
  );
}

function Development({ p }: { p: Player }) {
  const save = useCareer();
  const seniors = squadOf(save, save.userClubId).filter((x) => x.age >= 27 && x.id !== p.id);
  const set = (fn: (d: Player) => void) => updateSave((d) => fn(d.players[p.id]));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Panel title="Individual training" subtitle="On top of the team plan">
        <div className="px-4 pb-4">
          <Field label="Focus">
            <select className="input" value={p.focus ?? ""} onChange={(e) => set((d) => void (d.focus = (e.target.value || undefined) as TrainingFocus | undefined))}>
              <option value="">None (team plan only)</option>
              {(Object.keys(TRAINING_FOCUS) as TrainingFocus[])
                .filter((f) => f !== "balanced")
                .map((f) => (
                  <option key={f} value={f}>
                    {TRAINING_FOCUS[f].label}: {TRAINING_FOCUS[f].keys.map((x) => ATTRIBUTE_LABELS[x]).join(", ")}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </Panel>
      <Panel title="Attribute focus" subtitle="One trainable attribute worked on hardest (×4)">
        <div className="px-4 pb-4">
          <Field label="Attribute">
            <select className="input" value={p.focusAttr ?? ""} onChange={(e) => set((d) => void (d.focusAttr = (e.target.value || undefined) as AttributeKey | undefined))}>
              <option value="">None</option>
              {ATTRIBUTE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.keys
                    .filter((k) => TRAINABILITY[k] === "trainable" && (g.label !== "Goalkeeping" || p.positions[0] === "GK"))
                    .map((k) => (
                      <option key={k} value={k}>
                        {ATTRIBUTE_LABELS[k]} ({Math.round(p.attributes[k])})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
      </Panel>
      <Panel title="Learn a position" subtitle="Young, intelligent players learn fastest">
        <div className="flex flex-col gap-3 px-4 pb-4">
          <Field label="New position">
            <select
              className="input"
              value={p.retrain?.pos ?? ""}
              onChange={(e) => set((d) => void (d.retrain = e.target.value ? { pos: e.target.value as Position, progress: 0 } : undefined))}
            >
              <option value="">Not retraining</option>
              {ALL_POSITIONS.filter((x) => !p.positions.includes(x)).map((x) => (
                <option key={x} value={x}>
                  {x} (currently {overall(p, x)})
                </option>
              ))}
            </select>
          </Field>
          {p.retrain && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Progress</span>
                <span>{Math.round(p.retrain.progress)}%</span>
              </div>
              <Meter value={p.retrain.progress} label="Retraining progress" />
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Mentor" subtitle={p.age <= 23 ? "A senior pro passes on composure and nous" : "Mentoring is for players aged 23 or under"}>
        <div className="px-4 pb-4">
          <Field label="Mentor">
            <select className="input" disabled={p.age > 23} value={p.mentorId ?? ""} onChange={(e) => set((d) => void (d.mentorId = e.target.value || undefined))}>
              <option value="">No mentor</option>
              {seniors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} ({s.age}, consistency {Math.round(s.traits.consistency)})
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>
    </div>
  );
}

function ContractTab({ p, season, onRenew }: { p: Player; season: number; onRenew: () => void }) {
  const left = p.contract.expires - season + 1;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Contract">
        <dl className="grid grid-cols-2 gap-3 px-4 pb-4 text-sm">
          <dt className="text-muted">Wage</dt>
          <dd className="text-right font-semibold tabular">{formatMoney(p.contract.wage)}/wk</dd>
          <dt className="text-muted">Expires</dt>
          <dd className={cn("text-right font-semibold", left <= 1 && "text-loss-ink")}>
            End of season {p.contract.expires} ({left} season{left === 1 ? "" : "s"} left)
          </dd>
        </dl>
        <div className="px-4 pb-4">
          <Button size="sm" variant="primary" onClick={onRenew} disabled={!!p.loan}>
            Offer a new contract
          </Button>
        </div>
      </Panel>
      <Panel title="Squad status" subtitle="Sets how much football he expects. Demotions hurt morale.">
        <div className="flex flex-col gap-1 px-4 pb-4">
          {STATUS_ORDER.map((st) => (
            <label key={st} className={cn("flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2", p.status === st && "bg-highlight")}>
              <input type="radio" name="status" className="mt-1 accent-black" checked={p.status === st} onChange={() => updateSave((d) => setStatus(d.players[p.id], st as SquadStatus))} />
              <span>
                <span className="block text-sm font-medium">{STATUS_INFO[st].label}</span>
                <span className="block text-xs text-muted">
                  {STATUS_INFO[st].blurb} Expects ~{Math.round(STATUS_INFO[st].expects * 100)}% of minutes.
                </span>
              </span>
            </label>
          ))}
        </div>
      </Panel>
      <ButtonLink href="/squad?view=contracts" variant="ghost" size="sm" className="w-fit">
        All contracts
      </ButtonLink>
    </div>
  );
}
