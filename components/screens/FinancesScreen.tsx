"use client";

import { ClubOps } from "../ClubOps";
import { staffBill, wageBill } from "@/game/career";
import { academyUpgradeCost, facilitiesUpgradeCost, MAX_ACADEMY, upgradeAcademy, upgradeFacilities } from "@/game/club";
import { formatMoney } from "@/game/ratings";
import { act, useCareer } from "@/lib/store/save-store";
import { BarChart } from "../charts";
import { toast } from "../overlay";
import { Button, Card, Empty, Meter, PageHeader, Panel, StatTile, cn } from "../ui";

export function FinancesScreen() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const wages = wageBill(save, club.id);
  const staff = staffBill(save, club.id);
  const budget = save.board.wageBudget;

  // Weekly net, oldest first, for the current season
  const season = save.leagues[0].season;
  const weeks = new Map<number, number>();
  for (const l of save.ledger) if (l.season === season) weeks.set(l.week, (weeks.get(l.week) ?? 0) + l.amount);
  const series = [...weeks.entries()].sort((a, b) => a[0] - b[0]).slice(-16);
  const lastWeek = series.length ? series[series.length - 1] : null;
  const latestLines = lastWeek ? save.ledger.filter((l) => l.season === season && l.week === lastWeek[0]) : [];
  const seasonTotals = new Map<string, number>();
  for (const l of save.ledger) {
    if (l.season !== season) continue;
    const key = l.label.startsWith("Compensation") ? "Staff compensation" : l.label.startsWith("Staff signing") ? "Staff signings" : l.label;
    seasonTotals.set(key, (seasonTotals.get(key) ?? 0) + l.amount);
  }
  const income = [...seasonTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const spend = [...seasonTotals.entries()].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const cost = academyUpgradeCost(club.academy);

  return (
    <div>
      <PageHeader eyebrow="Club" title="Finances" subtitle="Income comes from sponsors, TV money and home gates. Wages are paid every week, matches or not." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Balance" value={formatMoney(club.balance)} tone={club.balance < 0 ? "bad" : "neutral"} hint={club.balance < 0 ? "The board hates debt" : undefined} />
        <StatTile label="Last week" value={lastWeek ? formatMoney(lastWeek[1]) : "–"} tone={lastWeek ? (lastWeek[1] >= 0 ? "good" : "bad") : undefined} />
        <StatTile label="Player wages" value={`${formatMoney(wages)}/wk`} hint={`Budget ${formatMoney(budget)}/wk`} tone={wages > budget * 1.05 ? "bad" : undefined} />
        <StatTile label="Staff wages" value={`${formatMoney(staff)}/wk`} />
      </div>

      <div className="mb-4">
        <ClubOps />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Weekly profit & loss" subtitle="Net result of each week this season" className="lg:col-span-2">
          <div className="px-4 pb-4">{series.length ? <BarChart data={series.map(([w, v]) => ({ label: `W${w}`, value: v }))} height={160} formatter={formatMoney} /> : <Empty title="No weeks played yet" />}</div>
        </Panel>

        <Panel title="Wage budget" subtitle="Going over it costs board confidence">
          <div className="flex flex-col gap-2 px-4 pb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Used</span>
              <span className="tabular">{Math.round((wages / Math.max(1, budget)) * 100)}%</span>
            </div>
            <Meter value={Math.min(100, (wages / Math.max(1, budget)) * 100)} label="Wage budget used" />
            <div className="flex justify-between text-muted">
              <span>Room for new wages</span>
              <span className={cn("tabular", budget - wages < 0 ? "text-loss-ink" : "text-text")}>{formatMoney(budget - wages)}/wk</span>
            </div>
          </div>
        </Panel>

        <Panel title="This season">
          <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-1">
            <Lines title="Income" lines={income} />
            <Lines title="Spending" lines={spend} />
          </div>
        </Panel>

        <Panel title={lastWeek ? `Week ${lastWeek[0]} breakdown` : "Last week"}>
          <div className="px-4 pb-4">
            {latestLines.length ? (
              <Lines
                title=""
                lines={latestLines.map((l) => [l.label, l.amount])}
              />
            ) : (
              <p className="text-sm text-muted">Nothing yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Training ground" subtitle="Players develop faster with better facilities (×0.88 at level 1 to ×1.12 at level 5)">
          <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Level</span>
              <span className="font-semibold">
                {"●".repeat(club.facilities.training)}
                <span className="text-line">{"●".repeat(MAX_ACADEMY - club.facilities.training)}</span>
              </span>
            </div>
            {club.facilities.training < MAX_ACADEMY ? (
              <Button
                variant="primary"
                size="sm"
                disabled={club.balance < facilitiesUpgradeCost(club.facilities.training)}
                onClick={() => {
                  if (!confirm(`Upgrade the training ground to level ${club.facilities.training + 1} for ${formatMoney(facilitiesUpgradeCost(club.facilities.training))}? Upkeep rises by £4k a week.`)) return;
                  const r = act((d) => upgradeFacilities(d));
                  toast(r.ok ? "Work starts on the new training facilities." : (r.reason ?? "Not possible."), r.ok ? "good" : "bad");
                }}
              >
                Upgrade for {formatMoney(facilitiesUpgradeCost(club.facilities.training))}
              </Button>
            ) : (
              <p className="text-muted">Top-level facilities.</p>
            )}
          </div>
        </Panel>

        <Panel title="Youth academy" subtitle="Better facilities mean more prospects with higher potential">
          <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Level</span>
              <span className="font-semibold">
                {"●".repeat(club.academy)}
                <span className="text-line">{"●".repeat(MAX_ACADEMY - club.academy)}</span>
              </span>
            </div>
            {club.academy < MAX_ACADEMY ? (
              <Button
                variant="primary"
                size="sm"
                disabled={club.balance < cost}
                onClick={() => {
                  if (!confirm(`Upgrade the academy to level ${club.academy + 1} for ${formatMoney(cost)}? Upkeep rises by £4k a week.`)) return;
                  const r = act((d) => upgradeAcademy(d));
                  toast(r.ok ? "Work begins on the new academy facilities." : (r.reason ?? "Not possible."), r.ok ? "good" : "bad");
                }}
              >
                Upgrade for {formatMoney(cost)}
              </Button>
            ) : (
              <p className="text-muted">Top-level facilities.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Lines({ title, lines }: { title: string; lines: [string, number][] }) {
  return (
    <div>
      {title && <div className="eyebrow mb-1.5">{title}</div>}
      {lines.length === 0 ? (
        <p className="text-sm text-muted">None.</p>
      ) : (
        <Card className="divide-y divide-line border-0 bg-transparent">
          {lines.map(([label, v]) => (
            <div key={label} className="flex justify-between py-1.5 text-sm">
              <span className="text-muted">{label}</span>
              <span className={cn("tabular", v < 0 ? "text-loss-ink" : "text-win-ink")}>{formatMoney(v)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
