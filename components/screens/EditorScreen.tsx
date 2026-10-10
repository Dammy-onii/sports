"use client";

import { useState } from "react";
import { squadOf } from "@/game/career";
import { overall } from "@/game/ratings";
import type { Club, ClubColors, CrestDesign, Player } from "@/game/types";
import { updateSave, useCareer } from "@/lib/store/save-store";
import { CrestBuilder } from "../CrestBuilder";
import { Button, Card, CardHeader, Crest, PosBadge } from "../ui";

const POS_ORDER = ["GK", "RB", "CB", "LB", "DM", "CM", "RM", "LM", "AM", "RW", "LW", "ST"];

export function EditorScreen() {
  const save = useCareer();
  const [clubId, setClubId] = useState(save.userClubId);
  const club = save.clubs[clubId];
  const clubs = Object.values(save.clubs).sort((a, b) => (a.isUser ? -1 : b.isUser ? 1 : a.name.localeCompare(b.name)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none">Editor</h1>
          <p className="text-sm text-muted">Rename clubs and players, change kits and design crests. Edits apply to this career only.</p>
        </div>
        <select
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          className="h-10 rounded-md border border-line bg-bg px-3 text-sm"
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.isUser ? "★ " : ""}
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ClubEditor key={club.id} club={club} />
        <PlayersEditor key={`p-${club.id}`} players={squadOf(save, club.id)} />
      </div>
    </div>
  );
}

function ClubEditor({ club }: { club: Club }) {
  const [name, setName] = useState(club.name);
  const [short, setShort] = useState(club.shortName);
  const [colors, setColors] = useState<ClubColors>(club.colors);
  const [design, setDesign] = useState<CrestDesign>(club.crest ?? { shape: "shield", pattern: "plain" });
  const [saved, setSaved] = useState(false);

  function save() {
    updateSave((d) => {
      const c = d.clubs[club.id];
      c.name = name.trim() || c.name;
      c.shortName = (short.trim() || c.shortName).toUpperCase().slice(0, 3);
      c.colors = colors;
      c.crest = design;
    });
    setSaved(true);
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <Crest colors={colors} label={short} design={design} size={72} />
        <div className="grid flex-1 grid-cols-[1fr_80px] gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Club name</span>
            <input
              value={name}
              maxLength={28}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              className="h-10 rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Short</span>
            <input
              value={short}
              maxLength={3}
              onChange={(e) => {
                setShort(e.target.value.toUpperCase());
                setSaved(false);
              }}
              className="h-10 rounded-md border border-line bg-bg px-3 text-sm uppercase outline-none focus:border-accent"
            />
          </label>
        </div>
      </div>
      <div className="mt-4">
        <CrestBuilder
          colors={colors}
          design={design}
          label={short}
          onColors={(c) => {
            setColors(c);
            setSaved(false);
          }}
          onDesign={(d) => {
            setDesign(d);
            setSaved(false);
          }}
        />
      </div>
      <Button variant="primary" className="mt-4 w-full" onClick={save} disabled={saved}>
        {saved ? "Saved" : "Save club"}
      </Button>
    </Card>
  );
}

function PlayersEditor({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => POS_ORDER.indexOf(a.positions[0]) - POS_ORDER.indexOf(b.positions[0]) || overall(b) - overall(a));
  return (
    <Card>
      <CardHeader title="Players" subtitle="Edit names and shirt numbers. Changes save as you leave each field." />
      <ul className="pb-2">
        {sorted.map((p) => (
          <PlayerRow key={p.id} p={p} />
        ))}
      </ul>
    </Card>
  );
}

function PlayerRow({ p }: { p: Player }) {
  const [first, setFirst] = useState(p.firstName);
  const [last, setLast] = useState(p.lastName);
  const [shirt, setShirt] = useState(String(p.shirt));

  function commit() {
    const n = Math.max(1, Math.min(99, Number(shirt) || p.shirt));
    if (first === p.firstName && last === p.lastName && n === p.shirt) return;
    updateSave((d) => {
      const x = d.players[p.id];
      x.firstName = first.trim() || x.firstName;
      x.lastName = last.trim() || x.lastName;
      x.shirt = n;
    });
  }

  const input = "h-8 min-w-0 rounded-md border border-line bg-bg px-2 text-sm outline-none focus:border-accent";
  return (
    <li className="grid grid-cols-[36px_44px_1fr_1fr] items-center gap-2 border-t border-line/60 px-4 py-1.5">
      <PosBadge pos={p.positions[0]} />
      <input value={shirt} onChange={(e) => setShirt(e.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={commit} className={`${input} text-center tabular`} aria-label="Shirt number" />
      <input value={first} onChange={(e) => setFirst(e.target.value)} onBlur={commit} className={input} aria-label="First name" />
      <input value={last} onChange={(e) => setLast(e.target.value)} onBlur={commit} className={input} aria-label="Last name" />
    </li>
  );
}
