"use client";

import { useState } from "react";
import { PROMOTION_PLACES, userLeague } from "@/game/career";
import { fixturesForRound, leagueTable, totalRounds } from "@/game/competition";
import type { SaveGame } from "@/game/save";
import type { League, Player } from "@/game/types";
import { useCareer } from "@/lib/store/save-store";
import { PlayerLink } from "../PlayerParts";
import { Button, Card, CardHeader, Crest, Empty, FormPills, PageHeader, Segmented, Tabs, cn } from "../ui";

type Tab = "table" | "fixtures" | "stats";

export function LeagueScreen() {
  const save = useCareer();
  const [leagueId, setLeagueId] = useState(userLeague(save).id);
  const [tab, setTab] = useState<Tab>("table");
  const league = save.leagues.find((l) => l.id === leagueId) ?? userLeague(save);
  const isTop = league.tier === 1;
  const isBottom = league.tier === Math.max(...save.leagues.map((l) => l.tier));

  return (
    <div>
      <PageHeader
        eyebrow={`Season ${league.season} · Tier ${league.tier}`}
        title={league.name}
        subtitle={[`Matchday ${Math.min(league.currentRound + 1, totalRounds(league))} of ${totalRounds(league)}`, !isTop && `top ${PROMOTION_PLACES} go up`, !isBottom && `bottom ${PROMOTION_PLACES} go down`].filter(Boolean).join(" · ")}
        actions={
          save.leagues.length > 1 && (
            <Segmented value={league.id} onChange={setLeagueId} options={save.leagues.map((l) => ({ value: l.id, label: l.name.replace(/^.*shire /, "") }))} />
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: "table", label: "Table" },
          { value: "fixtures", label: "Fixtures" },
          { value: "stats", label: "Stat leaders" },
        ]}
      />
      {tab === "table" && <Table save={save} league={league} isTop={isTop} isBottom={isBottom} />}
      {tab === "fixtures" && <Fixtures key={league.id} save={save} league={league} />}
      {tab === "stats" && <Leaders save={save} league={league} />}
    </div>
  );
}

function Table({ save, league, isTop, isBottom }: { save: SaveGame; league: League; isTop: boolean; isBottom: boolean }) {
  const table = leagueTable(league);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="text-right">
            <th className="w-8 py-2 pl-4 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Club</th>
            <th className="w-8 font-medium">P</th>
            <th className="w-8 font-medium">W</th>
            <th className="w-8 font-medium">D</th>
            <th className="w-8 font-medium">L</th>
            <th className="hidden w-12 font-medium sm:table-cell">GF</th>
            <th className="hidden w-12 font-medium sm:table-cell">GA</th>
            <th className="w-14 font-medium">GD</th>
            <th className="w-10 font-medium">Pts</th>
            <th className="hidden w-28 pr-4 text-right font-medium sm:table-cell">Form</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r, i) => {
            const c = save.clubs[r.clubId];
            const up = (!isTop && i < PROMOTION_PLACES) || (isTop && i === 0);
            const down = !isBottom && i >= table.length - PROMOTION_PLACES;
            return (
              <tr key={r.clubId} className={cn("border-t border-line/60 text-right tabular", c.isUser && "bg-highlight", up && "shadow-[inset_3px_0_0_var(--win)]", down && "shadow-[inset_3px_0_0_var(--loss)]")}>
                <td className="py-2 pl-4 text-left text-muted">{i + 1}</td>
                <td className="py-2 text-left">
                  <div className="flex items-center gap-2">
                    <Crest design={c.crest} colors={c.colors} label={c.shortName} size={20} />
                    <span className={cn("truncate", c.isUser && "font-semibold")}>{c.name}</span>
                    {c.id === save.clubs[save.userClubId].rivalId && <span className="text-[10px] uppercase tracking-wide text-muted">Rival</span>}
                  </div>
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td className="hidden sm:table-cell">{r.gf}</td>
                <td className="hidden sm:table-cell">{r.ga}</td>
                <td className={r.gd > 0 ? "text-win-ink" : r.gd < 0 ? "text-loss-ink" : ""}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="font-bold">{r.points}</td>
                <td className="hidden pr-4 sm:table-cell">
                  <FormPills form={r.form} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
        <span>
          <span className="mr-1 inline-block h-2.5 w-0.5 bg-win align-middle" />
          {isTop ? "Champions" : "Promotion"}
        </span>
        {!isBottom && (
          <span>
            <span className="mr-1 inline-block h-2.5 w-0.5 bg-loss align-middle" />
            Relegation
          </span>
        )}
      </div>
    </Card>
  );
}

