"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { currentSeason, squadOf, wageBill } from "@/game/career";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS } from "@/game/constants";
import { averageForm, formatMoney, overall, playerValue, traitFlags, TRAIT_INFO } from "@/game/ratings";
import { STATUS_INFO, recentShare } from "@/game/squad";
import type { Player } from "@/game/types";
import { perceivedPotential } from "@/game/progress";
import { useCareer } from "@/lib/store/save-store";
import { PotentialStars } from "../PlayerParts";
import { Button, ButtonLink, Card, Meter, Ovr, PageHeader, PosBadge, Segmented, Tabs, Tag, attrTextColor, cn } from "../ui";

type View = "overview" | "attributes" | "stats" | "morale" | "contracts";
type Group = "all" | "gk" | "def" | "mid" | "att";

const GROUP_OF: Record<string, Group> = {
  GK: "gk", CB: "def", LB: "def", RB: "def", DM: "mid", CM: "mid", AM: "mid", LM: "mid", RM: "mid", LW: "att", RW: "att", ST: "att",
};
const POS_ORDER = ["GK", "RB", "CB", "LB", "DM", "CM", "RM", "LM", "AM", "RW", "LW", "ST"];
const ABBR: Record<string, string> = {
  crossing: "CRO", dribbling: "DRI", finishing: "FIN", firstTouch: "FIR", freeKicks: "FRE", heading: "HEA", longShots: "LON", marking: "MAR",
  passing: "PAS", penalties: "PEN", tackling: "TAC", technique: "TEC", anticipation: "ANT", bravery: "BRA", composure: "CMP", concentration: "CNT",
  decisions: "DEC", flair: "FLA", leadership: "LEA", offTheBall: "OTB", positioning: "POS", teamwork: "TEA", vision: "VIS", workRate: "WOR",
  acceleration: "ACC", agility: "AGI", balance: "BAL", jumping: "JUM", naturalFitness: "NAT", pace: "PAC", stamina: "STA", strength: "STR",
  goalkeeping: "REF", handling: "HAN", oneOnOnes: "1V1", aerialReach: "AER", kicking: "KIC",
};

interface Col {
  key: string;
  label: ReactNode;
  title?: string;
  num?: boolean;
  sort?: (p: Player) => number | string;
  cell: (p: Player) => ReactNode;
  className?: string;
}

