"use client";

import { useState } from "react";
import { leagueRows, percentile, playerPercentiles, teamSummary } from "@/game/analytics";
import { userLeague } from "@/game/career";
import { overall } from "@/game/ratings";
import { useCareer } from "@/lib/store/save-store";
import { PairBars, ShotMap, Sparkline } from "../charts";
import { PlayerLink } from "../PlayerParts";
import { Card, Empty, PageHeader, Panel, PosBadge, StatTile, Tabs, cn } from "../ui";

type Tab = "team" | "league" | "players";

function Pct({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded bg-surface-2">
        <span className={cn("block h-full", v >= 70 ? "bg-win" : v >= 35 ? "bg-warn" : "bg-loss")} style={{ width: `${v}%` }} />
      </span>
      <span className="w-8 text-right text-xs tabular">{v}</span>
    </span>
  );
}

/** Season analytics: team trends, league comparison and player percentiles. */
export function AnalyticsScreen() {
  const save = useCareer();
  const [tab, setTab] = useState<Tab>("team");
  const matches = save.analytics?.season === save.leagues[0].season ? save.analytics.matches : [];
  const league = userLeague(save);

  return (
    <div>
      <PageHeader eyebrow="Club" title="Analytics" subtitle="How your team is really doing, and how it compares with the division." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: "team", label: "Team" },
          { value: "league", label: "League comparison" },
          { value: "players", label: "Players" },
        ]}
      />
      {tab === "team" && (matches.length ? <TeamView matches={matches} /> : <Empty title="No matches yet">The analysts start logging from your first competitive match.</Empty>)}
      {tab === "league" && <LeagueView />}
      {tab === "players" && (
        <PlayersView league={league} />
      )}
    </div>
  );
}

