"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { MatchReport, ReportPlayer } from "@/game/analysis";
import { useCareer } from "@/lib/store/save-store";
import { Heatmap, Momentum, PassNetwork, XgTimeline } from "../charts";
import {
  Card,
  Crest,
  Empty,
  PageHeader,
  Panel,
  Segmented,
  cn,
  ratingChip,
} from "../ui";

const STAT_ROWS: [key: string, label: string, pct?: boolean][] = [
  ["possession", "Possession", true],
  ["xg", "Expected goals"],
  ["shots", "Shots"],
  ["onTarget", "On target"],
  ["passes", "Passes"],
  ["passAccuracy", "Pass accuracy", true],
  ["tackles", "Tackles"],
  ["corners", "Corners"],
  ["fouls", "Fouls"],
  ["offsides", "Offsides"],
  ["yellows", "Yellow cards"],
  ["reds", "Red cards"],
  ["saves", "Saves"],
];

const EVENT_ICON: Record<string, string> = {
  goal: "⚽",
  penalty: "◎",
  yellow: "🟨",
  red: "🟥",
  sub: "⇄",
  injury: "✚",
};

/** Post-match analysis for the user's recent matches (?id= picks one). */
export function ReportScreen() {
  const save = useCareer();
  const router = useRouter();
  const params = useSearchParams();
  const r =
    save.reports.find((x) => x.id === params.get("id")) ?? save.reports[0];
  if (!r)
    return (
      <Empty title="No reports yet">
        Play a match and the analysts will have a full breakdown ready.
      </Empty>
    );

  const home = save.clubs[r.homeId];
  const away = save.clubs[r.awayId];
  const userSide = r.homeId === save.userClubId ? 0 : 1;
  const homeColor = home?.colors.primary ?? "#141414";
  const awayColor =
    away && away.colors.primary.toLowerCase() !== homeColor.toLowerCase()
      ? away.colors.primary
      : (away?.colors.secondary ?? "#888");
  const goals = r.events
    .filter((e) => e.type === "goal")
    .map((e) => ({ minute: e.minute, side: e.side }));
  const name = (id?: string) =>
    id
      ? (r.players.find((p) => p.id === id)?.name ??
        save.players[id]?.lastName ??
        "")
      : "";
  const pom = r.players.find((p) => p.id === r.playerOfMatch);

  return (
    <div>
      <PageHeader
        eyebrow={r.competition}
        title="Match report"
        actions={
          save.reports.length > 1 && (
            <select
              className="input w-auto"
              value={r.id}
              onChange={(e) => router.replace(`/report?id=${e.target.value}`)}
              aria-label="Choose a match"
            >
              {save.reports.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.homeName} {x.score[0]}–{x.score[1]} {x.awayName}
                </option>
              ))}
            </select>
          )
        }
      />

      <Card className="mb-4 px-4 py-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row-reverse sm:justify-start sm:text-right">
            {home && <Crest design={home.crest} colors={home.colors} label={home.shortName} size={44} />}
            <span className="max-w-full truncate font-display text-lg sm:text-2xl md:text-3xl">{r.homeName}</span>
          </div>
          <div className="font-display text-4xl leading-none tabular sm:text-5xl">
            {r.score[0]}–{r.score[1]}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
            {away && <Crest design={away.crest} colors={away.colors} label={away.shortName} size={44} />}
            <span className="max-w-full truncate font-display text-lg sm:text-2xl md:text-3xl">{r.awayName}</span>
          </div>
        </div>
        {r.penalties && (
          <div className="mt-2 text-center text-sm font-medium">
            {r.penalties[0]}–{r.penalties[1]} on penalties
          </div>
        )}
        {pom && <div className="mt-3 text-center text-xs text-muted">Player of the match: {pom.name} ({pom.rating.toFixed(1)})</div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Team stats" className="lg:row-span-2">
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            {STAT_ROWS.map(([key, label, pct]) => {
              const a = r.stats[0][key] ?? 0;
              const b = r.stats[1][key] ?? 0;
              const total = a + b || 1;
              const fmt = (v: number) =>
                key === "xg" ? v.toFixed(2) : pct ? `${v}%` : v;
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className={cn("tabular", a > b && "font-semibold")}>
                      {fmt(a)}
                    </span>
                    <span className="text-muted">{label}</span>
                    <span className={cn("tabular", b > a && "font-semibold")}>
                      {fmt(b)}
                    </span>
                  </div>
                  <div className="flex h-1.5 gap-0.5 overflow-hidden rounded">
                    <div
                      style={{
                        width: `${(a / total) * 100}%`,
                        background: homeColor,
                      }}
                      className="ring-1 ring-line ring-inset"
                    />
                    <div
                      style={{
                        width: `${(b / total) * 100}%`,
                        background: awayColor,
                      }}
                      className="ring-1 ring-line ring-inset"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Expected goals"
          subtitle="Cumulative chance quality; dots are goals"
          className="lg:col-span-2"
        >
          <div className="px-4 pb-4">
            <XgTimeline
              home={r.xg[0]}
              away={r.xg[1]}
              homeColor={homeColor}
              awayColor={awayColor}
              goals={goals}
            />
          </div>
        </Panel>

        <Panel
          title="Momentum"
          subtitle={`Above the line: ${r.homeName} on top`}
          className="lg:col-span-2"
        >
          <div className="px-4 pb-4">
            <Momentum
              values={r.momentum}
              homeColor={homeColor}
              awayColor={awayColor}
              height={64}
            />
          </div>
        </Panel>

        <Panel title="Key events">
          <ol className="flex flex-col gap-1.5 px-4 pb-4 text-sm">
            {r.events.length === 0 && (
              <li className="text-muted">A quiet one.</li>
            )}
            {r.events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="w-8 shrink-0 text-xs text-muted tabular">
                  {e.minute}′
                </span>
                <span
                  className="h-2 w-2 shrink-0 self-center rounded-full ring-1 ring-line"
                  style={{ background: e.side === 0 ? homeColor : awayColor }}
                  title={e.side === 0 ? r.homeName : r.awayName}
                />
                <span aria-hidden>{EVENT_ICON[e.type] ?? "•"}</span>
                <span>
                  {e.type === "sub" ? (
                    <>
                      {name(e.player)}{" "}
                      <span className="text-muted">for {name(e.other)}</span>
                    </>
                  ) : (
                    <>
                      {name(e.player)}
                      {e.type === "penalty" && <span className="text-muted"> wins a penalty</span>}
                      {e.type === "goal" && e.other && (
                        <span className="text-muted">
                          {" "}
                          (assist {name(e.other)})
                        </span>
                      )}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <PlayerRatings r={r} />

        <TeamShape r={r} side={userSide} />
      </div>
    </div>
  );
}

function PlayerRatings({ r }: { r: MatchReport }) {
  const cols = [0, 1] as const;
  return (
    <Panel title="Ratings" className="lg:col-span-2">
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        {cols.map((side) => (
          <div key={side}>
            <div className="eyebrow mb-1.5">
              {side === 0 ? r.homeName : r.awayName}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {r.players
                .filter((p) => p.side === side)
                .sort((a, b) => b.minutes - a.minutes || b.rating - a.rating)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="w-7 text-xs text-muted">{p.pos}</span>
                    <Link
                      href={`/player?id=${p.id}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {p.name}
                      {p.goals > 0 && (
                        <span className="ml-1">{"⚽".repeat(p.goals)}</span>
                      )}
                      {p.assists > 0 && (
                        <span className="ml-1 text-xs text-muted">
                          A{p.assists > 1 ? p.assists : ""}
                        </span>
                      )}
                    </Link>
                    <span className="text-xs text-muted tabular">
                      {p.minutes}′
                    </span>
                    <span
                      className={cn(
                        "w-9 rounded px-1 text-center text-xs font-semibold tabular",
                        ratingChip(p.rating),
                        p.id === r.playerOfMatch && "ring-1 ring-text",
                      )}
                    >
                      {p.rating.toFixed(1)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Pass network and per-player heatmaps for the user's side. */
function TeamShape({ r, side }: { r: MatchReport; side: 0 | 1 }) {
  const mine = r.players.filter((p) => p.side === side);
  const starters = mine.filter((p) => p.minutes >= 30);
  const [view, setView] = useState<"network" | "heat">("network");
  const [pick, setPick] = useState<string>(
    starters.find((p) => p.pos !== "GK")?.id ?? mine[0]?.id ?? "",
  );
  const touches = new Map<string, number>();
  for (const [a, b, n] of r.links) {
    touches.set(a, (touches.get(a) ?? 0) + n);
    touches.set(b, (touches.get(b) ?? 0) + n);
  }
  const maxT = Math.max(1, ...touches.values());
  // stored positions are team-relative (attacking right) so they draw directly
  const nodes = starters.map((p: ReportPlayer) => ({
    id: p.id,
    label: String(p.shirt),
    x: p.ax,
    y: p.ay,
    size: (touches.get(p.id) ?? 0) / maxT,
  }));
  const picked = mine.find((p) => p.id === pick);
  return (
    <Card className="lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div>
          <div className="text-sm font-semibold">Your team&apos;s shape</div>
          <div className="text-xs text-muted">
            {view === "network"
              ? "Average positions; thicker lines mean more passes between players"
              : "Where a player spent the match"}
          </div>
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "network", label: "Pass network" },
            { value: "heat", label: "Heatmaps" },
          ]}
        />
      </div>
      <div className="grid gap-4 px-4 pb-4 md:grid-cols-[1fr_220px]">
        <div className="mx-auto w-full max-w-2xl">
          {view === "network" ? (
            <PassNetwork nodes={nodes} links={r.links} />
          ) : picked?.heat ? (
            <Heatmap heat={picked.heat} label={`${picked.name} heatmap`} />
          ) : (
            <Empty title="No data" />
          )}
        </div>
        {view === "heat" && (
          <ul className="flex flex-col gap-0.5 text-sm">
            {mine.map((p) => (
              <li key={p.id}>
                <button
                  className={cn(
                    "w-full rounded-md px-2 py-1 text-left hover:bg-surface-2",
                    p.id === pick && "bg-highlight",
                  )}
                  onClick={() => setPick(p.id)}
                >
                  <span className="mr-2 text-xs text-muted">{p.pos}</span>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {view === "network" && (
          <ul className="flex flex-col gap-0.5 text-xs text-muted">
            {starters.map((p) => (
              <li key={p.id}>
                <span className="inline-block w-6 font-semibold text-text tabular">
                  {p.shirt}
                </span>
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
