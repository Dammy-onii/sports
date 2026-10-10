"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatchSetup, Side } from "@/game/engine/types";
import { generateWorld } from "@/game/generate";
import { overall } from "@/game/ratings";
import type { SaveGame } from "@/game/save";
import { matchSetupFor } from "@/game/setup";
import type { Club, Player } from "@/game/types";
import { useSave } from "@/lib/store/save-store";
import { MatchViewer } from "../match/MatchViewer";
import { Button, Card, Crest, Segmented, cn } from "../ui";

type Control = "home" | "away" | "watch";

function demoWorld(): { clubs: Record<string, Club>; players: Record<string, Player> } {
  const w = generateWorld(20261009, { name: "Touchline XI", shortName: "TXI", colors: { primary: "#f5f5f5", secondary: "#0a0a0a" }, formation: "4-3-3" });
  return { clubs: w.clubs, players: w.players };
}

export function QuickMatchScreen() {
  const save = useSave();
  if (save === undefined) return <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>;
  return <QuickMatch save={save} />;
}

function teamStrength(club: Club, players: Record<string, Player>) {
  const xi = club.tactics.lineup.map((id) => players[id]).filter(Boolean);
  return Math.round(xi.reduce((a, p) => a + overall(p), 0) / Math.max(1, xi.length));
}

function Picker({
  clubs,
  players,
  value,
  onChange,
  label,
  exclude,
}: {
  clubs: Club[];
  players: Record<string, Player>;
  value: string;
  onChange: (id: string) => void;
  label: string;
  exclude: string;
}) {
  return (
    <Card className="p-3">
      <div className="mb-2 px-1 eyebrow">{label}</div>
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {clubs.map((c) => (
          <li key={c.id}>
            <button
              disabled={c.id === exclude}
              onClick={() => onChange(c.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm disabled:opacity-30",
                value === c.id ? "bg-highlight text-accent" : "hover:bg-surface-2",
              )}
            >
              <Crest design={c.crest} colors={c.colors} label={c.shortName} size={24} />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted tabular">{teamStrength(c, players)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function QuickMatch({ save }: { save: SaveGame | null }) {
  const [world] = useState(() => (save ? { clubs: save.clubs, players: save.players } : demoWorld()));
  const clubs = Object.values(world.clubs).sort((a, b) => b.reputation - a.reputation);
  const userClub = clubs.find((c) => c.isUser);
  const [homeId, setHomeId] = useState(userClub?.id ?? clubs[0].id);
  const [awayId, setAwayId] = useState(clubs.find((c) => c.id !== (userClub?.id ?? clubs[0].id))!.id);
  const [control, setControl] = useState<Control>("home");
  const [game, setGame] = useState<{ setup: MatchSetup; seed: number; human: Side[]; key: number } | null>(null);

  function kickOff() {
    const home = world.clubs[homeId];
    const away = world.clubs[awayId];
    const human: Side[] = control === "home" ? [0] : control === "away" ? [1] : [];
    setGame({
      setup: matchSetupFor(home, away, world.players, { homeAI: !human.includes(0), awayAI: !human.includes(1) }),
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
      human,
      key: Date.now(),
    });
  }

  if (game) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-3 md:px-6 md:py-5">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setGame(null)} className="text-sm text-muted hover:text-text">
            ← Change teams
          </button>
          <span className="text-xs text-muted">Friendly · doesn&apos;t affect your career</span>
        </div>
        <MatchViewer key={game.key} setup={game.setup} seed={game.seed} humanSides={game.human} finishLabel="Play again" onFinish={kickOff} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← Home
      </Link>
      <h1 className="mt-3 font-display text-5xl leading-none">Quick match</h1>
      <p className="mt-1 text-sm text-muted">
        {save ? "Pick any two clubs from your world." : "No career yet, so here's a demo league to play with."}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Picker clubs={clubs} players={world.players} label="Home" value={homeId} onChange={setHomeId} exclude={awayId} />
        <Picker clubs={clubs} players={world.players} label="Away" value={awayId} onChange={setAwayId} exclude={homeId} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">You manage</span>
        <Segmented
          value={control}
          onChange={setControl}
          options={[
            { value: "home", label: "Home" },
            { value: "away", label: "Away" },
            { value: "watch", label: "Just watch" },
          ]}
        />
        <Button variant="primary" className="ml-auto" onClick={kickOff}>
          Kick off
        </Button>
      </div>
    </main>
  );
}