function TeamView({ matches }: { matches: NonNullable<ReturnType<typeof useCareer>["analytics"]>["matches"] }) {
  const save = useCareer();
  const t = teamSummary(matches);
  const per = (v: number) => (v / Math.max(1, t.played)).toFixed(2);
  const shots = matches.slice(-8).flatMap((m) => m.shots);
  const pts: number[] = matches.map((m) => (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0));
  const rolling = pts.map((_, i) => {
    const w = pts.slice(Math.max(0, i - 4), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const luck = t.gf - t.xgF - (t.ga - t.xgA);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Record" value={`W${t.won} D${t.drawn} L${t.lost}`} hint={`${t.played} matches`} />
        <StatTile label="Goals / xG for" value={`${t.gf} / ${t.xgF.toFixed(1)}`} hint={`${per(t.gf)} per match`} />
        <StatTile label="Goals / xG against" value={`${t.ga} / ${t.xgA.toFixed(1)}`} hint={`${per(t.ga)} per match`} />
        <StatTile label="Shots for / against" value={`${per(t.shotsF)} / ${per(t.shotsA)}`} hint="Per match" />
        <StatTile label="Possession" value={`${t.possession}%`} hint={luck > 2 ? "Results ahead of performances" : luck < -2 ? "Performances deserve more" : "Results match performances"} tone={luck < -2 ? "bad" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="xG per match" subtitle="Green: ours · orange: theirs (latest 12)">
          <div className="px-4 pb-4">
            <PairBars
              aLabel="xG for"
              bLabel="xG against"
              data={matches.slice(-12).map((m) => ({ label: save.clubs[m.oppId]?.shortName ?? "?", a: m.xgF, b: m.xgA }))}
              height={130}
            />
          </div>
        </Panel>
        <Panel title="Form" subtitle="Points per game, five-match rolling average">
          <div className="px-4 pb-4">
            <Sparkline values={rolling} min={0} max={3} width={420} height={110} className="w-full" />
          </div>
        </Panel>
        <Panel title="Goals by period" subtitle="When you score (green) and concede (orange)">
          <div className="px-4 pb-4">
            <PairBars aLabel="Scored" bLabel="Conceded" data={["0–15", "16–30", "31–45", "46–60", "61–75", "76–90+"].map((label, i) => ({ label, a: t.periods.for[i], b: t.periods.against[i] }))} />
          </div>
        </Panel>
        <Panel title="How goals come" subtitle="Open play, set pieces and penalties">
          <div className="grid grid-cols-2 gap-4 px-4 pb-4 text-sm">
            {(["for", "against"] as const).map((k) => (
              <dl key={k} className="grid grid-cols-[1fr_auto] gap-y-1">
                <dt className="col-span-2 eyebrow">{k === "for" ? "Scored" : "Conceded"}</dt>
                <dt className="text-muted">Open play</dt>
                <dd className="tabular">{t.sources[k].o}</dd>
                <dt className="text-muted">Set pieces</dt>
                <dd className="tabular">{t.sources[k].s}</dd>
                <dt className="text-muted">Penalties</dt>
                <dd className="tabular">{t.sources[k].p}</dd>
              </dl>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Shot map" subtitle="Last 8 matches. You attack right (green), opponents attack left (orange). Bigger = better chance; filled = goal.">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <ShotMap shots={shots} />
        </div>
      </Panel>
    </div>
  );
}

function LeagueView() {
  const save = useCareer();
  const league = userLeague(save);
  const rows = leagueRows(league).filter((r) => r.played > 0);
  const me = rows.find((r) => r.clubId === save.userClubId);
  if (!me) return <Empty title="No league matches yet" />;
  const metrics: { label: string; get: (r: (typeof rows)[number]) => number; lower?: boolean; fmt: (v: number) => string }[] = [
    { label: "Goals scored", get: (r) => r.gf, fmt: (v) => v.toFixed(2) },
    { label: "Goals conceded", get: (r) => r.ga, lower: true, fmt: (v) => v.toFixed(2) },
    { label: "xG for", get: (r) => r.xgF, fmt: (v) => v.toFixed(2) },
    { label: "xG against", get: (r) => r.xgA, lower: true, fmt: (v) => v.toFixed(2) },
    { label: "Shots", get: (r) => r.shots, fmt: (v) => v.toFixed(1) },
    { label: "Possession", get: (r) => r.possession, fmt: (v) => `${Math.round(v)}%` },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Where you rank" subtitle={`Per-match averages against the ${league.name}`}>
        <table className="table">
          <tbody>
            {metrics.map((m) => {
              const all = rows.map(m.get);
              const v = m.get(me);
              const rank = [...all].sort((a, b) => (m.lower ? a - b : b - a)).indexOf(v) + 1;
              return (
                <tr key={m.label}>
                  <td className="text-muted">{m.label}</td>
                  <td className="num tabular">{m.fmt(v)}</td>
                  <td className="num text-xs text-muted">{rank}/{rows.length}</td>
                  <td className="num">
                    <Pct v={percentile(v, all, m.lower)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Card>
        <div className="px-4 pt-3.5 pb-2.5 text-sm font-semibold">Division by xG difference</div>
        <table className="table">
          <thead>
            <tr>
              <th>Club</th>
              <th className="num">xG</th>
              <th className="num">xGA</th>
              <th className="num">Diff</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => b.xgF - b.xgA - (a.xgF - a.xgA))
              .map((r) => (
                <tr key={r.clubId} className={cn(r.clubId === save.userClubId && "bg-highlight")}>
                  <td>{save.clubs[r.clubId]?.name}</td>
                  <td className="num tabular">{r.xgF.toFixed(2)}</td>
                  <td className="num tabular">{r.xgA.toFixed(2)}</td>
                  <td className={cn("num tabular", r.xgF - r.xgA >= 0 ? "text-win-ink" : "text-loss-ink")}>{(r.xgF - r.xgA).toFixed(2)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PlayersView({ league }: { league: ReturnType<typeof userLeague> }) {
  const save = useCareer();
  const squad = Object.values(save.players)
    .filter((p) => p.clubId === save.userClubId && p.season.minutes >= 270)
    .sort((a, b) => overall(b) - overall(a));
  if (!squad.length) return <Empty title="Not enough minutes yet">Players need 270 league minutes to be compared.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {squad.map((p) => (
        <Panel
          key={p.id}
          title={
            <span className="flex items-center gap-2">
              <PosBadge pos={p.positions[0]} />
              <PlayerLink p={p} />
            </span>
          }
          subtitle={`${p.season.minutes}′ · percentiles vs his position in the division`}
        >
          <dl className="flex flex-col gap-1.5 px-4 pb-4 text-sm">
            {playerPercentiles(save, p, league).map((m) => (
              <div key={m.label} className="flex items-center justify-between gap-2">
                <dt className="text-muted">
                  {m.label} <span className="text-xs">({m.per90}/90)</span>
                </dt>
                <dd>
                  <Pct v={m.value} />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      ))}
    </div>
  );
}