function Fixtures({ save, league }: { save: SaveGame; league: League }) {
  const rounds = totalRounds(league);
  const [round, setRound] = useState(Math.min(league.currentRound, rounds - 1));
  const fixtures = fixturesForRound(league, round);
  return (
    <Card>
      <CardHeader
        title={`Matchday ${round + 1}`}
        action={
          <div className="flex gap-1">
            <Button variant="ghost" className="h-8 w-8 px-0" disabled={round === 0} onClick={() => setRound(round - 1)} aria-label="Previous round">
              ‹
            </Button>
            <Button variant="ghost" className="h-8 w-8 px-0" disabled={round >= rounds - 1} onClick={() => setRound(round + 1)} aria-label="Next round">
              ›
            </Button>
          </div>
        }
      />
      <ul className="pb-2">
        {fixtures.map((f) => {
          const h = save.clubs[f.homeId];
          const a = save.clubs[f.awayId];
          return (
            <li key={f.id} className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-line/60 px-4 py-2.5 text-sm", (h.isUser || a.isUser) && "bg-highlight")}>
              <span className={cn("flex items-center justify-end gap-2 truncate text-right", h.isUser && "font-semibold")}>
                {h.name} <Crest design={h.crest} colors={h.colors} label={h.shortName} size={18} />
              </span>
              <span className="w-14 rounded-md bg-bg py-1 text-center font-bold tabular">{f.result ? `${f.result.homeGoals}–${f.result.awayGoals}` : "v"}</span>
              <span className={cn("flex items-center gap-2 truncate", a.isUser && "font-semibold")}>
                <Crest design={a.crest} colors={a.colors} label={a.shortName} size={18} /> {a.name}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

interface Board {
  title: string;
  value: (p: Player) => number;
  fmt?: (v: number, p: Player) => string;
  filter?: (p: Player) => boolean;
}

const BOARDS: Board[] = [
  { title: "Goals", value: (p) => p.season.goals },
  { title: "Assists", value: (p) => p.season.assists },
  { title: "Average rating", value: (p) => (p.season.apps >= 3 ? p.season.ratingSum / p.season.apps : 0), fmt: (v) => v.toFixed(2), filter: (p) => p.season.apps >= 3 },
  { title: "Expected goals", value: (p) => p.season.xg, fmt: (v) => v.toFixed(1) },
  { title: "Key passes", value: (p) => p.season.keyPasses },
  { title: "Dribbles", value: (p) => p.season.dribbles },
  { title: "Tackles won", value: (p) => p.season.tacklesWon },
  { title: "Interceptions", value: (p) => p.season.interceptions },
  { title: "Clean sheets", value: (p) => p.season.cleanSheets, filter: (p) => p.positions[0] === "GK" },
  { title: "Yellow cards", value: (p) => p.season.yellows },
];

function Leaders({ save, league }: { save: SaveGame; league: League }) {
  const clubs = new Set(league.clubIds);
  const players = Object.values(save.players).filter((p) => clubs.has(p.clubId) && p.season.apps > 0);
  if (players.length === 0) return <Empty title="No matches played yet">Leaders appear after the first matchday.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {BOARDS.map((b) => {
        const top = players
          .filter((p) => (b.filter ? b.filter(p) : true) && b.value(p) > 0)
          .sort((x, y) => b.value(y) - b.value(x))
          .slice(0, 5);
        return (
          <Card key={b.title}>
            <CardHeader title={b.title} />
            {top.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">Nobody yet.</p>
            ) : (
              <ol className="pb-2">
                {top.map((p, i) => {
                  const c = save.clubs[p.clubId];
                  const v = b.value(p);
                  return (
                    <li key={p.id} className={cn("flex items-center gap-2 border-t border-line/60 px-4 py-1.5 text-sm", p.clubId === save.userClubId && "bg-highlight")}>
                      <span className="w-4 text-xs text-muted tabular">{i + 1}</span>
                      <Crest design={c.crest} colors={c.colors} label={c.shortName} size={16} />
                      <PlayerLink p={p} className="min-w-0 flex-1 truncate hover:underline" />
                      <span className="text-xs text-muted tabular">{p.season.apps} apps</span>
                      <span className="w-10 text-right font-semibold tabular">{b.fmt ? b.fmt(v, p) : v}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        );
      })}
    </div>
  );
}