export function SquadScreen() {
  const save = useCareer();
  const router = useRouter();
  const params = useSearchParams();
  const club = save.clubs[save.userClubId];
  const season = currentSeason(save);
  const [view, setView] = useState<View>((params.get("view") as View) || "overview");
  const [attrGroup, setAttrGroup] = useState(0);
  const [group, setGroup] = useState<Group>("all");
  const [sortKey, setSortKey] = useState("pos");
  const [desc, setDesc] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const squad = squadOf(save, club.id);
  const inXI = new Set(club.tactics.lineup);
  const list = squad.filter((p) => group === "all" || GROUP_OF[p.positions[0]] === group);
  const avgAge = squad.reduce((a, p) => a + p.age, 0) / Math.max(1, squad.length);

  const nameCol: Col = {
    key: "name",
    label: "Player",
    sort: (p) => p.lastName,
    cell: (p) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-5 text-right text-xs text-muted tabular">{p.shirt}</span>
        <Link href={`/player?id=${p.id}`} className="truncate font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
          {p.firstName[0]}. {p.lastName}
        </Link>
        {inXI.has(p.id) && <Tag tone="highlight">XI</Tag>}
        {p.injuryWeeks > 0 && <Tag tone="bad">Inj {p.injuryWeeks}w</Tag>}
        {p.suspension > 0 && <Tag tone="bad">Ban {p.suspension}</Tag>}
        {p.loan && <Tag>Loan</Tag>}
        {p.transferRequest && <Tag tone="bad">Wants out</Tag>}
        {traitFlags(p).map((f) => (
          <Tag key={f.key} title={TRAIT_INFO[f.key].blurb}>
            {f.text}
          </Tag>
        ))}
      </div>
    ),
  };
  const posCol: Col = { key: "pos", label: "Pos", sort: (p) => POS_ORDER.indexOf(p.positions[0]) * 100 - overall(p), cell: (p) => <PosBadge pos={p.positions[0]} /> };

  const views: Record<View, Col[]> = {
    overview: [
      posCol,
      nameCol,
      { key: "age", label: "Age", num: true, sort: (p) => p.age, cell: (p) => p.age },
      { key: "ovr", label: "OVR", num: true, sort: (p) => overall(p), cell: (p) => <Ovr value={overall(p)} /> },
      { key: "pot", label: "Potential", sort: (p) => perceivedPotential(save, p)[0] + perceivedPotential(save, p)[1], cell: (p) => <PotentialStars save={save} p={p} /> },
      { key: "status", label: "Status", sort: (p) => p.status, cell: (p) => <span className="text-xs">{STATUS_INFO[p.status].label}</span> },
      { key: "form", label: "Form", num: true, sort: (p) => averageForm(p) ?? 0, cell: (p) => (averageForm(p)?.toFixed(1) ?? "–") },
      { key: "fit", label: "Fitness", sort: (p) => p.fitness, cell: (p) => <Meter value={p.fitness} className="w-16" label="Fitness" /> },
      { key: "value", label: "Value", num: true, sort: (p) => playerValue(p), cell: (p) => formatMoney(playerValue(p)) },
    ],
    attributes: [
      posCol,
      nameCol,
      { key: "ovr", label: "OVR", num: true, sort: (p) => overall(p), cell: (p) => <Ovr value={overall(p)} /> },
      ...ATTRIBUTE_GROUPS[attrGroup].keys.map(
        (k): Col => ({
          key: k,
          label: ABBR[k],
          title: ATTRIBUTE_LABELS[k],
          num: true,
          sort: (p) => p.attributes[k],
          cell: (p) => <span className={attrTextColor(p.attributes[k])}>{Math.floor(p.attributes[k])}</span>,
        }),
      ),
    ],
    stats: [
      posCol,
      nameCol,
      { key: "apps", label: "Apps", num: true, sort: (p) => p.season.apps, cell: (p) => p.season.apps },
      { key: "min", label: "Mins", num: true, sort: (p) => p.season.minutes, cell: (p) => p.season.minutes },
      { key: "g", label: "G", num: true, sort: (p) => p.season.goals, cell: (p) => p.season.goals },
      { key: "a", label: "A", num: true, sort: (p) => p.season.assists, cell: (p) => p.season.assists },
      { key: "xg", label: "xG", num: true, sort: (p) => p.season.xg, cell: (p) => p.season.xg.toFixed(1) },
      { key: "sh", label: "Shots", num: true, sort: (p) => p.season.shots, cell: (p) => p.season.shots },
      { key: "pa", label: "Pass %", num: true, sort: (p) => (p.season.passes ? p.season.passesCompleted / p.season.passes : 0), cell: (p) => (p.season.passes ? `${Math.round((p.season.passesCompleted / p.season.passes) * 100)}%` : "–") },
      { key: "tk", label: "Tkl", title: "Tackles won", num: true, sort: (p) => p.season.tacklesWon, cell: (p) => p.season.tacklesWon },
      { key: "int", label: "Int", title: "Interceptions", num: true, sort: (p) => p.season.interceptions, cell: (p) => p.season.interceptions },
      { key: "rt", label: "Avg", title: "Average rating", num: true, sort: (p) => (p.season.apps ? p.season.ratingSum / p.season.apps : 0), cell: (p) => (p.season.apps ? (p.season.ratingSum / p.season.apps).toFixed(2) : "–") },
      { key: "yc", label: "YC", num: true, sort: (p) => p.season.yellows, cell: (p) => p.season.yellows },
    ],
    morale: [
      posCol,
      nameCol,
      { key: "status", label: "Status", sort: (p) => p.status, cell: (p) => <span className="text-xs">{STATUS_INFO[p.status].label}</span> },
      {
        key: "share",
        label: "Playing time",
        title: "Recent share of minutes vs what his status expects",
        sort: (p) => recentShare(p) - STATUS_INFO[p.status].expects,
        cell: (p) => {
          const share = recentShare(p);
          const exp = STATUS_INFO[p.status].expects;
          return (
            <span className={cn("text-xs tabular", share < exp - 0.15 ? "text-loss-ink" : "text-text")}>
              {Math.round(share * 100)}% <span className="text-muted">/ {Math.round(exp * 100)}%</span>
            </span>
          );
        },
      },
      { key: "morale", label: "Morale", sort: (p) => p.morale, cell: (p) => <Meter value={p.morale} className="w-20" label="Morale" /> },
      { key: "fit", label: "Fitness", sort: (p) => p.fitness, cell: (p) => <Meter value={p.fitness} className="w-20" label="Fitness" /> },
      {
        key: "mood",
        label: "Mood",
        sort: (p) => (p.transferRequest ? 0 : p.unhappyWeeks ? 1 : 2),
        cell: (p) =>
          p.transferRequest ? <Tag tone="bad">Wants to leave</Tag> : p.promise ? <Tag tone="highlight">Promised minutes</Tag> : p.unhappyWeeks >= 2 ? <Tag tone="warn">Unhappy</Tag> : <Tag tone="good">Content</Tag>,
      },
    ],
    contracts: [
      posCol,
      nameCol,
      { key: "age", label: "Age", num: true, sort: (p) => p.age, cell: (p) => p.age },
      { key: "wage", label: "Wage / wk", num: true, sort: (p) => p.contract.wage, cell: (p) => formatMoney(p.contract.wage) },
      {
        key: "exp",
        label: "Expires",
        num: true,
        sort: (p) => p.contract.expires,
        cell: (p) => (p.loan ? <span className="text-xs text-muted">On loan</span> : <span className={cn(p.contract.expires <= season && "font-semibold text-loss-ink")}>End of S{p.contract.expires}</span>),
      },
      { key: "value", label: "Value", num: true, sort: (p) => playerValue(p), cell: (p) => formatMoney(playerValue(p)) },
      {
        key: "act",
        label: "",
        cell: (p) =>
          !p.loan && p.contract.expires <= season + 1 ? (
            <Link href={`/player?id=${p.id}&tab=contract`} className="text-xs font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
              Renew
            </Link>
          ) : null,
      },
    ],
  };

  const cols = views[view];
  const sortCol = cols.find((c) => c.key === sortKey && c.sort) ?? posCol;
  const sorted = [...list].sort((a, b) => {
    const x = sortCol.sort!(a);
    const y = sortCol.sort!(b);
    const r = typeof x === "string" ? String(x).localeCompare(String(y)) : (x as number) - (y as number);
    return desc ? -r : r;
  });

  function toggleSort(key: string) {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "pos" && key !== "name");
    }
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Squad"
        subtitle={`${squad.length} players · average age ${avgAge.toFixed(1)} · wage bill ${formatMoney(wageBill(save, club.id))}/wk`}
        actions={
          <ButtonLink href={picked.length === 2 ? `/compare?a=${picked[0]}&b=${picked[1]}` : "/compare"} variant={picked.length === 2 ? "primary" : "secondary"} size="sm">
            Compare {picked.length ? `(${picked.length}/2)` : "players"}
          </ButtonLink>
        }
      />
      <Tabs
        value={view}
        onChange={(v) => {
          setView(v);
          router.replace(`/squad?view=${v}`, { scroll: false });
        }}
        options={[
          { value: "overview", label: "Overview" },
          { value: "attributes", label: "Attributes" },
          { value: "stats", label: "Season stats" },
          { value: "morale", label: "Morale & playing time" },
          { value: "contracts", label: "Contracts" },
        ]}
      />
      <div className="my-3 flex flex-wrap items-center gap-3">
        <Segmented
          value={group}
          onChange={setGroup}
          size="sm"
          options={[
            { value: "all", label: "All" },
            { value: "gk", label: "GK" },
            { value: "def", label: "DEF" },
            { value: "mid", label: "MID" },
            { value: "att", label: "ATT" },
          ]}
        />
        <span className="text-xs text-muted">Tick two players to compare them. Click a name for the full profile.</span>
      </div>
      {view === "attributes" && (
        <Segmented
          className="mb-3"
          value={String(attrGroup)}
          onChange={(v) => setAttrGroup(Number(v))}
          options={ATTRIBUTE_GROUPS.map((g, i) => ({ value: String(i), label: g.label }))}
        />
      )}
      <Card className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th className="w-8">
                <span className="sr-only">Compare</span>
              </th>
              {cols.map((c) => (
                <th key={c.key} className={cn(c.num && "num")} title={c.title} aria-sort={sortKey === c.key ? (desc ? "descending" : "ascending") : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className={cn("hover:text-text", sortKey === c.key && "text-text")}>
                      {c.label}
                      {sortKey === c.key && (desc ? " ↓" : " ↑")}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="row-link" onClick={() => router.push(`/player?id=${p.id}`)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Compare ${p.lastName}`} checked={picked.includes(p.id)} onChange={() => togglePick(p.id)} className="h-4 w-4 accent-black" />
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={cn(c.num && "num", c.className)}>
                    {c.cell(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {picked.length === 2 && (
        <div className="fixed inset-x-0 bottom-20 z-20 flex justify-center px-4 md:bottom-6">
          <div className="flex items-center gap-3 rounded-md bg-accent px-4 py-2 text-sm text-accent-ink shadow-lg">
            {picked.map((id) => save.players[id].lastName).join(" vs ")}
            <ButtonLink href={`/compare?a=${picked[0]}&b=${picked[1]}`} size="sm" variant="highlight">
              Compare
            </ButtonLink>
            <Button size="sm" variant="ghost" className="text-accent-ink/80 hover:bg-white/10 hover:text-accent-ink" onClick={() => setPicked([])}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
