"use client";

import { useSearchParams } from "next/navigation";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS } from "@/game/constants";
import { formatMoney, overall, playerValue } from "@/game/ratings";
import { attrRange, fmtRange, knowledgeOf, ovrRange } from "@/game/scouting";
import type { Attributes, Player } from "@/game/types";
import { useCareer } from "@/lib/store/save-store";
import { Radar } from "../charts";
import { PlayerLink, RADAR_AXES, radarValues } from "../PlayerParts";
import { Card, Empty, PageHeader, Panel, attrTextColor, cn } from "../ui";

const COLORS = ["#2f8f57", "#141414"];

/** Side-by-side comparison of two players (?a=&b=). Other clubs' players show scouted ranges. */
export function CompareScreen() {
  const save = useCareer();
  const params = useSearchParams();
  const players = [params.get("a"), params.get("b")].map((id) => (id ? save.players[id] : undefined)).filter((p): p is Player => !!p);
  if (players.length < 2) {
    return <Empty title="Pick two players">Tick two players in the squad list, then press Compare.</Empty>;
  }
  const k = players.map((p) => knowledgeOf(save, p));
  // Radar uses the midpoint of what the scouts know, so it never leaks hidden values.
  const seen = players.map((p, i) => {
    const a = { ...p.attributes } as Attributes;
    for (const key of Object.keys(a) as (keyof Attributes)[]) {
      const [lo, hi] = attrRange(p, key, p.attributes[key], k[i]);
      a[key] = (lo + hi) / 2;
    }
    return a;
  });
  const showGk = players.some((p) => p.positions[0] === "GK");

  return (
    <div>
      <PageHeader eyebrow="Team" title="Compare players" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel title="Profile">
          <div className="flex flex-col items-center gap-3 px-4 pb-4">
            <Radar axes={RADAR_AXES} series={players.map((p, i) => ({ label: p.lastName, values: radarValues(seen[i]), color: COLORS[i] }))} />
            <div className="flex gap-4 text-sm">
              {players.map((p, i) => (
                <span key={p.id} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                  <PlayerLink p={p} />
                </span>
              ))}
            </div>
          </div>
        </Panel>
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th />
                {players.map((p) => (
                  <th key={p.id} className="num">
                    {p.lastName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Club" values={players.map((p) => save.clubs[p.clubId]?.shortName ?? "Free agent")} />
              <Row label="Age" values={players.map((p) => p.age)} />
              <Row label="Positions" values={players.map((p) => p.positions.join(" "))} />
              <Row label="Overall" values={players.map((p, i) => (k[i] >= 90 ? overall(p) : fmtRange(ovrRange(p, k[i]))))} />
              <Row label="Value" values={players.map((p) => formatMoney(playerValue(p)))} />
              <Row label="Apps / goals / assists" values={players.map((p) => `${p.season.apps} / ${p.season.goals} / ${p.season.assists}`)} />
              <Row label="Avg rating" values={players.map((p) => (p.season.apps ? (p.season.ratingSum / p.season.apps).toFixed(2) : "–"))} />
              {ATTRIBUTE_GROUPS.filter((g) => showGk || g.label !== "Goalkeeping").map((g) => (
                <AttrGroup key={g.label} label={g.label} keys={g.keys} players={players} k={k} />
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, values }: { label: string; values: (string | number)[] }) {
  return (
    <tr>
      <td className="text-muted">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="num">
          {v}
        </td>
      ))}
    </tr>
  );
}

function AttrGroup({ label, keys, players, k }: { label: string; keys: (keyof Attributes)[]; players: Player[]; k: number[] }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="eyebrow pt-4">
          {label}
        </td>
      </tr>
      {keys.map((key) => {
        const ranges = players.map((p, i) => attrRange(p, key, p.attributes[key], k[i]));
        const mids = ranges.map(([lo, hi]) => (lo + hi) / 2);
        const best = mids[0] === mids[1] ? -1 : mids[0] > mids[1] ? 0 : 1;
        return (
          <tr key={key}>
            <td className="text-muted">{ATTRIBUTE_LABELS[key]}</td>
            {ranges.map((r, i) => (
              <td key={i} className={cn("num font-semibold", attrTextColor(r[1]), best === i && "bg-highlight")}>
                {fmtRange(r)}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
