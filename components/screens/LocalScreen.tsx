"use client";

import Link from "next/link";
import { useState } from "react";
import { FORMATIONS, FORMATION_IDS, INSTRUCTION_LABELS } from "@/game/constants";
import type { MatchSetup, MatchState } from "@/game/engine/types";
import { generateWorld } from "@/game/generate";
import { familiarity, overall } from "@/game/ratings";
import { matchSetupFor } from "@/game/setup";
import { autoPickLineup, isAvailable, remapLineup, repairLineup } from "@/game/tactics";
import type { Club, Player, Tactics, TeamInstructions } from "@/game/types";
import { useSave } from "@/lib/store/save-store";
import { Slider } from "../Slider";
import { MatchViewer } from "../match/MatchViewer";
import { Button, Card, CardHeader, Crest, PosBadge, cn } from "../ui";

type World = { clubs: Record<string, Club>; players: Record<string, Player> };
type Manager = { name: string; clubId: string; tactics: Tactics };
type Step = "setup" | "pass-a" | "prep-a" | "pass-b" | "prep-b" | "match" | "result";

function demoWorld(): World {
  const w = generateWorld(77001, { name: "Touchline XI", shortName: "TXI", colors: { primary: "#f4f3ef", secondary: "#141414" }, formation: "4-3-3" }, { divisions: 2 });
  return { clubs: w.clubs, players: w.players };
}

const squadOf = (world: World, clubId: string) => Object.values(world.players).filter((p) => p.clubId === clubId);

export function LocalScreen() {
  const save = useSave();
  if (save === undefined) return <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>;
  return <Local world={save ? { clubs: save.clubs, players: save.players } : null} />;
}

