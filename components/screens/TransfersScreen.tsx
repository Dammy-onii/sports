"use client";

import { useState } from "react";
import { squadOf, wageBill } from "@/game/career";
import { formatMoney, overall, playerValue } from "@/game/ratings";
import type { SaveGame } from "@/game/save";
import { fmtRange, GROUP_OF, knowledgeOf, ovrRange } from "@/game/scouting";
import { MAX_SQUAD, MIN_SQUAD, acceptOffer, askingPrice, isDeadlineWeek, isWindowOpen, loanAvailable, rejectOffer, toggleListed, toggleShortlist, userInterest, windowLabel } from "@/game/transfers";
import type { Player } from "@/game/types";
import { act, updateSave, useCareer, useOnboarding } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { BidDialog, LoanDialog, PlayerLink, PotentialStars } from "../PlayerParts";
import { Button, ButtonLink, Card, Crest, Empty, PageHeader, PosBadge, Segmented, StatTile, Tabs, Tag, cn } from "../ui";

type Tab = "market" | "shortlist" | "loans" | "offers" | "selling" | "history";
type Group = "all" | "GK" | "DEF" | "MID" | "ATT";

/** What the user can see of a player: his OVR range midpoint (never the hidden truth). */
function seenOvr(save: SaveGame, p: Player) {
  const [lo, hi] = ovrRange(p, knowledgeOf(save, p));
  return (lo + hi) / 2;
}

function interestTag(v: number) {
  return v >= 0.6 ? <Tag tone="good">Keen</Tag> : v >= 0.35 ? <Tag tone="warn">Open</Tag> : v >= 0.25 ? <Tag tone="bad">Reluctant</Tag> : <Tag tone="bad">Not interested</Tag>;
}

export function TransfersScreen() {
  const save = useCareer();
  useOnboarding("transfers");
  const club = save.clubs[save.userClubId];
  const [tab, setTab] = useState<Tab>("market");
  const open = isWindowOpen(save);
  const squadSize = squadOf(save, club.id).length;
  const wageRoom = save.board.wageBudget - wageBill(save, club.id);

  return (
    <div>
      <PageHeader
        eyebrow="Club"
        title="Transfers"
        subtitle={open ? (isDeadlineWeek(save) ? "Deadline week: last chance before the window shuts." : windowLabel(save)) : `${windowLabel(save)}. You can scout, shortlist and list players now; deals go through when it reopens.`}
        actions={
          <ButtonLink href="/scouting" size="sm">
            Scouting
          </ButtonLink>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Transfer budget" value={formatMoney(club.balance)} tone={club.balance < 0 ? "bad" : undefined} />
        <StatTile label="Wage room" value={`${formatMoney(wageRoom)}/wk`} tone={wageRoom < 0 ? "bad" : undefined} hint="Under the board's budget" />
        <StatTile label="Squad" value={`${squadSize} / ${MAX_SQUAD}`} hint={`Minimum ${MIN_SQUAD}`} />
        <StatTile label="Window" value={open ? "Open" : "Closed"} tone={open ? "good" : undefined} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: "market", label: "Market" },
          { value: "shortlist", label: `Shortlist${save.shortlist.length ? ` (${save.shortlist.length})` : ""}` },
          { value: "loans", label: "Loans" },
          { value: "offers", label: `Offers${save.offers.length ? ` (${save.offers.length})` : ""}` },
          { value: "selling", label: "Selling" },
          { value: "history", label: "History" },
        ]}
      />
      {tab === "market" && <Market save={save} open={open} />}
      {tab === "shortlist" && <Shortlist save={save} open={open} />}
      {tab === "loans" && <Loans save={save} open={open} />}
      {tab === "offers" && <Offers save={save} open={open} />}
      {tab === "selling" && <Selling save={save} />}
      {tab === "history" && <History save={save} />}
    </div>
  );
}

