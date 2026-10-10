"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { newCareer } from "@/game/career";
import { FORMATION_IDS } from "@/game/constants";
import { generateClubName, shortNameFor } from "@/game/generate";
import { Rng } from "@/game/rng";
import type { CrestDesign, FormationId } from "@/game/types";
import { CrestBuilder, SWATCHES } from "../CrestBuilder";
import { MAX_SLOTS, setSave, useSlots } from "@/lib/store/save-store";
import { Button, Card, Crest, cn } from "../ui";

export function NewCareerScreen() {
  const router = useRouter();
  const [manager, setManager] = useState("");
  const [name, setName] = useState("Ashford Rovers");
  const [short, setShort] = useState("ASH");
  const [primary, setPrimary] = useState("#0a0a0a");
  const [secondary, setSecondary] = useState("#f5f5f5");
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [design, setDesign] = useState<CrestDesign>({ shape: "shield", pattern: "plain" });
  const [startTier, setStartTier] = useState<1 | 2>(2);
  const slots = useSlots();
  const full = !!slots && slots.slots.length >= MAX_SLOTS;
  const [busy, setBusy] = useState(false);

  function randomise() {
    const rng = new Rng(Date.now() >>> 0);
    const n = generateClubName(rng, new Set());
    setName(n);
    setShort(shortNameFor(n));
    const p = rng.pick(SWATCHES);
    let s = rng.pick(SWATCHES);
    while (s === p) s = rng.pick(SWATCHES);
    setPrimary(p);
    setSecondary(s);
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const save = newCareer({
      managerName: manager.trim() || "The Gaffer",
      clubName: name.trim(),
      shortName: (short.trim() || shortNameFor(name)).toUpperCase().slice(0, 3),
      colors: { primary, secondary },
      crest: design,
      formation,
      startTier,
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
    });
    setSave(save);
    router.push("/club");
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
      <h1 className="font-display text-5xl leading-none">New career</h1>
      <p className="mt-1 text-sm text-muted">Create your club. You&apos;ll inherit a generated squad and 11 league rivals.</p>

      <form onSubmit={create} className="mt-6 flex flex-col gap-4">
        <Card className="flex items-center gap-4 p-4">
          <Crest colors={{ primary, secondary }} design={design} label={short || "???"} size={64} />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{name || "Your club"}</div>
            <div className="text-xs text-muted">Manager: {manager || "The Gaffer"}</div>
          </div>
          <Button type="button" variant="ghost" className="ml-auto" onClick={randomise}>
            🎲 Random
          </Button>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Manager name</span>
            <input
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              placeholder="The Gaffer"
              maxLength={24}
              className="h-11 rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
            />
          </label>
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Club name</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setShort(shortNameFor(e.target.value));
                }}
                maxLength={28}
                required
                className="h-11 rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Short</span>
              <input
                value={short}
                onChange={(e) => setShort(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                className="h-11 rounded-md border border-line bg-bg px-3 text-sm uppercase outline-none focus:border-accent"
              />
            </label>
          </div>
          <CrestBuilder
            colors={{ primary, secondary }}
            design={design}
            label={short || "???"}
            onColors={(c) => {
              setPrimary(c.primary);
              setSecondary(c.secondary);
            }}
            onDesign={setDesign}
          />
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-xs text-muted">Preferred formation</div>
          <div className="flex flex-wrap gap-2">
            {FORMATION_IDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormation(f)}
                className={cn(
                  "h-10 rounded-md border px-4 text-sm font-semibold tabular",
                  formation === f ? "border-accent bg-highlight text-accent" : "border-line text-muted",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-xs text-muted">Starting division</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { tier: 2 as const, title: "First Division", body: "The classic climb. Win promotion to reach the top flight." },
              { tier: 1 as const, title: "Premier Division", body: "Straight into the top tier, where survival comes first." },
            ].map((o) => (
              <button
                key={o.tier}
                type="button"
                onClick={() => setStartTier(o.tier)}
                className={cn(
                  "rounded-md border p-3 text-left",
                  startTier === o.tier ? "border-accent bg-highlight" : "border-line hover:border-muted/50",
                )}
              >
                <div className="text-sm font-semibold">{o.title}</div>
                <div className="mt-1 text-xs text-muted">{o.body}</div>
              </button>
            ))}
          </div>
        </Card>

        {full && <p className="text-sm text-muted">All {MAX_SLOTS} career slots are in use. Delete one from the home screen first.</p>}
        <Button type="submit" variant="primary" disabled={busy || full} className="h-12 text-base">
          {busy ? "Building your world…" : "Create club"}
        </Button>
      </form>
    </main>
  );
}
