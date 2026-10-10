"use client";

import Link from "next/link";
import { useState } from "react";
import { currentSeason } from "@/game/career";
import { contractDemand } from "@/game/economy";
import { formatMoney } from "@/game/ratings";
import { perceivedPotential } from "@/game/progress";
import type { SaveGame } from "@/game/save";
import { askingPrice, buyPlayer, loanIn, renewContract, signingDemand, userInterest, type BuyResult } from "@/game/transfers";
import type { Attributes, Player, Position } from "@/game/types";
import { act } from "@/lib/store/save-store";
import { Dialog, toast } from "./overlay";
import { Button, Field, Stars, Tag } from "./ui";

export const ALL_POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"];

export const RADAR_AXES = ["Pace", "Shooting", "Passing", "Dribbling", "Defending", "Aerial", "Mental"];

export function radarValues(a: Attributes): number[] {
  const avg = (...v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  return [
    avg(a.pace, a.acceleration, a.stamina),
    avg(a.finishing, a.longShots, a.technique, a.composure),
    avg(a.passing, a.vision, a.crossing),
    avg(a.dribbling, a.agility, a.firstTouch),
    avg(a.tackling, a.marking, a.positioning, a.anticipation),
    avg(a.heading, a.jumping, a.strength),
    avg(a.decisions, a.composure, a.teamwork, a.workRate),
  ];
}

/** Potential as your coach (own players) or scouts (others) judge it. */
export function PotentialStars({ save, p }: { save: SaveGame; p: Player }) {
  const [lo, hi] = perceivedPotential(save, p);
  return <Stars value={(lo + hi) / 2} range={lo === hi ? undefined : [lo, hi]} />;
}

export function PlayerLink({ p, className }: { p: Pick<Player, "id" | "firstName" | "lastName">; className?: string }) {
  return (
    <Link href={`/player?id=${p.id}`} className={className ?? "font-medium underline-offset-4 hover:underline"}>
      {p.firstName[0]}. {p.lastName}
    </Link>
  );
}

export function SeasonSheet({ p }: { p: Player }) {
  const ss = p.season;
  const per90 = (v: number) => (ss.minutes ? ((v / ss.minutes) * 90).toFixed(2) : "–");
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const groups: { title: string; items: [string, string | number][] }[] = [
    {
      title: "General",
      items: [
        ["Apps", ss.apps],
        ["Minutes", ss.minutes],
        ["Avg rating", ss.apps ? (ss.ratingSum / ss.apps).toFixed(2) : "–"],
        ["Km / 90", ss.minutes ? ((ss.distance / 1000 / ss.minutes) * 90).toFixed(1) : "–"],
      ],
    },
    {
      title: "Attacking",
      items: [
        ["Goals", ss.goals],
        ["Assists", ss.assists],
        ["Shots (on)", `${ss.shots} (${ss.shotsOnTarget})`],
        ["xG", ss.xg.toFixed(2)],
        ["Goals / 90", per90(ss.goals)],
        ["Key passes", ss.keyPasses],
        ["Dribbles", ss.dribbles],
        ["Offsides", ss.offsides],
      ],
    },
    { title: "Passing", items: [["Passes", ss.passes], ["Completed", ss.passesCompleted], ["Pass %", pct(ss.passesCompleted, ss.passes)], ["Passes / 90", per90(ss.passes)]] },
    { title: "Defending", items: [["Tackles won", `${ss.tacklesWon}/${ss.tackles}`], ["Tackle %", pct(ss.tacklesWon, ss.tackles)], ["Interceptions", ss.interceptions], ["Fouls", ss.fouls]] },
    { title: "Discipline", items: [["Yellow", ss.yellows], ["Red", ss.reds], ["Banned", p.suspension ? `${p.suspension} m` : "–"], ["Injury", p.injuryWeeks ? `${p.injuryWeeks} wk` : "–"]] },
  ];
  if (p.positions[0] === "GK") {
    groups.splice(1, 0, { title: "Goalkeeping", items: [["Saves", ss.saves], ["Conceded", ss.conceded], ["Save %", pct(ss.saves, ss.saves + ss.conceded)], ["Clean sheets", ss.cleanSheets]] });
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="eyebrow mb-1.5">{g.title}</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {g.items.map(([l, v]) => (
              <div key={l} className="rounded-md bg-surface-2 px-2.5 py-2">
                <div className="text-[11px] text-muted">{l}</div>
                <div className="text-base font-semibold tabular">{v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WageYears({ wage, years, onWage, onYears }: { wage: number; years: number; onWage: (n: number) => void; onYears: (n: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Weekly wage">
        <input className="input tabular" type="number" step={500} min={0} value={wage} onChange={(e) => onWage(Number(e.target.value))} />
      </Field>
      <Field label="Contract length">
        <select className="input" value={years} onChange={(e) => onYears(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((y) => (
            <option key={y} value={y}>
              {y} year{y > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/** Two-step transfer: agree a fee with the club, then terms with the player. */
export function BidDialog({ save, p, open, onClose }: { save: SaveGame; p: Player; open: boolean; onClose: () => void }) {
  const ask = askingPrice(save, p);
  const [fee, setFee] = useState(ask);
  const [stage, setStage] = useState<"fee" | "terms">("fee");
  const demand = signingDemand(save, p);
  const [wage, setWage] = useState(demand.wage);
  const [years, setYears] = useState(demand.years);
  const [msg, setMsg] = useState<string | null>(null);
  const [counter, setCounter] = useState<number | null>(null);
  const keen = userInterest(save, p);
  const free = p.clubId === "FA";
  const club = save.clubs[p.clubId];

  function submit(f = fee) {
    const r: BuyResult = act((d) => buyPlayer(d, p.id, f, stage === "terms" ? { wage, years } : undefined));
    if (r.ok) {
      toast(`${p.lastName} signed!`, "good");
      onClose();
      return;
    }
    if ("stage" in r) {
      setStage("terms");
      setFee(r.fee);
      setMsg(r.reason);
      setCounter(null);
      return;
    }
    setMsg(r.reason);
    setCounter(r.counter ?? null);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stage === "fee" ? (free ? `Sign ${p.lastName}` : `Bid for ${p.lastName}`) : "Personal terms"}
      description={stage === "fee" ? (free ? "He's a free agent: no fee, just agree terms." : `${club?.name} value him at ${formatMoney(ask)}.`) : `Fee agreed at ${formatMoney(fee)}. ${p.lastName} wants about ${formatMoney(demand.wage)}/wk for ${demand.years} years.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => submit()}>
            {stage === "fee" ? (free ? "Open talks" : `Bid ${formatMoney(fee)}`) : "Offer contract"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Interest in joining you:</span>
          <Tag tone={keen >= 0.6 ? "good" : keen >= 0.35 ? "warn" : "bad"}>{keen >= 0.6 ? "Keen" : keen >= 0.35 ? "Open to it" : keen >= 0.25 ? "Reluctant" : "Not interested"}</Tag>
          <span className="text-muted">· Budget {formatMoney(save.clubs[save.userClubId].balance)}</span>
        </div>
        {stage === "fee" && !free && (
          <Field label="Transfer fee" hint="Bids within 20% of their valuation may get a counter-offer.">
            <input className="input tabular" type="number" step={5000} min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
          </Field>
        )}
        {stage === "terms" && <WageYears wage={wage} years={years} onWage={setWage} onYears={setYears} />}
        {msg && <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">{msg}</p>}
        {counter && (
          <Button variant="highlight" onClick={() => submit(counter)}>
            Meet their price: {formatMoney(counter)}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

export function RenewDialog({ save, p, open, onClose }: { save: SaveGame; p: Player; open: boolean; onClose: () => void }) {
  const tier = save.leagues.find((l) => l.clubIds.includes(save.userClubId))?.tier ?? 2;
  const demand = contractDemand(p, { tier, season: currentSeason(save) });
  const [wage, setWage] = useState(demand.wage);
  const [years, setYears] = useState(demand.years);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Renew ${p.lastName}`}
      description={`Currently ${formatMoney(p.contract.wage)}/wk until the end of season ${p.contract.expires}. He's asking for about ${formatMoney(demand.wage)}/wk over ${demand.years} year${demand.years > 1 ? "s" : ""}.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const r = act((d) => renewContract(d, p.id, { wage, years }));
              if (r.ok) {
                toast(`${p.lastName} signs a new deal.`, "good");
                onClose();
              } else setMsg(r.reason ?? "He turned it down.");
            }}
          >
            Offer contract
          </Button>
        </>
      }
    >
      <WageYears wage={wage} years={years} onWage={setWage} onYears={setYears} />
      {msg && <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm">{msg}</p>}
    </Dialog>
  );
}

export function LoanDialog({ save, p, open, onClose }: { save: SaveGame; p: Player; open: boolean; onClose: () => void }) {
  const [share, setShare] = useState(75);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Loan ${p.lastName}`}
      description={`Until the end of the season. He earns ${formatMoney(p.contract.wage)}/wk; you choose how much of that you'll cover.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const r = act((d) => loanIn(d, p.id, share / 100));
              if (r.ok) {
                toast(`${p.lastName} joins on loan.`, "good");
                onClose();
              } else setMsg(r.reason ?? "They said no.");
            }}
          >
            Propose loan
          </Button>
        </>
      }
    >
      <Field label={`Wages you pay: ${share}% (${formatMoney((p.contract.wage * share) / 100)}/wk)`}>
        <input type="range" className="slider w-full" min={25} max={100} step={5} value={share} onChange={(e) => setShare(Number(e.target.value))} />
      </Field>
      {msg && <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm">{msg}</p>}
    </Dialog>
  );
}
