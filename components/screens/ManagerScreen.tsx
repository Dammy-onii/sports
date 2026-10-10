"use client";

import { ordinal } from "@/game/career";
import { confidenceLabel } from "@/game/board";
import { useCareer } from "@/lib/store/save-store";
import { Card, Empty, Meter, PageHeader, Panel, StatTile, Tag } from "../ui";

export function ManagerScreen() {
  const save = useCareer();
  const m = save.manager;
  const b = save.board;
  const winPct = m.played ? Math.round((m.won / m.played) * 100) : 0;
  return (
    <div>
      <PageHeader eyebrow="Manager" title={m.name} subtitle={`Managing ${save.clubs[save.userClubId].name}. Reputation affects job offers and whether players want to join you.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Reputation" value={`${Math.round(m.reputation)} / 100`} />
        <StatTile label="Matches" value={m.played} />
        <StatTile label="W / D / L" value={`${m.won} / ${m.drawn} / ${m.lost}`} />
        <StatTile label="Win rate" value={`${winPct}%`} />
        <StatTile label="Trophies" value={m.trophies.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="The board" subtitle={b.objective.label}>
          <div className="flex flex-col gap-2 px-4 pb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Confidence</span>
              <span className="font-medium">{confidenceLabel(b.confidence)}</span>
            </div>
            <Meter value={b.confidence} label="Board confidence" />
            <p className="text-xs text-muted">Below 12 after matchday 10 and you&apos;re out. Results against the objective, debt and an over-budget wage bill all move it.</p>
          </div>
        </Panel>

        <Panel title="Trophy cabinet" className="lg:col-span-2">
          <div className="px-4 pb-4">
            {m.trophies.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Empty for now. The cup is the quickest way to change that.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {m.trophies.map((t, i) => (
                  <li key={i} className="rounded-md bg-highlight px-3 py-2.5">
                    <div className="text-lg" aria-hidden>
                      🏆
                    </div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted">
                      {t.clubName} · season {t.season}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel title="Career" subtitle="Clubs managed">
          <ul className="flex flex-col gap-1.5 px-4 pb-4 text-sm">
            {m.clubs.map((c, i) => (
              <li key={i} className="flex justify-between">
                <span>{c.name}</span>
                <span className="text-muted tabular">
                  {c.from}–{c.to ?? "now"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Card className="lg:col-span-2">
          <div className="px-4 pt-3.5 pb-2.5 text-sm font-semibold">Season history</div>
          {save.history.length === 0 ? (
            <Empty title="First season in progress" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Club</th>
                  <th>Division</th>
                  <th className="num">Pos</th>
                  <th className="num">Pts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...save.history].reverse().map((h, i) => (
                  <tr key={i}>
                    <td className="tabular">{h.season}</td>
                    <td>{h.clubName ?? "–"}</td>
                    <td className="text-muted">{h.leagueName}</td>
                    <td className="num">{ordinal(h.position)}</td>
                    <td className="num">{h.points}</td>
                    <td>
                      {h.outcome && (
                        <Tag tone={h.outcome === "relegated" || h.outcome === "sacked" ? "bad" : "good"} className="capitalize">
                          {h.outcome}
                        </Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