function Market({ save, open }: { save: SaveGame; open: boolean }) {
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [maxAge, setMaxAge] = useState(40);
  const [minOvr, setMinOvr] = useState(0);
  const [affordable, setAffordable] = useState(false);
  const [scouted, setScouted] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const budget = save.clubs[save.userClubId].balance;

  const list = Object.values(save.players)
    .filter((p) => p.clubId !== save.userClubId && !p.loan)
    .filter((p) => group === "all" || GROUP_OF[p.positions[0]] === group)
    .filter((p) => p.age <= maxAge && seenOvr(save, p) >= minOvr)
    .filter((p) => !scouted || knowledgeOf(save, p) >= 60)
    .filter((p) => !freeOnly || p.clubId === "FA")
    .filter((p) => !query || `${p.firstName} ${p.lastName}`.toLowerCase().includes(query.toLowerCase()))
    .map((p) => ({ p, ask: askingPrice(save, p), seen: seenOvr(save, p) }))
    .filter((x) => !affordable || x.ask <= budget)
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 80);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name" className="input h-9 w-40" aria-label="Search by name" />
        <Segmented value={group} onChange={setGroup} options={(["all", "GK", "DEF", "MID", "ATT"] as Group[]).map((g) => ({ value: g, label: g === "all" ? "All" : g }))} />
        <label className="flex items-center gap-2 text-xs text-muted">
          Max age
          <select value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} className="input h-8 w-auto py-0">
            {[19, 21, 23, 25, 28, 31, 40].map((a) => (
              <option key={a} value={a}>
                {a === 40 ? "Any" : a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          Min OVR
          <select value={minOvr} onChange={(e) => setMinOvr(Number(e.target.value))} className="input h-8 w-auto py-0">
            {[0, 50, 55, 60, 65, 70].map((a) => (
              <option key={a} value={a}>
                {a || "Any"}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["Affordable", affordable, setAffordable],
            ["Scouted", scouted, setScouted],
            ["Free agents", freeOnly, setFreeOnly],
          ] as const
        ).map(([label, v, set]) => (
          <label key={label} className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" className="accent-black" checked={v} onChange={(e) => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </Card>
      <p className="text-xs text-muted">Ratings are your scouts&apos; estimates. Ranges narrow as they learn more. Sorted by estimated OVR.</p>
      <PlayerTable save={save} rows={list} open={open} />
    </div>
  );
}

function PlayerTable({ save, rows, open, empty = "No players match those filters." }: { save: SaveGame; rows: { p: Player; ask: number }[]; open: boolean; empty?: string }) {
  const [bid, setBid] = useState<Player | null>(null);
  const [loan, setLoan] = useState<Player | null>(null);
  const budget = save.clubs[save.userClubId].balance;
  if (!rows.length)
    return (
      <Card>
        <Empty>{empty}</Empty>
      </Card>
    );
  return (
    <Card className="overflow-x-auto">
      <table className="table min-w-[680px]">
        <thead>
          <tr>
            <th className="w-8" />
            <th>Pos</th>
            <th>Player</th>
            <th>Club</th>
            <th className="num">Age</th>
            <th className="num">OVR</th>
            <th>Potential</th>
            <th className="num">Asking</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, ask }) => {
            const c = save.clubs[p.clubId];
            const k = knowledgeOf(save, p);
            const listed = save.shortlist.includes(p.id);
            return (
              <tr key={p.id}>
                <td>
                  <button onClick={() => act((d) => toggleShortlist(d, p.id))} aria-label={listed ? `Remove ${p.lastName} from shortlist` : `Shortlist ${p.lastName}`} aria-pressed={listed} className={cn("text-base leading-none", listed ? "text-text" : "text-line-strong hover:text-muted")}>
                    {listed ? "★" : "☆"}
                  </button>
                </td>
                <td>
                  <PosBadge pos={p.positions[0]} />
                </td>
                <td className="whitespace-nowrap">
                  <PlayerLink p={p} />
                </td>
                <td>
                  {c ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Crest design={c.crest} colors={c.colors} label={c.shortName} size={16} /> {c.shortName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Free agent</span>
                  )}
                </td>
                <td className="num text-muted">{p.age}</td>
                <td className="num font-semibold" title={`Scouting knowledge ${Math.round(k)}%`}>
                  {k >= 90 ? overall(p) : fmtRange(ovrRange(p, k))}
                </td>
                <td>
                  <PotentialStars save={save} p={p} />
                </td>
                <td className={cn("num", ask > budget && "text-muted")}>{p.clubId === "FA" ? "Free" : formatMoney(ask)}</td>
                <td className="num">
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="primary" disabled={!open} onClick={() => setBid(p)}>
                      {p.clubId === "FA" ? "Sign" : "Bid"}
                    </Button>
                    {loanAvailable(save, p) && (
                      <Button size="sm" variant="ghost" disabled={!open} onClick={() => setLoan(p)}>
                        Loan
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {bid && <BidDialog key={bid.id} save={save} p={bid} open onClose={() => setBid(null)} />}
      {loan && <LoanDialog key={loan.id} save={save} p={loan} open onClose={() => setLoan(null)} />}
    </Card>
  );
}

function Shortlist({ save, open }: { save: SaveGame; open: boolean }) {
  const rows = save.shortlist
    .map((id) => save.players[id])
    .filter((p): p is Player => !!p && p.clubId !== save.userClubId)
    .map((p) => ({ p, ask: askingPrice(save, p) }));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">Your scout keeps an eye on shortlisted players every week, so their ranges narrow over time.</p>
      <PlayerTable save={save} rows={rows} open={open} empty="Star players in the market or on their profile to track them here." />
    </div>
  );
}

function Loans({ save, open }: { save: SaveGame; open: boolean }) {
  const [loan, setLoan] = useState<Player | null>(null);
  const mine = squadOf(save, save.userClubId);
  const loanedIn = mine.filter((p) => p.loan);
  const loanedOut = Object.values(save.players).filter((p) => p.loan?.fromClubId === save.userClubId);
  const available = Object.values(save.players)
    .filter((p) => loanAvailable(save, p))
    .sort((a, b) => seenOvr(save, b) - seenOvr(save, a))
    .slice(0, 30);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="lg:col-span-2">
        <div className="px-4 pt-3.5 pb-2.5">
          <div className="text-sm font-semibold">Available to loan</div>
          <div className="text-xs text-muted">Young players and squad fillers clubs are willing to let go until the end of the season. Under-21s need half their wages covered; older players three quarters.</div>
        </div>
        {available.length === 0 ? (
          <Empty title="Nobody available" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[620px]">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Player</th>
                  <th>Club</th>
                  <th className="num">Age</th>
                  <th className="num">OVR</th>
                  <th className="num">Wage</th>
                  <th>Interest</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {available.map((p) => {
                  const c = save.clubs[p.clubId];
                  return (
                    <tr key={p.id}>
                      <td>
                        <PosBadge pos={p.positions[0]} />
                      </td>
                      <td className="whitespace-nowrap">
                        <PlayerLink p={p} />
                      </td>
                      <td className="text-xs text-muted">{c?.shortName}</td>
                      <td className="num">{p.age}</td>
                      <td className="num font-semibold">{fmtRange(ovrRange(p, knowledgeOf(save, p)))}</td>
                      <td className="num">{formatMoney(p.contract.wage)}/wk</td>
                      <td>{interestTag(userInterest(save, p))}</td>
                      <td className="num">
                        <Button size="sm" disabled={!open} onClick={() => setLoan(p)}>
                          Propose loan
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <LoanList save={save} title="Loaned in" players={loanedIn} empty="Nobody on loan at your club." from />
      <LoanList save={save} title="Loaned out" players={loanedOut} empty="Use “Loan out” on a player's profile to get him games elsewhere." />
      {loan && <LoanDialog key={loan.id} save={save} p={loan} open onClose={() => setLoan(null)} />}
    </div>
  );
}

function LoanList({ save, title, players, empty, from }: { save: SaveGame; title: string; players: Player[]; empty: string; from?: boolean }) {
  return (
    <Card>
      <div className="px-4 pt-3.5 pb-2.5 text-sm font-semibold">{title}</div>
      {players.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="pb-2">
          {players.map((p) => {
            const other = save.clubs[from ? p.loan!.fromClubId : p.clubId];
            return (
              <li key={p.id} className="flex items-center gap-2 border-t border-line/60 px-4 py-2 text-sm">
                <PosBadge pos={p.positions[0]} />
                <PlayerLink p={p} className="min-w-0 flex-1 truncate hover:underline" />
                <span className="text-xs text-muted">
                  {from ? "from" : "at"} {other?.shortName}
                </span>
                <span className="text-xs text-muted tabular">{p.season.apps} apps</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Offers({ save, open }: { save: SaveGame; open: boolean }) {
  if (!save.offers.length)
    return (
      <Card>
        <Empty>No offers right now. List players on the Selling tab to attract bids.</Empty>
      </Card>
    );
  return (
    <Card>
      <ul>
        {save.offers.map((o) => {
          const p = save.players[o.playerId];
          const c = save.clubs[o.fromClubId];
          const ratio = o.fee / Math.max(1, playerValue(p));
          return (
            <li key={o.id} className="flex flex-wrap items-center gap-3 border-t border-line/60 px-4 py-3 text-sm first:border-t-0">
              <Crest design={c.crest} colors={c.colors} label={c.shortName} size={28} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {c.name} bid <span className="tabular">{formatMoney(o.fee)}</span> for <PlayerLink p={p} />
                </div>
                <div className="text-xs text-muted">
                  {p.positions[0]} · {overall(p)} OVR · value {formatMoney(playerValue(p))} ({ratio >= 1 ? "+" : ""}
                  {Math.round((ratio - 1) * 100)}%) · expires after week {o.expiresRound + 1}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!open}
                onClick={() => {
                  const r = act((d) => acceptOffer(d, o.id));
                  toast(r.ok ? `${p.lastName} sold to ${c.name} for ${formatMoney(o.fee)}.` : (r.reason ?? "Couldn't complete the deal."), r.ok ? "good" : "bad");
                }}
              >
                Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act((d) => rejectOffer(d, o.id))}>
                Reject
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Selling({ save }: { save: SaveGame }) {
  const squad = squadOf(save, save.userClubId)
    .filter((p) => !p.loan)
    .sort((a, b) => overall(b) - overall(a));
  return (
    <Card className="overflow-x-auto">
      <p className="px-4 pt-3 text-xs text-muted">Listed players attract bids from AI clubs each week while the window is open. Keep at least {MIN_SQUAD} players.</p>
      <table className="table min-w-[560px]">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Player</th>
            <th className="num">Age</th>
            <th className="num">OVR</th>
            <th className="num">Value</th>
            <th className="num">Contract</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {squad.map((p) => {
            const listed = save.transferList.includes(p.id);
            return (
              <tr key={p.id}>
                <td>
                  <PosBadge pos={p.positions[0]} />
                </td>
                <td className="whitespace-nowrap">
                  <PlayerLink p={p} />
                  {p.transferRequest && (
                    <Tag tone="bad" className="ml-1.5">
                      Wants out
                    </Tag>
                  )}
                </td>
                <td className="num">{p.age}</td>
                <td className="num font-semibold">{overall(p)}</td>
                <td className="num">{formatMoney(playerValue(p))}</td>
                <td className="num text-xs text-muted">to S{p.contract.expires}</td>
                <td className="num">
                  <Button size="sm" variant={listed ? "primary" : "secondary"} className="w-20" onClick={() => updateSave((d) => toggleListed(d, p.id))}>
                    {listed ? "Listed" : "List"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function History({ save }: { save: SaveGame }) {
  if (!save.transferLog.length)
    return (
      <Card>
        <Empty>No transfers yet.</Empty>
      </Card>
    );
  return (
    <Card>
      <ul className="py-2">
        {save.transferLog.map((t, i) => {
          const from = save.clubs[t.fromClubId];
          const to = save.clubs[t.toClubId];
          const mine = t.fromClubId === save.userClubId || t.toClubId === save.userClubId;
          return (
            <li key={`${t.playerId}-${i}`} className={cn("flex items-center gap-2 border-t border-line/60 px-4 py-2 text-sm first:border-t-0", mine && "bg-highlight")}>
              <span className="w-16 text-xs text-muted">
                S{t.season} · W{t.round + 1}
              </span>
              <span className="flex-1 truncate font-medium">{t.playerName}</span>
              <span className="hidden truncate text-xs text-muted sm:inline">
                {from?.shortName ?? "Free"} → {to?.shortName ?? "Free"}
              </span>
              <span className="w-16 text-right tabular">{t.fee ? formatMoney(t.fee) : "Free"}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
