"use client";

import { useState, type DragEvent } from "react";
import { squadOf } from "@/game/career";
import { FORMATIONS, FORMATION_IDS, INSTRUCTION_LABELS } from "@/game/constants";
import { familiarity, overall } from "@/game/ratings";
import { ROLES, rolesFor, validRole } from "@/game/roles";
import { autoPickLineup, autoRoles, autoSetPieces, isAvailable, remapLineup, repairLineup } from "@/game/tactics";
import type { CornerRoutine, FormationId, Player, PlayerInstructions, RoleId, Tactics, TeamInstructions } from "@/game/types";
import { clubFamiliarity, familiarityLabel, formationFamiliarity, instructionFamiliarity, roleFamiliarity } from "@/game/familiarity";
import { updateSave, useCareer, useOnboarding } from "@/lib/store/save-store";
import { FamiliarityCard, PlayerInstructionsEditor, piSummary } from "../TacticalParts";
import { toast } from "../overlay";
import { PlayerLink } from "../PlayerParts";
import { Button, Card, CardHeader, Field, Ovr, PageHeader, Panel, PosBadge, Segmented, Tabs, cn } from "../ui";

type Sel = { kind: "slot"; index: number } | { kind: "player"; id: string } | null;
type Side = "familiarity" | "instructions" | "setpieces" | "presets";

/** What each instruction does at the low and high end (shown under the slider). */
const EXPLAIN: Record<keyof TeamInstructions, [low: string, mid: string, high: string]> = {
  mentality: ["Bodies behind the ball; few players join attacks.", "A balance of risk and security.", "Full-backs and midfielders flood forward. Exposed on the break."],
  pressing: ["Drop off and stay compact. Saves energy.", "Press when the ball is in reach.", "Hunt the ball everywhere. Wins it high, tires players and gives away fouls."],
  defensiveLine: ["Sit deep: little space behind, but the opponent has time on the ball.", "A conventional line.", "Squeeze the pitch and catch players offside. Vulnerable to pace in behind."],
  width: ["Play through the middle; crowds the opponent's centre.", "Use the whole pitch when it's on.", "Stretch play to the touchlines. More crosses, more gaps between your lines."],
  tempo: ["Keep the ball and wait for an opening.", "Move it on at a natural pace.", "Play quickly. Catches defences unset, but more passes go astray."],
  directness: ["Short passes to feet. Needs good passers.", "Mix short and long.", "Go long early to the forwards. Bypasses a press, gives the ball away more."],
};

const ROUTINES: { value: CornerRoutine; label: string; blurb: string }[] = [
  { value: "mixed", label: "Mixed", blurb: "The taker picks the best option each time." },
  { value: "near", label: "Near post", blurb: "Whipped to the near post for a flick-on. Favours quick, brave headers." },
  { value: "far", label: "Far post", blurb: "Floated to the far post for your tallest players." },
  { value: "short", label: "Short", blurb: "Played short to work a crossing angle or a shot from the edge." },
];

const MAX_PRESETS = 3;