function Local({ world: careerWorld }: { world: World | null }) {
  const [world] = useState<World>(() => careerWorld ?? demoWorld());
  const clubs = Object.values(world.clubs).sort((a, b) => b.reputation - a.reputation);
  const fresh = (clubId: string): Manager["tactics"] => {
    const c = world.clubs[clubId];
    return { ...c.tactics, instructions: { ...c.tactics.instructions }, ...autoPickLineup(squadOf(world, clubId), c.tactics.formation) };
  };
  const [a, setA] = useState<Manager>(() => ({ name: "Player 1", clubId: clubs[0].id, tactics: fresh(clubs[0].id) }));
  const [b, setB] = useState<Manager>(() => ({ name: "Player 2", clubId: clubs[1].id, tactics: fresh(clubs[1].id) }));
  const [step, setStep] = useState<Step>("setup");
  const [game, setGame] = useState<{ setup: MatchSetup; seed: number; key: number } | null>(null);
  const [result, setResult] = useState<MatchState | null>(null);

  function kickOff() {
    const withTactics = (m: Manager): Club => ({ ...world.clubs[m.clubId], tactics: m.tactics });
    setGame({
      setup: matchSetupFor(withTactics(a), withTactics(b), world.players, { homeAI: false, awayAI: false }),
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
      key: Date.now(),
    });
    setStep("match");
  }

  if (step === "match" && game) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-3 md:px-6 md:py-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow">
            {a.name} vs {b.name} · both managers can change tactics and make subs
          </span>
        </div>
        <MatchViewer
          key={game.key}
          setup={game.setup}
          seed={game.seed}
          humanSides={[0, 1]}
          finishLabel="See result"
          onFinish={(s) => {
            setResult(s);
            setStep("result");
          }}
        />
      </main>
    );
  }

  if (step === "result" && result) {
    const [hg, ag] = result.score;
    const winner = hg === ag ? null : hg > ag ? a : b;
    return (
      <Centered>
        <div className="eyebrow">Full-time</div>
        <h1 className="mt-3 font-display text-6xl leading-none">
          {winner ? (
            <>
              <span className="marker italic">{winner.name}</span> wins.
            </>
          ) : (
            "Honours even."
          )}
        </h1>
        <p className="mt-4 text-lg">
          {world.clubs[a.clubId].name} {hg}–{ag} {world.clubs[b.clubId].name}
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              // rematch with home and away swapped
              setA(b);
              setB(a);
              setStep("pass-a");
            }}
          >
            Rematch (swap ends)
          </Button>
          <Button onClick={() => setStep("setup")}>Change teams</Button>
          <Link href="/" className="inline-flex h-11 items-center px-3 text-sm text-muted underline-offset-4 hover:underline">
            Home
          </Link>
        </div>
      </Centered>
    );
  }

  if (step === "pass-a" || step === "pass-b") {
    const m = step === "pass-a" ? a : b;
    return (
      <Centered>
        <div className="eyebrow">Pass the device</div>
        <h1 className="mt-3 font-display text-6xl leading-none">
          Over to <span className="marker italic">{m.name}</span>.
        </h1>
        <p className="mt-4 text-muted">Pick your XI and tactics in private. No peeking.</p>
        <Button variant="primary" className="mt-8" onClick={() => setStep(step === "pass-a" ? "prep-a" : "prep-b")}>
          I&apos;m {m.name}, show my team
        </Button>
      </Centered>
    );
  }

  if (step === "prep-a" || step === "prep-b") {
    const isA = step === "prep-a";
    const m = isA ? a : b;
    const set = isA ? setA : setB;
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8">
        <div className="eyebrow">{isA ? "Home" : "Away"} · {m.name}</div>
        <h1 className="mt-2 font-display text-5xl leading-none">{world.clubs[m.clubId].name}</h1>
        <TeamPrep world={world} manager={m} onChange={(t) => set({ ...m, tactics: t })} />
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={() => (isA ? setStep("pass-b") : kickOff())}>
            {isA ? `Lock in & pass to ${b.name}` : "Lock in & kick off"}
          </Button>
        </div>
      </main>
    );
  }

  // setup
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← Home
      </Link>
      <div className="eyebrow mt-6">Two managers · one device</div>
      <h1 className="mt-2 font-display text-6xl leading-none">
        Head-to-<span className="marker italic">head</span>.
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        {careerWorld ? "Pick any two clubs from your career world." : "No career yet, so here's a demo world."} Each manager sets up in private, then you
        both manage the same match.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {([
          [a, setA, "Home"],
          [b, setB, "Away"],
        ] as const).map(([m, set, label]) => (
          <Card key={label} className="p-4">
            <div className="eyebrow">{label}</div>
            <input
              value={m.name}
              maxLength={20}
              onChange={(e) => set({ ...m, name: e.target.value || label })}
              className="mt-2 h-10 w-full rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
              aria-label={`${label} manager name`}
            />
            <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
              {clubs.map((c) => {
                const other = (m === a ? b : a).clubId;
                return (
                  <li key={c.id}>
                    <button
                      disabled={c.id === other}
                      onClick={() => set({ ...m, clubId: c.id, tactics: fresh(c.id) })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-30",
                        m.clubId === c.id ? "bg-highlight" : "hover:bg-surface-2",
                      )}
                    >
                      <Crest design={c.crest} colors={c.colors} label={c.shortName} size={22} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted tabular">
                        {Math.round(c.tactics.lineup.reduce((s, id) => s + overall(world.players[id]), 0) / 11)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={() => setStep("pass-a")}>
          Start: {a.name} sets up first
        </Button>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">{children}</main>
  );
}

/** Compact private team setup: formation, XI per slot, instructions. */
function TeamPrep({ world, manager, onChange }: { world: World; manager: Manager; onChange: (t: Tactics) => void }) {
  const squad = squadOf(world, manager.clubId).filter(isAvailable);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const t = manager.tactics;
  const slots = FORMATIONS[t.formation];

  function setSlot(i: number, id: string) {
    const lineup = [...t.lineup];
    const j = lineup.indexOf(id);
    if (j >= 0) lineup[j] = lineup[i]; // swap within the XI
    lineup[i] = id;
    onChange({ ...t, ...repairLineup(squad, t.formation, lineup, t.bench) });
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Starting XI"
          action={
            <Button className="h-8 px-3 text-xs" onClick={() => onChange({ ...t, ...autoPickLineup(squad, t.formation) })}>
              Auto-pick
            </Button>
          }
        />
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {FORMATION_IDS.map((f) => (
            <button
              key={f}
              onClick={() => {
                const xi = t.lineup.map((id) => byId.get(id)).filter(Boolean) as Player[];
                onChange({ ...t, formation: f, ...repairLineup(squad, f, remapLineup(xi, f), t.bench) });
              }}
              className={cn("h-8 rounded-md border px-3 text-xs tabular", t.formation === f ? "border-accent bg-accent text-accent-ink" : "border-line text-muted")}
            >
              {f}
            </button>
          ))}
        </div>
        <ul className="pb-2">
          {slots.map((s, i) => {
            const p = byId.get(t.lineup[i]);
            return (
              <li key={i} className="flex items-center gap-2 border-t border-line/60 px-4 py-1.5">
                <PosBadge pos={s.pos} />
                <select
                  value={t.lineup[i]}
                  onChange={(e) => setSlot(i, e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-sm"
                >
                  {[...squad]
                    .sort((x, y) => overall(y, s.pos) - overall(x, s.pos))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        #{x.shirt} {x.lastName} · {x.positions[0]} · {overall(x, s.pos)}
                      </option>
                    ))}
                </select>
                {p && familiarity(p, s.pos) < 0.9 && <span className="text-[10px] text-loss">out of position</span>}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Team instructions" />
        <div className="flex flex-col gap-4 px-4 pb-4">
          {(Object.keys(INSTRUCTION_LABELS) as (keyof TeamInstructions)[]).map((k) => (
            <Slider key={k} label={INSTRUCTION_LABELS[k].label} min={1} max={5} ticks value={t.instructions[k]}
              valueText={`${t.instructions[k]}/5 · ${t.instructions[k] <= 2 ? INSTRUCTION_LABELS[k].low : t.instructions[k] >= 4 ? INSTRUCTION_LABELS[k].high : "Balanced"}`}
              low={INSTRUCTION_LABELS[k].low} high={INSTRUCTION_LABELS[k].high}
              onChange={(value) => onChange({ ...t, instructions: { ...t.instructions, [k]: value } })} />
          ))}
        </div>
      </Card>
    </div>
  );
}
