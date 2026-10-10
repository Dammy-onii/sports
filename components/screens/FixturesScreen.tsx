"use client";

import Link from "next/link";
import { useState } from "react";
import { slotFixtures } from "@/game/career";
import { tieWinner } from "@/game/cup";
import type { CalendarSlot, SaveGame } from "@/game/save";
import type { Fixture } from "@/game/types";
import { useCareer } from "@/lib/store/save-store";
import { Card, Crest, PageHeader, Segmented, Tag, cn } from "../ui";

type Filter = "all" | "league" | "cup";

/** The user's season, week by week: results so far and fixtures to come. */
export function FixturesScreen() {
  const save = useCareer();
  const me = save.userClubId;
  const [filter, setFilter] = useState<Filter>("all");

  const rows = save.calendar.map((slot, i) => {
    const mine = slotFixtures(save, slot).find(
      (x) => x.fixture.homeId === me || x.fixture.awayId === me,
    );
    return { slot, i, mine };
  });

  const inCup = save.cup.alive.includes(me) && !save.cup.winnerId;
  const placeholder = (slot: CalendarSlot, i: number) => {
    if (
      slot.kind === "cup" &&
      i >= save.calendarIndex &&
      inCup &&
      !save.cup.rounds[slot.round]
    )
      return "To be drawn";
    if (slot.kind === "cup" && !inCup) return "Out of the cup";
    if (slot.kind === "preseason") return "Training camp / rest week";
    if (slot.kind === "intl") return "No club football: international duty";
    return "No match for you this week";
  };

  const visible = rows.filter(
    ({ slot }) =>
      filter === "all" ||
      (filter === "league" ? slot.kind === "league" : slot.kind !== "league"),
  );
  const played = rows.filter((r) => r.mine?.fixture.result);
  const record = played.reduce(
    (acc, { mine }) => {
      const f = mine!.fixture;
      const r = f.result!;
      const us = f.homeId === me ? r.homeGoals : r.awayGoals;
      const them = f.homeId === me ? r.awayGoals : r.homeGoals;
      if (us > them) acc.w++;
      else if (us < them) acc.l++;
      else acc.d++;
      return acc;
    },
    { w: 0, d: 0, l: 0 },
  );

  return (
    <div>
      <PageHeader
        eyebrow={`Season ${save.leagues[0].season}`}
        title="Fixtures & results"
        subtitle={`Played ${played.length} · W${record.w} D${record.d} L${record.l}`}
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "league", label: "League" },
              { value: "cup", label: "Cups" },
            ]}
          />
        }
      />
      <Card>
        <ol className="divide-y divide-line">
          {visible.map(({ slot, i, mine }) => (
            <li
              key={i}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm",
                i === save.calendarIndex && "bg-highlight",
              )}
            >
              <span className="w-14 shrink-0 text-xs text-muted tabular">
                Wk {i + 1}
              </span>
              <span className="hidden w-40 shrink-0 truncate text-xs text-muted sm:block">
                {slotName(
                  slot,
                  save.cup.rounds[slot.kind === "cup" ? slot.round : -1]?.name,
                  save.cup.name,
                )}
              </span>
              {mine ? (
                <FixtureRow save={save} f={mine.fixture} />
              ) : (
                <span className="flex-1 text-muted">
                  {placeholder(slot, i)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function FixtureRow({ save, f }: { save: SaveGame; f: Fixture }) {
  const me = save.userClubId;
  const home = f.homeId === me;
  const opp = save.clubs[home ? f.awayId : f.homeId];
  const r = f.result;
  let outcome: "W" | "D" | "L" | null = null;
  if (r) {
    const us = home ? r.homeGoals : r.awayGoals;
    const them = home ? r.awayGoals : r.homeGoals;
    outcome =
      us > them
        ? "W"
        : us < them
          ? "L"
          : r.penalties
            ? tieWinner(f) === me
              ? "W"
              : "L"
            : "D";
  }
  const report = save.reports.find((x) => x.fixtureId === f.id);
  return (
    <>
      <span className="w-6 shrink-0 text-xs font-semibold text-muted">
        {home ? "H" : "A"}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {opp && (
          <Crest
            design={opp.crest}
            colors={opp.colors}
            label={opp.shortName}
            size={18}
          />
        )}
        <span className="truncate">{opp?.name}</span>
      </span>
      {r ? (
        <span className="flex items-center gap-2">
          <span className="font-semibold tabular">
            {home ? r.homeGoals : r.awayGoals}–
            {home ? r.awayGoals : r.homeGoals}
            {r.penalties && (
              <span className="ml-1 text-xs font-normal text-muted">
                ({home ? r.penalties[0] : r.penalties[1]}–
                {home ? r.penalties[1] : r.penalties[0]} p)
              </span>
            )}
          </span>
          <Tag
            tone={
              outcome === "W" ? "good" : outcome === "L" ? "bad" : "neutral"
            }
            className="w-5 justify-center"
          >
            {outcome}
          </Tag>
          {report ? (
            <Link
              href={`/report?id=${report.id}`}
              className="text-xs text-muted underline-offset-4 hover:underline"
            >
              Report
            </Link>
          ) : (
            <span className="w-[38px]" />
          )}
        </span>
      ) : (
        <span className="text-xs text-muted">Upcoming</span>
      )}
    </>
  );
}

function slotName(
  slot: CalendarSlot,
  cupRound: string | undefined,
  cupName: string,
) {
  if (slot.kind === "league") return `League · Matchday ${slot.round + 1}`;
  if (slot.kind === "super") return "Super Cup";
  if (slot.kind === "preseason") return `Pre-season · week ${slot.week + 1}`;
  if (slot.kind === "intl") return "International break";
  return `${cupName}${cupRound ? ` · ${cupRound}` : ""}`;
}
