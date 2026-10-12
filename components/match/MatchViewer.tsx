"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commentaryFor, KEY_EVENTS } from "@/game/commentary";
import { FORMATION_IDS, INSTRUCTION_LABELS } from "@/game/constants";
import { replayLiveMatch } from "@/game/career";
import { MAX_SUBS, applyCommand, clockString, createMatch, emotionLabel, isFinished, playerRating, stepMatch } from "@/game/engine";
import type { MatchEvent, MatchSetup, MatchState, MPlayer, Side } from "@/game/engine/types";
import { familiarity, overallFromScore, positionScore } from "@/game/ratings";
import type { RoleId, ShoutId, TalkTone } from "@/game/roles";
import type { Position, TeamInstructions } from "@/game/types";
import { Button, Crest, Segmented, cn } from "../ui";
import { highlightWindows } from "@/game/highlights";
import { drawPitch, pitchPlayerAt, resolveKits } from "./drawPitch";
import { AssistantCard, LiveAnnouncer, MatchTimeline, OppositionPicker, RolePicker, ShoutBar, TeamTalk } from "./MatchPanels";
import { Slider } from "../Slider";
import { MATCH_PACING, playbackDelta, playbackTicksPerSecond } from "./playback";
import { createPitchMotion, updatePitchMotion, type PitchMotion } from "./motion";
import { ROLES } from "@/game/roles";
import { familiarityLabel, formationFamiliarity } from "@/game/familiarity";


type Tab = "commentary" | "stats" | "ratings" | "tactics";

interface Banner {
  key: number;
  title: string;
  sub: string;
  side: Side;
}

export interface MatchViewerProps {
  setup: MatchSetup;
  seed: number;
  /** Sides the human(s) control. */
  humanSides: Side[];
  onFinish: (state: MatchState, extras: { ftTalk?: TalkTone }) => void;
  finishLabel?: string;
  /** Resume a match previously left at `tick` with these commands applied. */
  resume?: { tick: number; commands: MatchState["commands"] };
  /** Called periodically and on leave so progress can be saved. */
  onProgress?: (state: MatchState) => void;
  /** Assistant manager rating (1–20): drives match notes and talk advice. */
  assistantQuality?: number;
  /** Offer a full-time team talk (career matches). */
  fullTimeTalk?: boolean;
}

