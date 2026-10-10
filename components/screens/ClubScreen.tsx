"use client";

import { PreseasonCard } from "../PreseasonCard";
import Link from "next/link";
import { confidenceLabel } from "@/game/board";
import { currentSeason, leagueOfClub, ordinal, squadOf, staffBill, userLeague, userSlotFixture, wageBill } from "@/game/career";
import { leagueTable } from "@/game/competition";
import { formatMoney, overall } from "@/game/ratings";
import { fmtRange, knowledgeOf, ovrRange } from "@/game/scouting";
import { updateSave, useCareer } from "@/lib/store/save-store";
import { InboxLink, InboxList } from "../InboxList";
import { Button, ButtonLink, Card, CardHeader, Crest, Empty, FormPills, ICONS, Icon, Meter, Panel, PosBadge, StatTile, Tag, cn } from "../ui";

export function ClubScreen() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const league = userLeague(save);
  const table = leagueTable(league);
  const pos = table.findIndex((r) => r.clubId === club.id) + 1;
  const lastReport = save.reports[0];
  const weekNet = save.ledger.filter((l) => l.week === save.calendarIndex && l.season === currentSeason(save)).reduce((a, l) => a + l.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <Crest design={club.crest} colors={club.colors} label={club.shortName} size={64} />
          <div>
            <div className="eyebrow">
              Season {currentSeason(save)} · {league.name}
            </div>
            <h1 className="font-display text-5xl leading-none">{club.name}</h1>
            <p className="mt-1.5 text-sm text-muted">
              {ordinal(pos)} in the table · Board objective: <span className="text-text">{save.board.objective.label.toLowerCase()}</span>
            </p>
          </div>
        </div>
      </header>

      <Onboarding />
      <PreseasonCard />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <NextMatch />
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold">Board confidence</h2>
            <span className="text-sm font-medium">{confidenceLabel(save.board.confidence)}</span>
          </div>
          <Meter value={save.board.confidence} className="mt-2 h-2" label="Board confidence" />
          <p className="mt-2 text-xs text-muted">Objective: {save.board.objective.label}. Finish {ordinal(save.board.objective.targetPos)} or better.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatTile label="Balance" value={formatMoney(club.balance)} tone={club.balance < 0 ? "bad" : undefined} />
            <StatTile label="Last week" value={`${weekNet >= 0 ? "+" : ""}${formatMoney(weekNet)}`} tone={weekNet >= 0 ? "good" : "bad"} />
            <StatTile
              label="Wages / week"
              value={formatMoney(wageBill(save, club.id) + staffBill(save, club.id))}
              hint={`Budget ${formatMoney(save.board.wageBudget)}`}
              tone={wageBill(save, club.id) > save.board.wageBudget ? "bad" : undefined}
            />
            <StatTile label="Manager record" value={`${save.manager.won}–${save.manager.drawn}–${save.manager.lost}`} hint="W–D–L" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Inbox" subtitle={`${save.inbox.filter((m) => !m.read).length} unread`} action={<InboxLink />}>
          <InboxList save={save} messages={save.inbox} limit={6} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="League" subtitle={league.name} action={<Link href="/league" className="text-xs text-muted underline-offset-4 hover:underline">Full table</Link>}>
            <table className="table">
              <tbody>
                {table
                  .map((r, i) => ({ r, i }))
                  .filter(({ i }) => i < 3 || Math.abs(i + 1 - pos) <= 1 || i === table.length - 1)
                  .map(({ r, i }) => {
                    const c = save.clubs[r.clubId];
                    return (
                      <tr key={r.clubId} className={cn(c.isUser && "bg-highlight")}>
                        <td className="w-6 text-xs text-muted tabular">{i + 1}</td>
                        <td>
                          <span className="flex items-center gap-2">
                            <Crest design={c.crest} colors={c.colors} label={c.shortName} size={18} />
                            <span className={cn("truncate", c.isUser && "font-semibold")}>{c.name}</span>
                          </span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <FormPills form={r.form} />
                        </td>
                        <td className="num text-xs text-muted">{r.played}</td>
                        <td className="num font-semibold">{r.points}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Panel>
          <SquadAlerts />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Around the league" subtitle="News feed">
          {save.news.length === 0 ? (
            <Empty>News will appear as the season unfolds.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {save.news.slice(0, 8).map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <Icon d={ICONS.news} className="mt-0.5 text-muted" />
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {lastReport ? (
          <Panel title="Last match" subtitle={lastReport.competition} action={<Link href={`/report?id=${lastReport.id}`} className="text-xs text-muted underline-offset-4 hover:underline">Full report</Link>}>
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <span className="truncate text-sm">{lastReport.homeName}</span>
              <span className="font-display text-4xl tabular">
                {lastReport.score[0]}–{lastReport.score[1]}
              </span>
              <span className="truncate text-right text-sm">{lastReport.awayName}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 text-center text-xs">
              <div className="rounded-md bg-surface-2 py-2">
                <div className="text-muted">xG</div>
                <div className="font-semibold tabular">
                  {lastReport.stats[0].xg.toFixed(2)} – {lastReport.stats[1].xg.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md bg-surface-2 py-2">
                <div className="text-muted">Possession</div>
                <div className="font-semibold tabular">
                  {lastReport.stats[0].possession}% – {lastReport.stats[1].possession}%
                </div>
              </div>
              <div className="rounded-md bg-surface-2 py-2">
                <div className="text-muted">Player of the match</div>
                <div className="truncate font-semibold">{lastReport.players.find((p) => p.id === lastReport.playerOfMatch)?.name ?? "–"}</div>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Last match">
            <Empty>No matches played yet.</Empty>
          </Panel>
        )}
      </div>
    </div>
  );
}

function NextMatch() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const next = userSlotFixture(save);
  if (save.jobOffers) {
    return (
      <Card className="p-5">
        <div className="eyebrow">Out of work</div>
        <p className="mt-2 font-display text-3xl">You&apos;ve been sacked.</p>
        <ButtonLink href="/jobs" variant="primary" className="mt-4">
          See job offers
        </ButtonLink>
      </Card>
    );
  }
  if (!next) {
    return (
      <Card className="p-5">
        <div className="eyebrow">This week</div>
        <p className="mt-2 font-display text-3xl">No match for you this week.</p>
        <p className="mt-1 text-sm text-muted">Use Continue at the top to move on. Training, scouting and the transfer market still run.</p>
      </Card>
    );
  }
  const home = next.fixture.homeId === club.id;
  const opp = save.clubs[home ? next.fixture.awayId : next.fixture.homeId];
  const oppLeague = leagueOfClub(save, opp.id);
  const oppRow = leagueTable(oppLeague).find((r) => r.clubId === opp.id);
  const oppPos = leagueTable(oppLeague).findIndex((r) => r.clubId === opp.id) + 1;
  const oppXI = opp.tactics.lineup.map((id) => save.players[id]).filter(Boolean);
  const danger = [...oppXI].sort((a, b) => overall(b) - overall(a))[0];
  const k = danger ? knowledgeOf(save, danger) : 0;
  const missing = club.tactics.lineup.map((id) => save.players[id]).filter((p) => p && (p.injuryWeeks > 0 || p.suspension > 0));
  const derby = club.rivalId === opp.id;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="eyebrow">{next.label}</div>
        <div className="flex gap-1.5">
          {derby && <Tag tone="bad">Derby</Tag>}
          <Tag>{home ? "Home" : "Away"}</Tag>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <Crest design={club.crest} colors={club.colors} label={club.shortName} size={56} />
          <span className="truncate text-sm font-semibold">{club.name}</span>
        </div>
        <span className="font-display text-3xl text-muted">vs</span>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <Crest design={opp.crest} colors={opp.colors} label={opp.shortName} size={56} />
          <span className="truncate text-sm font-semibold">{opp.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {ordinal(oppPos)} in {oppLeague.tier === 1 ? "Premier" : "First"} {oppRow && <FormPills form={oppRow.form} />}
          </span>
        </div>
      </div>
      <div className="grid gap-3 border-t border-line px-4 py-3 text-sm sm:grid-cols-2">
        <div>
          <div className="eyebrow mb-1">Scouting</div>
          <p className="text-muted">
            Lines up in a <span className="text-text">{opp.tactics.formation}</span>.{" "}
            {danger && (
              <>
                Danger man:{" "}
                <Link href={`/player?id=${danger.id}`} className="text-text underline-offset-4 hover:underline">
                  {danger.lastName}
                </Link>{" "}
                ({danger.positions[0]}, {fmtRange(ovrRange(danger, k))}).
              </>
            )}
          </p>
        </div>
        <div>
          <div className="eyebrow mb-1">Your team</div>
          <p className="text-muted">
            {missing.length ? (
              <span className="text-loss-ink">
                {missing.map((p) => p.lastName).join(", ")} {missing.length > 1 ? "are" : "is"} unavailable. Update your XI.
              </span>
            ) : (
              "Everyone in your XI is available."
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2/50 px-4 py-3">
        <ButtonLink href="/tactics" size="sm">
          Tactics
        </ButtonLink>
        <ButtonLink href="/match" size="sm" variant="primary">
          <Icon d={ICONS.play} className="h-4 w-4" /> Go to match
        </ButtonLink>
      </div>
    </Card>
  );
}

function SquadAlerts() {
  const save = useCareer();
  const squad = squadOf(save, save.userClubId);
  const season = currentSeason(save);
  const alerts: { p: (typeof squad)[number]; text: string; tone: "bad" | "warn" }[] = [];
  for (const p of squad) {
    if (p.injuryWeeks > 0) alerts.push({ p, text: `Injured · ${p.injuryWeeks} wk`, tone: "bad" });
    else if (p.suspension > 0) alerts.push({ p, text: `Suspended · ${p.suspension} m`, tone: "bad" });
    if (p.transferRequest) alerts.push({ p, text: "Wants to leave", tone: "bad" });
    else if (p.unhappyWeeks >= 2) alerts.push({ p, text: "Unhappy", tone: "warn" });
    if (!p.loan && p.contract.expires <= season) alerts.push({ p, text: "Contract expiring", tone: "warn" });
    if (p.fitness < 70 && p.injuryWeeks === 0) alerts.push({ p, text: `Tired · ${Math.round(p.fitness)}%`, tone: "warn" });
  }
  return (
    <Panel title="Squad alerts" subtitle={alerts.length ? `${alerts.length} to look at` : "All clear"}>
      {alerts.length === 0 ? (
        <Empty>Everyone is fit, happy and under contract.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {alerts.slice(0, 8).map((a, i) => (
            <li key={i}>
              <Link href={`/player?id=${a.p.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2">
                <PosBadge pos={a.p.positions[0]} />
                <span className="flex-1 truncate">
                  {a.p.firstName[0]}. {a.p.lastName}
                </span>
                <Tag tone={a.tone}>{a.text}</Tag>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const STEPS = [
  { key: "tactics", label: "Set up your tactics and roles", href: "/tactics" },
  { key: "training", label: "Plan this week's training", href: "/training" },
  { key: "scouting", label: "Give your scout an assignment", href: "/scouting" },
  { key: "transfers", label: "Look around the transfer market", href: "/transfers" },
  { key: "match", label: "Play your first match", href: "/match" },
] as const;

function Onboarding() {
  const save = useCareer();
  const ob = save.onboarding;
  if (!ob || ob.dismissed) return null;
  const done = STEPS.filter((s) => ob[s.key]).length;
  if (done === STEPS.length) return null;
  return (
    <Card className="border-highlight-strong bg-highlight/40 p-4">
      <CardHeader
        title={`Getting started · ${done} of ${STEPS.length}`}
        subtitle="Your assistant suggests these first steps."
        action={
          <Button size="sm" variant="ghost" onClick={() => updateSave((d) => void (d.onboarding.dismissed = true))}>
            Dismiss
          </Button>
        }
      />
      <ol className="grid gap-1.5 px-4 pb-1 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface", ob[s.key] && "text-muted line-through")}>
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", ob[s.key] ? "border-win bg-win text-white" : "border-line-strong")}>
                {ob[s.key] && <Icon d={ICONS.check} className="h-3 w-3" />}
              </span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