export function TacticsScreen() {
  const save = useCareer();
  useOnboarding("tactics");
  const club = save.clubs[save.userClubId];
  const squad = squadOf(save, club.id);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const { formation, instructions, lineup, bench } = club.tactics;
  const slots = FORMATIONS[formation];
  const roles = slots.map((s, i) => validRole(club.tactics.roles?.[i], s.pos));
  const [sel, setSel] = useState<Sel>(null);
  const [side, setSide] = useState<Side>("instructions");
  const [drag, setDrag] = useState<string | null>(null);

  const inXI = new Set(lineup);
  const benchSet = new Set(bench);
  const reserves = squad.filter((p) => !inXI.has(p.id) && !benchSet.has(p.id)).sort((a, b) => overall(b) - overall(a));
  const xi = lineup.map((id) => byId.get(id)).filter(Boolean) as Player[];
  const fam = clubFamiliarity(club, save.players);
  const strength = Math.round(slots.reduce((a, s, i) => a + (byId.get(lineup[i]) ? overall(byId.get(lineup[i])!, s.pos) : 0), 0) / slots.length);

  function setTactics(fn: (t: Tactics) => void) {
    updateSave((d) => fn(d.clubs[d.userClubId].tactics));
  }

  function changeFormation(f: FormationId) {
    setTactics((t) => {
      t.formation = f;
      t.lineup = remapLineup(xi, f);
      t.roles = autoRoles(byId, f, t.lineup);
      // instructions belong to positions in the old shape
      t.playerInstructions = undefined;
    });
    setSel(null);
    const ff = formationFamiliarity(club.familiarity, f);
    if (ff < 0.6) toast(`The squad barely knows the ${f} (${Math.round(ff * 100)}%). Expect a looser shape until they learn it.`, "bad");
  }

  function autoPick() {
    setTactics((t) => {
      Object.assign(t, autoPickLineup(squad, t.formation));
      t.roles = autoRoles(byId, t.formation, t.lineup);
    });
    setSel(null);
  }

  /** Move player `id` (anywhere) into XI slot `index`; whoever was there takes their old place. */
  function intoSlot(index: number, id: string) {
    setTactics((t) => {
      const out = t.lineup[index];
      if (out === id) return;
      const from = t.lineup.indexOf(id);
      if (from >= 0) {
        [t.lineup[from], t.lineup[index]] = [t.lineup[index], t.lineup[from]];
        return;
      }
      t.lineup[index] = id;
      const bi = t.bench.indexOf(id);
      if (bi >= 0) t.bench[bi] = out;
    });
  }

  /** Move player `id` onto the bench (in place of `target` if given). */
  function toBench(id: string, target?: string) {
    setTactics((t) => {
      const li = t.lineup.indexOf(id);
      const bi = t.bench.indexOf(id);
      if (target) {
        const ti = t.bench.indexOf(target);
        if (ti < 0) return;
        if (li >= 0) [t.lineup[li], t.bench[ti]] = [target, id];
        else if (bi >= 0) [t.bench[bi], t.bench[ti]] = [target, id];
        else t.bench[ti] = id;
        return;
      }
      if (li >= 0 || bi >= 0) return;
      if (t.bench.length < 7) t.bench.push(id);
    });
  }

  function clickSlot(index: number) {
    if (sel?.kind === "slot") {
      if (sel.index !== index && lineup[sel.index]) intoSlot(index, lineup[sel.index]);
      setSel(null);
    } else if (sel?.kind === "player") {
      intoSlot(index, sel.id);
      setSel(null);
    } else setSel({ kind: "slot", index });
  }

  function clickPlayer(id: string) {
    if (sel?.kind === "slot") {
      intoSlot(sel.index, id);
      setSel(null);
      return;
    }
    if (sel?.kind === "player" && sel.id !== id) {
      const a = sel.id;
      if (benchSet.has(id)) toBench(a, id);
      else if (benchSet.has(a)) toBench(id, a);
      setSel(null);
      return;
    }
    setSel(sel?.kind === "player" && sel.id === id ? null : { kind: "player", id });
  }

  // ── drag and drop (desktop); tapping still works everywhere ──
  const dragProps = (id: string | undefined) =>
    id
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
            setDrag(id);
          },
          onDragEnd: () => setDrag(null),
        }
      : {};
  const dropProps = (onDrop: (id: string) => void) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) onDrop(id);
      setDrag(null);
      setSel(null);
    },
  });

  const selectedSlot = sel?.kind === "slot" ? sel.index : null;
  const hint = drag
    ? "Drop on a position, or on a bench player to swap."
    : sel?.kind === "slot"
      ? "Tap another position to swap, or a bench or reserve player to bring him in."
      : sel?.kind === "player"
        ? "Tap a position to bring him in, or a bench player to swap."
        : "Drag players around, or tap one and then tap where he should go.";

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Tactics"
        subtitle={`Starting XI strength ${strength} · ${bench.length}/7 on the bench · familiarity ${familiarityLabel(fam.overall).toLowerCase()} (${Math.round(fam.overall * 100)}%)`}
        actions={
          <>
            <Button size="sm" onClick={autoPick}>
              Auto-pick best XI
            </Button>
          </>
        }
      />

      <Segmented
        value={formation}
        onChange={changeFormation}
        options={FORMATION_IDS.map((f) => {
          const ff = Math.round(formationFamiliarity(club.familiarity, f) * 100);
          return {
            value: f,
            label: (
              <span title={`Familiarity ${ff}%`}>
                {f} <span className={cn("ml-0.5 text-[10px] tabular", ff < 60 ? "text-loss-ink" : "text-muted")}>{ff}%</span>
              </span>
            ),
          };
        })}
        className="mb-4"
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)_320px]">
        {/* Pitch */}
        <div>
          <div className="relative mx-auto aspect-[68/105] w-full max-w-[400px] overflow-hidden rounded-lg border border-line" style={{ background: "repeating-linear-gradient(0deg, var(--pitch-a) 0 9.5%, var(--pitch-b) 9.5% 19%)" }}>
            <PitchLines />
            {slots.map((s, i) => {
              const p = byId.get(lineup[i]);
              const fam = p ? familiarity(p, s.pos) : 0;
              const selected = selectedSlot === i;
              return (
                <button
                  key={i}
                  onClick={() => clickSlot(i)}
                  {...dragProps(p?.id)}
                  {...dropProps((id) => intoSlot(i, id))}
                  aria-label={`${s.pos}: ${p ? `${p.firstName} ${p.lastName}, ${ROLES[roles[i]].label}` : "empty"}`}
                  className="absolute flex w-[22%] -translate-x-1/2 translate-y-1/2 cursor-grab flex-col items-center gap-0.5 active:cursor-grabbing"
                  style={{ left: `${8 + s.y * 84}%`, bottom: `${6 + (s.x / 0.68) * 80}%` }}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold shadow-md transition",
                      selected ? "scale-110 ring-2 ring-text ring-offset-1" : "",
                      fam >= 0.95 ? "border-text" : fam >= 0.8 ? "border-draw" : "border-loss",
                      drag === p?.id && "opacity-40",
                    )}
                    style={{ background: club.colors.primary, color: club.colors.secondary }}
                  >
                    {p ? overall(p, s.pos) : "?"}
                  </span>
                  <span className="max-w-full truncate rounded bg-accent px-1.5 text-[10px] font-medium leading-4 text-accent-ink">{p ? p.lastName : "Empty"}</span>
                  <span className="max-w-full truncate rounded bg-surface/85 px-1 text-[9px] font-medium leading-3.5 text-text" title={piSummary(club.tactics.playerInstructions?.[i]) || undefined}>
                    {ROLES[roles[i]].label}
                    {club.tactics.playerInstructions?.[i] && " •"}
                  </span>
                  {p && !isAvailable(p) && <span className="rounded bg-loss px-1 text-[9px] font-bold text-white">{p.suspension > 0 ? "BANNED" : "INJURED"}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted">{hint}</p>
          <p className="mt-1 text-center text-[11px] text-muted">
            Ring: <span className="font-semibold text-text">natural</span> · <span className="font-semibold text-draw-ink">accomplished</span> · <span className="font-semibold text-loss-ink">out of position</span>
          </p>
        </div>

        {/* Middle column: selected slot + instructions / set pieces / presets */}
        <div className="flex min-w-0 flex-col gap-4 md:row-span-2 2xl:row-span-1">
          {selectedSlot !== null && (
            <SlotPanel
              key={selectedSlot}
              index={selectedSlot}
              player={byId.get(lineup[selectedSlot])}
              pos={slots[selectedSlot].pos}
              role={roles[selectedSlot]}
              pi={club.tactics.playerInstructions?.[selectedSlot]}
              onPi={(pi) =>
                setTactics((t) => {
                  const arr = slots.map((_, i) => t.playerInstructions?.[i]);
                  arr[selectedSlot] = pi;
                  t.playerInstructions = arr;
                })
              }
              onRole={(r) =>
                setTactics((t) => {
                  t.roles = slots.map((s, i) => validRole(t.roles?.[i], s.pos));
                  t.roles[selectedSlot] = r;
                })
              }
              onClose={() => setSel(null)}
            />
          )}
          <Tabs
            value={side}
            onChange={setSide}
            options={[
              { value: "familiarity", label: "Familiarity" },
              { value: "instructions", label: "Team instructions" },
              { value: "setpieces", label: "Set pieces" },
              { value: "presets", label: "Saved tactics" },
            ]}
          />
          {side === "instructions" && (
            <Card>
              <div className="flex flex-col gap-5 p-4">
                {(Object.keys(INSTRUCTION_LABELS) as (keyof TeamInstructions)[]).map((k) => {
                  const v = instructions[k];
                  const insFam = Math.round((instructionFamiliarity(club.familiarity, instructions)[k] ?? 0) * 100);
                  return (
                    <label key={k} className="block">
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium">{INSTRUCTION_LABELS[k].label}</span>
                        <span className="text-xs text-muted">
                          {v <= 2 ? INSTRUCTION_LABELS[k].low : v >= 4 ? INSTRUCTION_LABELS[k].high : "Balanced"}
                          <span className={cn("ml-2 tabular", insFam < 60 && "text-loss-ink")} title="How well the squad knows this setting">
                            {insFam}% known
                          </span>
                        </span>
                      </div>
                      <input type="range" min={1} max={5} step={1} value={v} onChange={(e) => setTactics((t) => void (t.instructions[k] = Number(e.target.value)))} className="slider w-full" />
                      <p className="mt-1 text-xs text-muted">{EXPLAIN[k][v <= 2 ? 0 : v >= 4 ? 2 : 1]}</p>
                    </label>
                  );
                })}
              </div>
            </Card>
          )}
          {side === "familiarity" && (
            <Card className="p-4">
              <FamiliarityCard fam={fam} formation={formation} />
            </Card>
          )}
          {side === "setpieces" && <SetPiecesCard xi={xi} tactics={club.tactics} onChange={(fn) => setTactics(fn)} />}
          {side === "presets" && <Presets />}
        </div>

        {/* Bench and reserves (under the pitch until the screen is wide) */}
        <div className="flex min-w-0 flex-col gap-4 md:col-start-1 2xl:col-start-3 2xl:row-start-1">
          <Card {...dropProps((id) => toBench(id))}>
            <CardHeader title={`Bench (${bench.length}/7)`} subtitle="Drop players here" />
            <PlayerList players={bench.map((id) => byId.get(id)).filter(Boolean) as Player[]} sel={sel} onClick={clickPlayer} dragProps={dragProps} dropOn={(target, id) => toBench(id, target)} dropProps={dropProps} />
          </Card>
          <Card>
            <CardHeader title={`Reserves (${reserves.length})`} />
            <PlayerList players={reserves} sel={sel} onClick={clickPlayer} dragProps={dragProps} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function SlotPanel({
  player,
  pos,
  role,
  pi,
  onRole,
  onPi,
  onClose,
}: {
  index: number;
  player?: Player;
  pos: Player["positions"][number];
  role: RoleId;
  pi?: PlayerInstructions;
  onRole: (r: RoleId) => void;
  onPi: (pi: PlayerInstructions | undefined) => void;
  onClose: () => void;
}) {
  const options = rolesFor(pos);
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <PosBadge pos={pos} />
          {player ? <PlayerLink p={player} /> : "Empty slot"}
          {player && <Ovr value={overall(player, pos)} />}
        </span>
      }
      subtitle={player && familiarity(player, pos) < 0.95 ? `Not a natural ${pos}: plays at ${Math.round(familiarity(player, pos) * 100)}% effectiveness.` : "Choose how this position plays."}
      action={
        <button className="text-xs text-muted hover:text-text" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
        {options.map((r) => (
          <button key={r} onClick={() => onRole(r)} aria-pressed={r === role} className={cn("rounded-md border px-3 py-2 text-left", r === role ? "border-text bg-highlight" : "border-line hover:border-text")}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{ROLES[r].label}</span>
              {player && (
                <span className={cn("text-[11px] tabular", roleFamiliarity(player, r) < 0.5 ? "text-loss-ink" : "text-muted")} title="His experience in this role">
                  {Math.round(roleFamiliarity(player, r) * 100)}%
                </span>
              )}
            </span>
            <span className="block text-xs text-muted">{ROLES[r].blurb}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 text-xs font-semibold">Player instructions</div>
        <PlayerInstructionsEditor pos={pos} value={pi} onChange={onPi} />
      </div>
    </Panel>
  );
}

function SetPiecesCard({ xi, tactics, onChange }: { xi: Player[]; tactics: Tactics; onChange: (fn: (t: Tactics) => void) => void }) {
  const auto = autoSetPieces(xi, tactics.setPieces?.cornerRoutine);
  const sp = tactics.setPieces ?? auto;
  const outfield = xi.filter((p) => p.positions[0] !== "GK");
  const takers: { key: "penalty" | "freeKick" | "corner"; label: string; stat: (p: Player) => string }[] = [
    { key: "penalty", label: "Penalties", stat: (p) => `Penalties ${Math.round(p.attributes.penalties)} · Composure ${Math.round(p.attributes.composure)}` },
    { key: "freeKick", label: "Free kicks", stat: (p) => `Free kicks ${Math.round(p.attributes.freeKicks)} · Technique ${Math.round(p.attributes.technique)}` },
    { key: "corner", label: "Corners", stat: (p) => `Crossing ${Math.round(p.attributes.crossing)} · Technique ${Math.round(p.attributes.technique)}` },
  ];
  const set = (fn: (s: NonNullable<Tactics["setPieces"]>) => void) =>
    onChange((t) => {
      t.setPieces ??= { ...auto };
      fn(t.setPieces);
    });
  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        {takers.map(({ key, label, stat }) => {
          const current = outfield.find((p) => p.id === sp[key]) ?? outfield.find((p) => p.id === auto[key]);
          return (
            <Field key={key} label={label} hint={current ? stat(current) : "If the taker isn't on the pitch, the best available steps up."}>
              <select className="input" value={current?.id ?? ""} onChange={(e) => set((s) => void (s[key] = e.target.value || undefined))}>
                {outfield.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName[0]}. {p.lastName} ({p.positions[0]}) {p.id === auto[key] ? "★ best" : ""}
                  </option>
                ))}
              </select>
            </Field>
          );
        })}
        <div>
          <div className="mb-1.5 text-sm font-medium">Corner routine</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROUTINES.map((r) => (
              <button key={r.value} onClick={() => set((s) => void (s.cornerRoutine = r.value))} aria-pressed={sp.cornerRoutine === r.value} className={cn("rounded-md border px-3 py-2 text-left", sp.cornerRoutine === r.value ? "border-text bg-highlight" : "border-line hover:border-text")}>
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block text-xs text-muted">{r.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => onChange((t) => void (t.setPieces = { ...auto }))}>
          Reset to best takers
        </Button>
      </div>
    </Card>
  );
}

function Presets() {
  const save = useCareer();
  const [name, setName] = useState("");
  const club = save.clubs[save.userClubId];
  const squad = squadOf(save, club.id);
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">Save up to {MAX_PRESETS} set-ups (formation, roles, instructions, set pieces and the XI) and switch between them before a match.</p>
        {save.presets.length === 0 && <p className="text-sm text-muted">No saved tactics yet.</p>}
        <ul className="flex flex-col gap-2">
          {save.presets.map((pr, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{pr.name}</div>
                <div className="text-xs text-muted">
                  {pr.tactics.formation} · {INSTRUCTION_LABELS.mentality.label} {pr.tactics.instructions.mentality}/5
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  updateSave((d) => {
                    const t = d.clubs[d.userClubId].tactics;
                    const p = structuredClone(d.presets[i].tactics);
                    Object.assign(t, p, repairLineup(squad, p.formation, p.lineup, p.bench));
                  });
                  toast(`Loaded “${pr.name}”.`);
                }}
              >
                Load
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateSave((d) => void d.presets.splice(i, 1))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim() || `Tactic ${save.presets.length + 1}`;
            updateSave((d) => {
              const snap = structuredClone(d.clubs[d.userClubId].tactics);
              const existing = d.presets.findIndex((p) => p.name === n);
              if (existing >= 0) d.presets[existing].tactics = snap;
              else if (d.presets.length < MAX_PRESETS) d.presets.push({ name: n, tactics: snap });
            });
            setName("");
            toast(`Saved “${n}”.`, "good");
          }}
        >
          <input className="input flex-1" placeholder="Name, e.g. Home attacking" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" type="submit" disabled={save.presets.length >= MAX_PRESETS && !save.presets.some((p) => p.name === name.trim())}>
            Save current
          </Button>
        </form>
      </div>
    </Card>
  );
}

function PlayerList({
  players,
  sel,
  onClick,
  dragProps,
  dropOn,
  dropProps,
}: {
  players: Player[];
  sel: Sel;
  onClick: (id: string) => void;
  dragProps: (id: string | undefined) => object;
  dropOn?: (targetId: string, droppedId: string) => void;
  dropProps?: (onDrop: (id: string) => void) => object;
}) {
  if (!players.length) return <div className="px-4 pb-4 text-sm text-muted">None</div>;
  return (
    <ul className="pb-2">
      {players.map((p) => (
        <li key={p.id} {...(dropOn && dropProps ? dropProps((id) => dropOn(p.id, id)) : {})}>
          <button
            onClick={() => onClick(p.id)}
            {...(isAvailable(p) ? dragProps(p.id) : {})}
            disabled={!isAvailable(p)}
            className={cn("flex w-full cursor-grab items-center gap-2 border-t border-line/60 px-4 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40", sel?.kind === "player" && sel.id === p.id && "bg-highlight")}
          >
            <PosBadge pos={p.positions[0]} />
            <span className="flex-1 truncate">
              {p.firstName[0]}. {p.lastName}
              {p.injuryWeeks > 0 && <span className="ml-1 text-[10px] text-loss-ink">INJ {p.injuryWeeks}w</span>}
              {p.suspension > 0 && <span className="ml-1 text-[10px] text-draw-ink">BAN</span>}
            </span>
            <span className={cn("text-xs tabular", p.fitness < 75 ? "text-loss-ink" : "text-muted")} title="Fitness">
              {Math.round(p.fitness)}%
            </span>
            <Ovr value={overall(p)} className="w-7 text-right" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PitchLines() {
  return (
    <svg viewBox="0 0 68 105" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <g fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.45">
        <rect x="1" y="1" width="66" height="103" />
        <line x1="1" y1="52.5" x2="67" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <rect x="13.84" y="1" width="40.32" height="16.5" />
        <rect x="24.84" y="1" width="18.32" height="5.5" />
        <rect x="13.84" y="87.5" width="40.32" height="16.5" />
        <rect x="24.84" y="98.5" width="18.32" height="5.5" />
      </g>
    </svg>
  );
}