export function MatchViewer({ setup, seed, humanSides, onFinish, finishLabel = "Continue", resume, onProgress, assistantQuality = 10, fullTimeTalk = false }: MatchViewerProps) {
  const [match] = useState(() =>
    resume && resume.tick > 0 ? replayLiveMatch({ fixtureId: "", setup, seed, tick: resume.tick, commands: resume.commands }) : createMatch(setup, seed),
  );
  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);
  const saveProgress = () => {
    progressRef.current?.(match);
    // a tactical change rewrites the future, so find the new key moments
    refreshHighlights();
  };
  const [, setFrame] = useState(0);
  const speed = 0;
  const [fps, setFps] = useState<30 | 60>(60);
  const [measuredFps, setMeasuredFps] = useState<number | null>(null);
  const [names, setNames] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightReady, setHighlightReady] = useState(true);
  const highlightWorker = useRef<Worker | null>(null);
  const highlightGeneration = useRef({ id: 0 });
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // a fresh match with a human manager waits for the pre-match talk and kick-off
  const [kickedOff, setKickedOff] = useState(() => humanSides.length === 0 || match.tick > 0);
  const [paused, setPaused] = useState(() => !(humanSides.length === 0 || match.tick > 0));
  const [tab, setTab] = useState<Tab>("commentary");
  const [banner, setBanner] = useState<Banner | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<PitchMotion | undefined>(undefined);
  const [mode, setMode] = useState<"full" | "highlights">("full");
  const ctl = useRef({
    paused: !(humanSides.length === 0 || match.tick > 0),
    tps: playbackTicksPerSecond(MATCH_PACING[0].seconds),
    fps: 60,
    names: true,
    selectedId: null as string | null,
    highlightReady: true,
    holdUntil: 0,
    highlights: false,
    windows: [] as [number, number][],
    /** A manager asked to stop play at the next dead ball (to make changes). */
    stopAtBreak: false,
  });
  const [stopRequested, setStopRequested] = useState(false);
  const [stoppedForChanges, setStoppedForChanges] = useState(false);
  const [ftTalk, setFtTalk] = useState<TalkTone | undefined>();
  /** Phones: tactics open in a bottom sheet so the pitch stays in view. */
  const [sheet, setSheet] = useState(false);

  /** Look-ahead stays off the animation thread; discard responses to old tactics. */
  const refreshHighlights = useCallback(() => {
    const id = ++highlightGeneration.current.id;
    clearTimeout(highlightTimer.current);
    if (!ctl.current.highlights || isFinished(match)) return;
    ctl.current.highlightReady = false;
    setHighlightReady(false);
    highlightTimer.current = setTimeout(() => {
      if (highlightWorker.current) highlightWorker.current.postMessage({ id, state: match });
      else {
        ctl.current.windows = highlightWindows(match);
        ctl.current.highlightReady = true;
        setHighlightReady(true);
      }
    }, 80);
  }, [match]);
  useEffect(() => {
    const generation = highlightGeneration.current;
    try {
      const worker = new Worker(new URL("../../lib/sim/highlights.worker.ts", import.meta.url), { type: "module" });
      highlightWorker.current = worker;
      worker.onmessage = (event: MessageEvent<{ id: number; windows: [number, number][] | null }>) => {
        if (event.data.id !== highlightGeneration.current.id) return;
        ctl.current.windows = event.data.windows ?? highlightWindows(match);
        ctl.current.highlightReady = true;
        setHighlightReady(true);
      };
      worker.onerror = () => {
        worker.terminate();
        highlightWorker.current = null;
        if (ctl.current.highlights) ctl.current.windows = highlightWindows(match);
        ctl.current.highlightReady = true;
        setHighlightReady(true);
      };
    } catch { /* Browsers without workers use the existing synchronous look-ahead. */ }
    if (ctl.current.highlights && !ctl.current.highlightReady) refreshHighlights();
    return () => {
      ++generation.id;
      clearTimeout(highlightTimer.current);
      highlightWorker.current?.terminate();
      highlightWorker.current = null;
    };
  }, [match, refreshHighlights]);
  const [kits] = useState(() => resolveKits(match));

  useEffect(() => {
    ctl.current.paused = paused;
    ctl.current.tps = playbackTicksPerSecond(MATCH_PACING[speed].seconds);
    ctl.current.fps = fps;
    ctl.current.names = names;
    ctl.current.selectedId = selectedId;
  }, [paused, speed, fps, names, selectedId, match]);

  // Simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let size = { w: 0, h: 0 };
    const resize = () => {
      const w = wrap.clientWidth;
      const h = Math.round((w * 68) / 105) + Math.round(w * 0.05 * (68 / 105));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = { w, h };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onHide = () => {
      if (!isFinished(match)) progressRef.current?.(match);
    };
    window.addEventListener("pagehide", onHide);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    let lastPaint = 0;
    let measurementStart = last;
    let paintedFrames = 0;
    const motion = createPitchMotion(match);
    const onVisibility = () => { last = performance.now(); acc = 0; if (document.hidden) progressRef.current?.(match); };
    document.addEventListener("visibilitychange", onVisibility);
    const readyToAdvance = () => !isFinished(match) && match.phase !== "halftime";
    const stopForChanges = () => {
      const c = ctl.current;
      c.stopAtBreak = false;
      c.paused = true;
      acc = 0;
      setStopRequested(false);
      setStoppedForChanges(true);
      setPaused(true);
      setTab("tactics");
      if (window.innerWidth < 1024) setSheet(true);
      progressRef.current?.(match);
    };
    const loop = (now: number) => {
      // tolerate slow / throttled frames without the sim falling far behind
      const dt = playbackDelta(now, last);
      last = now;
      const c = ctl.current;
      let motionCut = false;
      const running = !document.hidden && (!c.highlights || c.highlightReady) && !c.paused && now >= c.holdUntil && !isFinished(match) && match.phase !== "halftime";
      if (running && c.highlights) {
        // jump straight to the next key moment
        const next = c.windows.find((w) => w[1] >= match.tick);
        if (!next || match.tick < next[0]) {
          motionCut = true;
          const target = next ? next[0] : Infinity;
          const budgetStart = performance.now();
          while (match.tick < target && !isFinished(match) && match.phase !== "halftime" && performance.now() - budgetStart < 4) {
            stepMatch(match);
            if (c.stopAtBreak && match.phase === "dead") { stopForChanges(); break; }
          }
          for (const p of match.players) {
            p.px = p.x;
            p.py = p.y;
          }
          match.ball.px = match.ball.x;
          match.ball.py = match.ball.y;
          acc = 0;
          if (match.tick >= target || isFinished(match) || match.phase === "halftime") progressRef.current?.(match);
        }
      }
      const nextWindow = c.windows.find((w) => w[1] >= match.tick);
      const jumping = running && c.highlights && (!nextWindow || match.tick < nextWindow[0]);
      if (running && !c.paused && !jumping && readyToAdvance()) {
        acc += dt * c.tps;
        const budgetStart = performance.now();
        while (acc >= 1 && performance.now() - budgetStart < 5) {
          acc -= 1;
          const before = match.events.length;
          stepMatch(match);
          const goal = match.events.slice(before).find((e) => e.type === "goal");
          if (goal) {
            const scorer = match.players.find((p) => p.id === goal.player);
            setBanner({
              key: goal.tick,
              title: "GOAL!",
              sub: `${scorer?.shortName ?? ""} ${goal.minute}′`,
              side: goal.side,
            });
            c.holdUntil = now + 2200;
            acc = 0;
            break;
          }
          if (match.phase === "halftime" || isFinished(match)) {
            acc = 0;
            progressRef.current?.(match);
            break;
          }
          if (match.tick % 300 === 0) progressRef.current?.(match);
          // requested stoppage: halt when the ball goes dead (throw-in, foul, goal kick…)
          if (c.stopAtBreak && match.phase === "dead") {
            stopForChanges();
            break;
          }
        }
      }
      const alpha = running ? Math.min(1, acc) : 1;
      updatePitchMotion(motion, match, alpha, document.hidden || c.paused ? 0 : dt, motionCut);
      if (now - lastPaint >= 1000 / c.fps - 0.5) {
        drawPitch(ctx, size.w, size.h, match, alpha, kits, { names: c.names, selectedId: c.selectedId, motion });
        // Taps use the last painted positions, including when rendering at 30 fps.
        motionRef.current = { ...motion, players: new Map(motion.players), ball: { ...motion.ball } };
        paintedFrames++;
        const interval = 1000 / c.fps;
        lastPaint = now - ((now - lastPaint) % interval);
      }
      if (document.hidden) { measurementStart = now; paintedFrames = 0; }
      else if (now - measurementStart >= 1000) {
        setMeasuredFps(Math.round(paintedFrames * 1000 / (now - measurementStart)));
        measurementStart = now;
        paintedFrames = 0;
      }
      if (now - lastUi > 220) {
        lastUi = now;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // leaving the page: keep the exact position so the match can be resumed
      if (!isFinished(match)) progressRef.current?.(match);
    };
  }, [match, kits]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  const [home, away] = match.teams;
  const finished = isFinished(match);
  const halftime = match.phase === "halftime";
  const selected = match.players.find((p) => p.id === selectedId);
  const ballCarrier = match.ball.owner === null ? undefined : match.players[match.ball.owner];
  const goals = match.events.filter((e) => e.type === "goal");

  function skipToEnd() {
    setKickedOff(true);
    while (!isFinished(match)) stepMatch(match);
    setFrame((f) => f + 1);
  }

  function setViewMode(m: "full" | "highlights") {
    setMode(m);
    ctl.current.highlights = m === "highlights";
    refreshHighlights();
  }

  function command(cmd: Parameters<typeof applyCommand>[1]) {
    if (applyCommand(match, cmd)) {
      saveProgress();
      setFrame((f) => f + 1);
    }
  }

  const soloSide = humanSides.length === 1 ? humanSides[0] : null;
  const [hk, ak] = kits;
  const homeBar = barColor(hk.fill, hk.stroke);
  const awayBar = barColor(ak.fill, ak.stroke) === homeBar ? "#a3a099" : barColor(ak.fill, ak.stroke);

  function startSecondHalf() {
    stepMatch(match);
    saveProgress();
    setFrame((f) => f + 1);
  }

  return (
    <div className={cn("flex flex-col gap-3", humanSides.length > 0 && "pb-16 lg:pb-0")}>
      {/* Scoreboard */}
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-semibold">{home.name}</span>
          <Crest design={home.crest} colors={home.colors} label={home.shortName} size={30} />
        </div>
        <div className="flex flex-col items-center">
          <div className="rounded-md bg-bg px-3 py-0.5 font-display text-4xl leading-none tabular">
            {match.score[0]}–{match.score[1]}
          </div>
          <div className="text-[11px] text-muted tabular">
            {finished ? "FT" : halftime ? "HT" : clockString(match)}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Crest design={away.crest} colors={away.colors} label={away.shortName} size={30} />
          <span className="truncate text-sm font-semibold">{away.name}</span>
        </div>
      </div>
      {goals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-1 text-[11px] text-muted">
          {[0, 1].map((side) => (
            <div key={side} className={cn("flex flex-wrap gap-x-2", side === 0 ? "justify-end text-right" : "")}>
              {goals
                .filter((g) => g.side === side)
                .map((g) => (
                  <span key={g.tick}>
                    ⚽ {match.players.find((p) => p.id === g.player)?.shortName} {g.minute}′{g.penalty ? " (p)" : ""}
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-2">
          {/* Pitch */}
          <div ref={wrapRef} className="relative overflow-hidden rounded-lg border border-line">
            <canvas ref={canvasRef} className="block cursor-pointer" role="img" aria-label="Live football pitch. Shirt numbers and player names identify each player. Select a player using the roster below."
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setSelectedId(pitchPlayerAt(match, bounds.width, bounds.height, event.clientX - bounds.left, event.clientY - bounds.top, motionRef.current));
              }} />
            {banner && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/30">
                <div key={banner.key} className="animate-pop text-center">
                  <div className="bg-highlight-strong px-5 pb-1 font-display text-6xl italic leading-tight text-text md:text-8xl">Goal.</div>
                  <div className="mt-2 inline-block rounded-md bg-accent px-3 py-1 text-sm text-accent-ink">
                    {match.teams[banner.side].name} · {banner.sub}
                  </div>
                </div>
              </div>
            )}
            {stoppedForChanges && paused && !halftime && !finished && (
              <div className="absolute left-3 top-3 rounded-md bg-accent px-3 py-1.5 text-xs text-accent-ink">
                Play stopped for changes · press Play to resume
              </div>
            )}
            {!kickedOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg/80 backdrop-blur-[2px]">
                <div className="text-center">
                  <div className="eyebrow">Before kick-off</div>
                  <div className="mt-1 font-display text-4xl text-text md:text-5xl">
                    {home.shortName} v {away.shortName}
                  </div>
                  {match.teams.some((t) => t.bigMatch) && <div className="mt-1 text-xs text-muted">A big occasion: team talks will land harder today.</div>}
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setKickedOff(true);
                        setPaused(false);
                      }}
                    >
                      Kick off
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {(halftime || finished) && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg/80 backdrop-blur-[2px]">
                <div className="text-center">
                  <div className="eyebrow">{finished ? "Full-time" : "Half-time"}</div>
                  <div className="mt-1 font-display text-6xl tabular text-text">
                    {match.score[0]}–{match.score[1]}
                  </div>
                  <div className="mt-4 flex justify-center gap-2">
                    {finished ? (
                      <Button variant="primary" onClick={() => onFinish(match, { ftTalk })}>
                        {finishLabel}
                      </Button>
                    ) : (
                      <>
                        {humanSides.length > 0 && (
                          <Button
                            onClick={() => {
                              setTab("tactics");
                              if (window.innerWidth < 1024) setSheet(true);
                            }}
                          >
                            Tactics & subs
                          </Button>
                        )}
                        <Button variant="primary" onClick={startSecondHalf}>
                          Start 2nd half
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pre-match team talk */}
          {!kickedOff && humanSides.length > 0 && (
            <div className={cn("grid gap-3 rounded-lg border border-line bg-surface p-3", humanSides.length > 1 && "sm:grid-cols-2")}>
              {humanSides.map((side) => (
                <TeamTalk
                  key={side}
                  match={match}
                  side={side}
                  given={match.teams[side].preTalk}
                  assistantQuality={assistantQuality}
                  title={humanSides.length > 1 ? `Pre-match talk · ${match.teams[side].shortName}` : "Pre-match team talk"}
                  onGive={(tone) => command({ type: "teamTalk", side, tone })}
                />
              ))}
            </div>
          )}

          {/* Team talks at the break */}
          {halftime && humanSides.length > 0 && (
            <div className={cn("grid gap-3 rounded-lg border border-line bg-surface p-3", humanSides.length > 1 && "sm:grid-cols-2")}>
              {humanSides.map((side) => (
                <TeamTalk
                  key={side}
                  match={match}
                  side={side}
                  given={match.teams[side].talk}
                  assistantQuality={assistantQuality}
                  title={humanSides.length > 1 ? `Half-time talk · ${match.teams[side].shortName}` : "Half-time team talk"}
                  onGive={(tone) => command({ type: "teamTalk", side, tone })}
                />
              ))}
            </div>
          )}
          {finished && fullTimeTalk && soloSide !== null && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <TeamTalk match={match} side={soloSide} given={ftTalk} assistantQuality={assistantQuality} title="Full-time team talk" onGive={setFtTalk} />
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-9 w-24 whitespace-nowrap px-2"
              onClick={() => {
                setStoppedForChanges(false);
                setPaused((p) => !p);
              }}
              disabled={finished || halftime || !kickedOff}
            >
              {paused ? "▶ Play" : "❚❚ Pause"}
            </Button>
            {humanSides.length > 0 && (
              <Button
                className="h-9 whitespace-nowrap px-3"
                variant={stopRequested ? "primary" : "secondary"}
                disabled={finished || halftime || paused}
                onClick={() => {
                  const next = !stopRequested;
                  ctl.current.stopAtBreak = next;
                  setStopRequested(next);
                }}
                title="Play stops the next time the ball goes dead so you can make subs and check stats"
              >
                {stopRequested ? "Waiting for a break…" : "Sub at next break"}
              </Button>
            )}
            <span className="rounded-md border border-line px-3 py-2 text-xs font-semibold">7 minutes · normal pace</span>
            <Segmented
              value={mode}
              onChange={setViewMode}
              options={[
                { value: "full", label: "Full match" },
                { value: "highlights", label: "Highlights" },
              ]}
            />
            <Button variant="ghost" className="ml-auto h-9" onClick={skipToEnd} disabled={finished}>
              Skip to end ⏭
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>90 game minutes = 7 minutes of active playback. Stoppage, pauses and celebrations add time; highlights are shorter.</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={names} onChange={(event) => setNames(event.target.checked)} className="accent-black" /> Player names</label>
              <Segmented value={String(fps)} onChange={(value) => setFps(Number(value) as 30 | 60)} options={[{ value: "30", label: "30 fps" }, { value: "60", label: "60 fps" }]} />
              <span className="min-w-16 tabular" title="Measured canvas frames per second; the adjacent control sets the target.">{measuredFps === null ? "Measuring…" : `${measuredFps} fps live`}</span>
            </div>
          </div>
          {mode === "highlights" && !highlightReady && <p className="text-xs text-muted" role="status">Preparing highlights…</p>}
          <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" aria-live="off">
            <span className="text-xs text-muted">On the ball </span>{ballCarrier ? <strong>#{ballCarrier.shirt} {ballCarrier.shortName} · {match.teams[ballCarrier.side].shortName}</strong> : <span className="text-muted">Ball in flight / restart</span>}
            {selected && <div className="mt-1 border-t border-line pt-1 text-xs">
              <strong>#{selected.shirt} {selected.shortName}</strong> · {match.teams[selected.side].shortName} · {selected.pos} · {ROLES[selected.role].label}
              <span className="ml-2 text-muted">Energy {Math.round(selected.energy * 100)}% · {selected.st.passesCompleted}/{selected.st.passes} passes · {selected.st.shots} shots · Rating {playerRating(match, selected).toFixed(1)}{!selected.onPitch ? " · Off the pitch" : ""}</span>
              <button className="ml-2 underline" onClick={() => setSelectedId(null)}>Clear</button>
            </div>}
          </div>
          <details className="rounded-lg border border-line bg-surface px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">Identify players · tap a name or a player on the pitch</summary>
            <div className="mt-2 grid grid-cols-2 gap-3">{match.teams.map((team) => <div key={team.side}>
              <div className="mb-1 font-semibold">{team.name}</div>
              {team.playerIdx.map((idx) => match.players[idx]).filter((player) => player.onPitch).map((player) => <button key={player.id} aria-pressed={selectedId === player.id} onClick={() => setSelectedId(player.id)} className={cn("block w-full rounded px-2 py-1 text-left", selectedId === player.id ? "bg-highlight" : "hover:bg-surface-2")}><span className="mr-1 font-semibold tabular">#{player.shirt}</span>{player.shortName} <span className="text-muted">· {player.pos}</span></button>)}
            </div>)}</div>
          </details>
          {humanSides.map((side) => (
            <ShoutBar key={side} match={match} side={side} disabled={finished} onShout={(shout: ShoutId | null) => command({ type: "shout", side, shout })} />
          ))}
          <div className={cn("grid gap-2", soloSide !== null && "md:grid-cols-2")}>
            <MatchTimeline match={match} homeColor={homeBar} awayColor={awayBar} />
            {soloSide !== null && (
              <AssistantCard
                match={match}
                side={soloSide}
                quality={assistantQuality}
                onAction={(act) => {
                  if (finished) return;
                  if (act.type === "shout") command({ type: "shout", side: soloSide, shout: act.shout });
                  else {
                    const ins = match.teams[soloSide].instructions;
                    command({ type: "instructions", side: soloSide, instructions: { ...ins, [act.key]: Math.max(1, Math.min(5, ins[act.key] + act.delta)) } });
                  }
                }}
              />
            )}
          </div>
          <LiveAnnouncer match={match} />
          {humanSides.length > 0 && !finished && !sheet && (
            <button
              onClick={() => setSheet(true)}
              className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex h-12 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-ink shadow-lg lg:hidden"
            >
              Tactics & subs
              <span className="text-xs opacity-70">
                · {match.teams[humanSides[0]].subsUsed}/{MAX_SUBS} subs
              </span>
            </button>
          )}
          {sheet && (
            <div className="fixed inset-x-0 bottom-0 z-40 flex max-h-[52dvh] flex-col rounded-t-lg border border-line bg-surface shadow-2xl animate-rise lg:hidden" role="dialog" aria-label="Tactics and substitutions">
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <span className="text-sm font-semibold">
                  Tactics & subs <span className="ml-1 font-normal text-muted tabular">{finished ? "FT" : halftime ? "HT" : clockString(match)}</span>
                </span>
                <span className="flex gap-1">
                  {!finished && !halftime && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setStoppedForChanges(false);
                        setPaused((p) => !p);
                      }}
                    >
                      {paused ? "▶ Play" : "❚❚ Pause"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSheet(false)}>
                    Done
                  </Button>
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                {humanSides.map((side) => (
                  <div key={side}>
                    <div className="px-4 pt-3">
                      <ShoutBar match={match} side={side} disabled={finished} onShout={(shout: ShoutId | null) => command({ type: "shout", side, shout })} />
                    </div>
                    <TacticsPanel
                      match={match}
                      side={side}
                      onChange={() => {
                        saveProgress();
                        setFrame((f) => f + 1);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex min-h-[320px] flex-col rounded-lg border border-line bg-surface lg:max-h-[calc(100dvh-200px)]">
          <div className="border-b border-line p-2">
            <Segmented
              value={tab}
              onChange={setTab}
              className="w-full [&>button]:flex-1"
              options={[
                { value: "commentary", label: "Commentary" },
                { value: "stats", label: "Stats" },
                { value: "ratings", label: "Ratings" },
                ...(humanSides.length ? [{ value: "tactics" as Tab, label: "Tactics" }] : []),
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "commentary" && <CommentaryPanel match={match} />}
            {tab === "stats" && <StatsPanel match={match} />}
            {tab === "ratings" && <RatingsPanel match={match} />}
            {tab === "tactics" && (
              <div className="divide-y divide-line">
                {humanSides.map((side) => (
                  <TacticsPanel
                    key={side}
                    match={match}
                    side={side}
                    onChange={() => {
                      saveProgress();
                      setFrame((f) => f + 1);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentaryPanel({ match }: { match: MatchState }) {
  const items = match.events.filter((e) => e.type !== "chance" || e.tick % 2 === 0).slice(-120).reverse();
  return (
    <ul className="p-2">
      {items.map((e, i) => (
        <CommentaryLine key={`${e.tick}-${e.type}-${i}`} e={e} match={match} />
      ))}
    </ul>
  );
}

function CommentaryLine({ e, match }: { e: MatchEvent; match: MatchState }) {
  const key = KEY_EVENTS.has(e.type);
  const color =
    e.type === "goal" ? "text-accent" : e.type === "red" ? "text-loss" : e.type === "yellow" ? "text-draw" : key ? "text-text" : "text-muted";
  return (
    <li className={cn("flex gap-3 rounded-md px-2 py-1.5 text-sm", e.type === "goal" && "bg-highlight")}>
      <span className="w-8 shrink-0 text-right text-xs text-muted tabular">{e.minute}′</span>
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: resolveKits(match)[e.side].fill, opacity: e.type === "halftime" || e.type === "fulltime" ? 0 : 1 }}
      />
      <span className={cn(color, (key || e.type === "goal") && "font-semibold")}>{commentaryFor(e, match)}</span>
    </li>
  );
}

function luminance(hex: string) {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** A team colour that stays visible on the light page (white kits fall back to their trim, then ink). */
function barColor(fill: string, stroke: string) {
  if (luminance(fill) < 0.8) return fill;
  if (luminance(stroke) < 0.8) return stroke;
  return "#141414";
}

function TeamHeader({ match }: { match: MatchState }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      {match.teams.map((t) => (
        <div key={t.side} className={cn("flex min-w-0 items-center gap-2", t.side === 1 && "flex-row-reverse text-right")}>
          <Crest design={t.crest} colors={t.colors} label={t.shortName} size={26} />
          <span className="truncate text-sm font-semibold">{t.name}</span>
        </div>
      ))}
    </div>
  );
}

function StatsPanel({ match }: { match: MatchState }) {
  const [h, a] = match.teams.map((t) => t.stats);
  const poss = h.possessionTicks + a.possessionTicks;
  const dist = (side: Side) =>
    match.teams[side].playerIdx.reduce((sum, i) => sum + match.players[i].st.distance, 0) / 1000;
  const rows: [string, number, number, (v: number) => string][] = [
    ["Possession", poss ? (h.possessionTicks / poss) * 100 : 50, poss ? (a.possessionTicks / poss) * 100 : 50, (v) => `${Math.round(v)}%`],
    ["Shots", h.shots, a.shots, String],
    ["On target", h.shotsOnTarget, a.shotsOnTarget, String],
    ["Expected goals", h.xg, a.xg, (v) => v.toFixed(2)],
    ["Passes", h.passes, a.passes, String],
    [
      "Pass accuracy",
      h.passes ? (h.passesCompleted / h.passes) * 100 : 0,
      a.passes ? (a.passesCompleted / a.passes) * 100 : 0,
      (v) => `${Math.round(v)}%`,
    ],
    ["Tackles won", h.tackles, a.tackles, String],
    ["Saves", h.saves, a.saves, String],
    ["Corners", h.corners, a.corners, String],
    ["Offsides", h.offsides, a.offsides, String],
    ["Fouls", h.fouls, a.fouls, String],
    ["Yellow cards", h.yellows, a.yellows, String],
    ["Red cards", h.reds, a.reds, String],
    ["Distance (km)", dist(0), dist(1), (v) => v.toFixed(1)],
  ];
  const [hk, ak] = resolveKits(match);
  const hc = barColor(hk.fill, hk.stroke);
  let ac = barColor(ak.fill, ak.stroke);
  if (ac === hc) ac = "#a3a099";
  return (
    <div>
      <TeamHeader match={match} />
      <div className="flex flex-col gap-3 p-4">
        {rows.map(([label, hv, av, fmt]) => {
          const total = hv + av;
          const hp = total ? (hv / total) * 100 : 50;
          return (
            <div key={label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold tabular">{fmt(hv)}</span>
                <span className="text-xs text-muted">{label}</span>
                <span className="font-semibold tabular">{fmt(av)}</span>
              </div>
              <div className="flex h-1.5 gap-1">
                <div className="flex flex-1 justify-end overflow-hidden rounded-sm bg-surface-2">
                  <div style={{ width: `${hp}%`, background: hc }} />
                </div>
                <div className="flex flex-1 overflow-hidden rounded-sm bg-surface-2">
                  <div style={{ width: `${100 - hp}%`, background: ac }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ratingColor(r: number) {
  return r >= 8 ? "bg-accent text-accent-ink" : r >= 7 ? "bg-win/80 text-white" : r >= 6 ? "bg-surface-2 text-text" : "bg-loss/70 text-white";
}

/** Overall rating of a match player in a given position (fatigue not applied). */
function mOverall(p: MPlayer, pos: Position) {
  return overallFromScore(positionScore(p.attrs, pos) * familiarity({ positions: p.naturalPositions }, pos));
}

function RatingsPanel({ match }: { match: MatchState }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <TeamHeader match={match} />
      <p className="px-4 pt-2 text-[11px] text-muted">Tap a player for his full match stats.</p>
      <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 lg:grid-cols-1">
        {match.teams.map((t) => {
          const ps = t.playerIdx.map((i) => match.players[i]).filter((p) => p.used);
          return (
            <ul key={t.side}>
              <li className="eyebrow mb-1 px-1">{t.shortName}</li>
              {ps.map((p) => (
                <PlayerRow key={p.id} p={p} match={match} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
              ))}
            </ul>
          );
        })}
      </div>
    </div>
  );
}

function PlayerRow({ p, match, open, onToggle }: { p: MPlayer; match: MatchState; open: boolean; onToggle: () => void }) {
  const r = playerRating(match, p);
  const st = p.st;
  const minutes = Math.round(p.ticksPlayed / 60);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const stats: [string, string | number][] = [
    ["Minutes", minutes],
    ["Rating", r.toFixed(1)],
    ["OVR here", mOverall(p, p.pos)],
    ["Energy", `${Math.round(p.energy * 100)}%`],
    ["Goals", st.goals],
    ["Assists", st.assists],
    ["Shots", `${st.shotsOnTarget}/${st.shots}`],
    ["xG", st.xg.toFixed(2)],
    ["Passes", `${st.passesCompleted}/${st.passes}`],
    ["Pass %", pct(st.passesCompleted, st.passes)],
    ["Key passes", st.keyPasses],
    ["Dribbles", st.dribbles],
    ["Tackles", `${st.tacklesWon}/${st.tackles}`],
    ["Interceptions", st.interceptions],
    ["Fouls", st.fouls],
    ["Offsides", st.offsides],
    ["Lost ball", st.possessionLost],
    ["Distance", `${(st.distance / 1000).toFixed(1)} km`],
    ...(p.pos === "GK" ? ([["Saves", st.saves], ["Conceded", st.conceded]] as [string, number][]) : []),
  ];
  return (
    <li className={cn("rounded-md", open && "bg-surface-2")}>
      <button onClick={onToggle} className={cn("flex w-full items-center gap-2 px-1 py-1 text-left text-sm", !p.onPitch && "opacity-55")}>
        <span className="w-6 text-right text-xs text-muted tabular">{p.shirt}</span>
        <span className="w-7 text-[10px] text-muted">{p.pos}</span>
        <span className="flex-1 truncate">
          {p.shortName}
          {st.goals > 0 && <span className="ml-1">{"⚽".repeat(st.goals)}</span>}
          {st.assists > 0 && <span className="ml-1 text-xs text-muted">🅰{st.assists > 1 ? st.assists : ""}</span>}
          {p.yellow > 0 && <span className="ml-1 inline-block h-3 w-2 rounded-[1px] bg-draw align-middle" />}
          {p.sentOff && <span className="ml-1 inline-block h-3 w-2 rounded-[1px] bg-loss align-middle" />}
          {p.subbedOff && <span className="ml-1 text-[10px] text-loss">↓</span>}
          {(() => {
            const mood = emotionLabel(p.emo);
            return mood ? (
              <span className="ml-1 text-[11px]" title={mood.label} aria-label={mood.label}>
                {mood.icon}
              </span>
            ) : null;
          })()}
        </span>
        {p.onPitch && (
          <span className="h-1 w-10 overflow-hidden rounded-sm bg-line" title="Energy">
            <span className="block h-full bg-win" style={{ width: `${p.energy * 100}%` }} />
          </span>
        )}
        <span className={cn("w-9 rounded px-1 text-center text-xs font-bold tabular", ratingColor(r))}>{r.toFixed(1)}</span>
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-1 px-2 pb-2 text-center">
          {stats.map(([l, v]) => (
            <div key={l} className="rounded bg-surface px-1 py-1">
              <div className="text-[10px] text-muted">{l}</div>
              <div className="text-xs font-semibold tabular">{v}</div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function TacticsPanel({ match, side, onChange }: { match: MatchState; side: Side; onChange: () => void }) {
  const team = match.teams[side];
  const [outId, setOutId] = useState<string | null>(null);
  const players = team.playerIdx.map((i) => match.players[i]);
  const onField = players.filter((p) => p.onPitch);
  const bench = players.filter((p) => !p.used && !p.onPitch && !p.sentOff);
  const finished = isFinished(match);
  const outgoing = outId ? players.find((p) => p.id === outId) : undefined;
  const canSub = !finished && team.subsUsed < MAX_SUBS;

  function setInstruction(k: keyof TeamInstructions, v: number) {
    applyCommand(match, { type: "instructions", side, instructions: { ...team.instructions, [k]: v } });
    onChange();
  }

  function sub(inId: string) {
    if (!outId) return;
    applyCommand(match, { type: "sub", side, outId, inId });
    setOutId(null);
    onChange();
  }

  const energyClass = (e: number) => (e < 0.6 ? "text-loss" : e < 0.75 ? "text-draw" : "text-muted");

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Crest design={team.crest} colors={team.colors} label={team.shortName} size={22} /> {team.name}
        </span>
        <span className="text-[11px] font-normal text-muted" title="Tactical familiarity right now">
          {familiarityLabel(team.fam)} · {Math.round(team.fam * 100)}%
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FORMATION_IDS.map((f) => {
          const ff = team.familiarity ? Math.round(formationFamiliarity(team.familiarity, f) * 100) : null;
          return (
            <button
              key={f}
              disabled={finished}
              title={ff !== null ? `Familiarity ${ff}%` : undefined}
              onClick={() => {
                applyCommand(match, { type: "formation", side, formation: f });
                onChange();
              }}
              className={cn("h-8 rounded-md border px-2.5 text-xs font-semibold tabular", team.formation === f ? "border-accent bg-highlight text-accent" : "border-line text-muted")}
            >
              {f}
              {ff !== null && <span className={cn("ml-1 text-[9px] font-normal", ff < 60 && "text-loss-ink")}>{ff}%</span>}
            </button>
          );
        })}
      </div>
      {(Object.keys(INSTRUCTION_LABELS) as (keyof TeamInstructions)[]).map((k) => (
        <Slider key={k} label={INSTRUCTION_LABELS[k].label} min={1} max={5} ticks value={team.instructions[k]} disabled={finished}
          valueText={`${team.instructions[k]}/5 · ${team.instructions[k] <= 2 ? INSTRUCTION_LABELS[k].low : team.instructions[k] >= 4 ? INSTRUCTION_LABELS[k].high : "Balanced"}`}
          low={INSTRUCTION_LABELS[k].low} high={INSTRUCTION_LABELS[k].high} onChange={(value) => setInstruction(k, value)} />
      ))}

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold">
          <span className="mr-1 inline-block transition group-open:rotate-90">›</span>Player roles & instructions
        </summary>
        <div className="mt-2">
          <RolePicker
            match={match}
            side={side}
            disabled={finished}
            onRole={(slot, role) => {
              applyCommand(match, { type: "role", side, slot, role: role as RoleId });
              onChange();
            }}
            onPi={(slot, pi) => {
              applyCommand(match, { type: "pi", side, slot, pi: pi ?? null });
              onChange();
            }}
          />
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold">
          <span className="mr-1 inline-block transition group-open:rotate-90">›</span>Opposition instructions
        </summary>
        <div className="mt-2">
          <OppositionPicker
            match={match}
            side={side}
            disabled={finished}
            onOi={(playerId, oi) => {
              applyCommand(match, { type: "oi", side, playerId, oi });
              onChange();
            }}
          />
        </div>
      </details>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold">Substitutions</span>
          <span className="text-muted">
            {team.subsUsed}/{MAX_SUBS} used
          </span>
        </div>
        <p className="mb-2 text-xs text-muted">
          {outgoing ? `Replacing ${outgoing.shortName} (${outgoing.pos}). Pick who comes on.` : "1. Tap who comes off. 2. Tap who comes on."}
        </p>
        <div className="mb-1 grid grid-cols-[1fr_auto_auto] gap-x-2 px-2 text-[10px] text-muted">
          <span>On the pitch</span>
          <span>Rating</span>
          <span>Energy</span>
        </div>
        <div className="flex flex-col gap-1">
          {onField.map((p) => {
            const r = playerRating(match, p);
            return (
              <button
                key={p.id}
                disabled={!canSub}
                onClick={() => setOutId(outId === p.id ? null : p.id)}
                className={cn(
                  "grid grid-cols-[28px_1fr_auto_40px] items-center gap-2 rounded-md border px-2 py-1 text-left text-xs disabled:opacity-40",
                  outId === p.id ? "border-loss bg-loss/10" : "border-line",
                )}
              >
                <span className="text-[10px] text-muted">{p.pos}</span>
                <span className="truncate"><span className="mr-1 font-semibold tabular">#{p.shirt}</span>{p.shortName}</span>
                <span className={cn("w-8 rounded px-1 text-center font-bold tabular", ratingColor(r))}>{r.toFixed(1)}</span>
                <span className={cn("text-right tabular", energyClass(p.energy))}>{Math.round(p.energy * 100)}%</span>
              </button>
            );
          })}
        </div>

        <div className="mb-1 mt-3 grid grid-cols-[1fr_auto_auto] gap-x-2 px-2 text-[10px] text-muted">
          <span>Bench</span>
          <span>{outgoing ? `OVR as ${outgoing.pos}` : "OVR"}</span>
          <span>Fitness</span>
        </div>
        <div className="flex flex-col gap-1">
          {bench.map((p) => (
            <button
              key={p.id}
              disabled={!outgoing || !canSub}
              onClick={() => sub(p.id)}
              className={cn(
                "grid grid-cols-[28px_1fr_auto_40px] items-center gap-2 rounded-md border px-2 py-1 text-left text-xs",
                outgoing ? "border-win/50 bg-highlight" : "border-line opacity-80",
              )}
            >
              <span className="text-[10px] text-muted">{p.naturalPositions[0]}</span>
              <span className="truncate"><span className="mr-1 font-semibold tabular">#{p.shirt}</span>{p.shortName}</span>
              <span className="w-8 text-center font-bold tabular">{mOverall(p, outgoing ? outgoing.pos : p.naturalPositions[0])}</span>
              <span className={cn("text-right tabular", energyClass(p.energy))}>{Math.round(p.energy * 100)}%</span>
            </button>
          ))}
          {bench.length === 0 && <span className="text-xs text-muted">No substitutes left.</span>}
        </div>
      </div>
    </div>
  );
}
