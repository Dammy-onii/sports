"use client";

import { useMemo, useState } from "react";
import { assistantNotes, type AssistantNote, type NoteAction } from "@/game/analysis";
import { minuteOf, previewTeamTalk, playerRating } from "@/game/engine";
import type { MatchState, Side } from "@/game/engine/types";
import { reactionLabel, ROLES, rolesFor, SHOUTS, TALKS, type ShoutId, type TalkTone } from "@/game/roles";
import { Momentum } from "../charts";
import { cn } from "../ui";
import { PlayerInstructionsEditor, piSummary } from "../TacticalParts";
import type { OppInstruction, PlayerInstructions } from "@/game/types";

const TONES = Object.keys(TALKS) as TalkTone[];

/** Aggregate a set of morale reactions into a short summary. */
function summarise(reactions: number[]) {
  const good = reactions.filter((d) => d > 0).length;
  const bad = reactions.filter((d) => d < 0).length;
  return { good, bad, neutral: reactions.length - good - bad };
}

/**
 * Team talk picker for half-time or full-time. Before choosing, the assistant
 * gives a rough read of how the dressing room will take each tone (better
 * assistants read it more accurately); after choosing, each player's reaction
 * is shown.
 */
export function TeamTalk({
  match,
  side,
  given,
  onGive,
  assistantQuality = 10,
  title,
}: {
  match: MatchState;
  side: Side;
  given?: TalkTone;
  onGive: (tone: TalkTone) => void;
  assistantQuality?: number;
  title: string;
}) {
  const [hover, setHover] = useState<TalkTone | null>(null);
  const players = match.teams[side].playerIdx.map((i) => match.players[i]).filter((p) => p.used);
  const previews = useMemo(() => Object.fromEntries(TONES.map((t) => [t, previewTeamTalk(match, side, t)])) as Record<TalkTone, Record<string, number>>, [match, side]);

  const read = (tone: TalkTone) => {
    const s = summarise(players.map((p) => previews[tone][p.id] ?? 0));
    // a poor assistant only gets the broad mood right
    if (assistantQuality < 8) return s.good > s.bad ? "Should go down fine" : s.bad > s.good ? "Could backfire" : "Hard to say";
    if (s.bad === 0 && s.good > players.length / 2) return "The squad will respond well";
    if (s.bad > s.good) return `Risky: ${s.bad} may take it badly`;
    return `${s.good} lifted, ${s.bad} unconvinced`;
  };

  if (given) {
    const res = previews[given];
    return (
      <div className="text-left">
        <div className="eyebrow mb-1">{title}</div>
        <p className="mb-2 text-sm italic">&ldquo;{TALKS[given].line}&rdquo;</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          {players.map((p) => {
            const d = res[p.id] ?? 0;
            return (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate">{p.shortName}</span>
                <span className={cn(d > 0 ? "text-win-ink" : d < 0 ? "text-loss-ink" : "text-muted")}>{reactionLabel(d)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="text-left">
      <div className="eyebrow mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {TONES.map((t) => (
          <button
            key={t}
            onClick={() => onGive(t)}
            onMouseEnter={() => setHover(t)}
            onFocus={() => setHover(t)}
            onMouseLeave={() => setHover(null)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-left hover:border-text"
          >
            <span className="block text-sm font-semibold">{TALKS[t].label}</span>
            <span className="block text-[11px] text-muted">{read(t)}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-8 text-xs italic text-muted">{hover ? `“${TALKS[hover].line}”` : "Players react according to the score, how they're playing and their temperament."}</p>
    </div>
  );
}

/** Touchline shouts: one active at a time; tap again to stop. */
export function ShoutBar({ match, side, onShout, disabled }: { match: MatchState; side: Side; onShout: (s: ShoutId | null) => void; disabled?: boolean }) {
  const active = match.teams[side].shout;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Touchline shouts">
      <span className="mr-1 text-xs text-muted">Shout</span>
      {(Object.keys(SHOUTS) as ShoutId[]).map((s) => (
        <button
          key={s}
          disabled={disabled}
          title={SHOUTS[s].blurb}
          aria-pressed={active === s}
          onClick={() => onShout(active === s ? null : s)}
          className={cn("h-8 rounded-md border px-2.5 text-xs font-medium disabled:opacity-40", active === s ? "border-text bg-highlight" : "border-line bg-surface hover:border-text")}
        >
          {SHOUTS[s].label}
        </button>
      ))}
    </div>
  );
}

/**
 * The assistant's running commentary on the match: what matters right now,
 * with one-tap fixes, and what he said earlier.
 */
export function AssistantCard({ match, side, quality, onAction }: { match: MatchState; side: Side; quality: number; onAction?: (a: NoteAction) => void }) {
  const minute = minuteOf(match);
  // re-read the game every couple of minutes, and straight after goals, cards and changes
  const beat = match.events.filter((e) => e.type === "goal" || e.type === "red" || e.type === "yellow" || e.type === "sub" || e.type === "tactics" || e.type === "shout").length;
  const bucket = Math.floor(minute / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute on game-time beats, not every frame
  const notes = useMemo(() => assistantNotes(match, side, quality), [bucket, beat, match.phase, side, quality]);
  const [history, setHistory] = useState<{ minute: number; note: AssistantNote }[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const fresh = notes.filter((n) => !seen.includes(n.key));
  if (fresh.length) {
    // remember new remarks with the minute they were made (state update during render is the
    // React-sanctioned way to derive state from changing props)
    setSeen([...seen, ...fresh.map((n) => n.key)]);
    setHistory([...fresh.map((note) => ({ minute, note })), ...history].slice(0, 30));
  }
  const active = new Set(notes.map((n) => n.key));
  const earlier = history.filter((h) => !active.has(h.note.key)).slice(0, 6);

  if (minute < 8 && match.tick < 8 * 60) return <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">Your assistant is watching how the game settles…</div>;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5" aria-live="polite">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eyebrow">Assistant</span>
        <span className="text-[10px] text-muted">{minute}′</span>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted">Nothing worrying. Keep it going.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.key} className="text-sm">
              <span className={cn(n.kind === "praise" ? "text-win-ink" : n.priority >= 70 ? "font-medium" : "")}>{n.text}</span>
              {n.advice && <span className="block text-xs text-muted">→ {n.advice}</span>}
              {n.action && onAction && (
                <button type="button" onClick={() => onAction(n.action!)} className="mt-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-medium hover:border-text">
                  {n.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {earlier.length > 0 && (
        <details className="group mt-2 border-t border-line pt-1.5">
          <summary className="cursor-pointer list-none text-[11px] text-muted">
            <span className="mr-1 inline-block transition group-open:rotate-90">›</span>Earlier ({earlier.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {earlier.map((h) => (
              <li key={`${h.note.key}-${h.minute}`} className="text-xs text-muted">
                <span className="mr-1.5 tabular">{h.minute}′</span>
                {h.note.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const MARK: Record<string, string> = { goal: "⚽", red: "🟥", yellow: "🟨", sub: "⇄", injury: "✚" };

/** Momentum bars with a 0–90′ timeline of key events underneath. */
export function MatchTimeline({ match, homeColor, awayColor }: { match: MatchState; homeColor: string; awayColor: string }) {
  const minute = minuteOf(match);
  const len = Math.max(90, minute);
  const events = match.events.filter((e) => e.type in MARK);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="mb-1 flex justify-between text-[10px] text-muted">
        <span>Momentum</span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle ring-1 ring-line" style={{ background: homeColor }} />
          {match.teams[0].shortName}
          <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-sm align-middle ring-1 ring-line" style={{ background: awayColor }} />
          {match.teams[1].shortName}
        </span>
      </div>
      <Lane events={events.filter((e) => e.side === 0)} len={len} />
      <Momentum values={match.analytics.momentum} homeColor={homeColor} awayColor={awayColor} current={minute} height={36} />
      <Lane events={events.filter((e) => e.side === 1)} len={len} />
      <div className="relative h-3">
        {[0, 45, 90].map((m) => (
          <span key={m} className={cn("absolute top-0 text-[9px] text-muted", m === 0 ? "" : m === 90 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${(m / len) * 100}%` }}>
            {m}′
          </span>
        ))}
      </div>
    </div>
  );
}

function Lane({ events, len }: { events: MatchState["events"]; len: number }) {
  return (
    <div className="relative h-4" aria-hidden>
      {events.map((e, i) => (
        <span key={i} className="absolute top-0.5 -translate-x-1/2 text-[10px] leading-none" style={{ left: `${(e.minute / len) * 100}%` }} title={`${e.minute}′ ${e.type}`}>
          {MARK[e.type]}
        </span>
      ))}
    </div>
  );
}

/** Change player roles and individual instructions mid-match (applies from the next tick). */
export function RolePicker({
  match,
  side,
  onRole,
  onPi,
  disabled,
}: {
  match: MatchState;
  side: Side;
  onRole: (slot: number, role: string) => void;
  onPi?: (slot: number, pi: PlayerInstructions | undefined) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const onField = match.teams[side].playerIdx.map((i) => match.players[i]).filter((p) => p.onPitch && p.slot >= 0);
  return (
    <div className="flex flex-col gap-1">
      {onField
        .sort((a, b) => a.slot - b.slot)
        .map((p) => {
          const options = rolesFor(p.pos);
          return (
            <div key={p.id}>
              <div className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-2 text-xs">
                <span className="text-[10px] text-muted">{p.pos}</span>
                <span className="truncate">
                  {p.shortName} <span className="text-muted">{playerRating(match, p).toFixed(1)}</span>
                  <span className={cn("ml-1 text-[10px]", p.roleFam < 0.5 ? "text-loss-ink" : "text-muted")} title="Experience in this role">
                    {Math.round(p.roleFam * 100)}%
                  </span>
                </span>
                <select className="input h-7 w-32 py-0 text-xs" value={p.role} disabled={disabled || options.length < 2} onChange={(e) => onRole(p.slot, e.target.value)} title={ROLES[p.role]?.blurb} aria-label={`Role for ${p.shortName}`}>
                  {options.map((r) => (
                    <option key={r} value={r}>
                      {ROLES[r].label}
                    </option>
                  ))}
                </select>
                {onPi && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(open === p.slot ? null : p.slot)}
                    aria-expanded={open === p.slot}
                    className={cn("h-7 rounded-md border px-1.5 text-[10px]", p.pi ? "border-text bg-highlight" : "border-line text-muted")}
                    title={piSummary(p.pi) || "Player instructions"}
                  >
                    PI
                  </button>
                )}
              </div>
              {onPi && open === p.slot && (
                <div className="my-1.5 rounded-md bg-surface-2 p-2">
                  <PlayerInstructionsEditor pos={p.pos} value={p.pi} onChange={(pi) => onPi(p.slot, pi)} dense />
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

/** Instructions on individual opponents, mid-match. */
export function OppositionPicker({ match, side, onOi, disabled }: { match: MatchState; side: Side; onOi: (playerId: string, oi: OppInstruction | null) => void; disabled?: boolean }) {
  const opp = match.teams[side === 0 ? 1 : 0];
  const players = opp.playerIdx.map((i) => match.players[i]).filter((p) => p.onPitch);
  const mine = match.teams[side].opposition;
  return (
    <div className="flex flex-col gap-1">
      {players.map((p) => {
        const oi = mine[p.id] ?? {};
        const set = (patch: Partial<OppInstruction>) => {
          const next = { ...oi, ...patch };
          for (const k of Object.keys(next) as (keyof OppInstruction)[]) if (!next[k]) delete next[k];
          onOi(p.id, Object.keys(next).length ? next : null);
        };
        const btn = (on: boolean, label: string, fn: () => void) => (
          <button type="button" disabled={disabled} aria-pressed={on} onClick={fn} className={cn("rounded px-1.5 py-0.5 text-[10px]", on ? "bg-highlight font-medium" : "text-muted hover:text-text")}>
            {label}
          </button>
        );
        return (
          <div key={p.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 text-xs">
            <span className="text-[10px] text-muted">{p.pos}</span>
            <span className="truncate">{p.shortName}</span>
            <span className="inline-flex gap-0.5 rounded-md border border-line p-0.5">
              {btn(!!oi.markTight, "Tight", () => set({ markTight: !oi.markTight }))}
              {btn(oi.press === "more", "Press", () => set({ press: oi.press === "more" ? undefined : "more" }))}
              {btn(oi.tackle === "hard", "Hard", () => set({ tackle: oi.tackle === "hard" ? undefined : "hard" }))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function LiveAnnouncer({ match }: { match: MatchState }) {
  const last = [...match.events].reverse().find((e) => e.type === "goal" || e.type === "red" || e.type === "halftime" || e.type === "fulltime");
  let text = "";
  if (last) {
    const who = match.players.find((p) => p.id === last.player)?.shortName ?? "";
    const team = match.teams[last.side].name;
    text =
      last.type === "goal"
        ? `Goal for ${team}, ${who}, ${last.minute} minutes. ${match.teams[0].shortName} ${match.score[0]}, ${match.teams[1].shortName} ${match.score[1]}.`
        : last.type === "red"
          ? `Red card, ${who} of ${team}.`
          : last.type === "halftime"
            ? `Half-time. ${match.score[0]}–${match.score[1]}.`
            : `Full-time. ${match.score[0]}–${match.score[1]}.`;
  }
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}

