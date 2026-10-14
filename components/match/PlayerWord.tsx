"use client";

import { OUTCOME_LABEL, WORD_COOLDOWN, WORD_IDS, WORDS, isFinished, outcomeOf, playerRating, wordAvailable, wordScore, type MatchState, type MPlayer, type WordId, type WordOutcome } from "@/game/engine";
import { cn } from "../ui";

const TONE: Record<WordOutcome, string> = {
  fired: "text-win-ink",
  good: "text-win-ink",
  unmoved: "text-muted",
  bad: "text-loss-ink",
};

/**
 * Talk to one player during the match. Each line lists what decides how he
 * takes it, and (with a decent assistant) the assistant's read beforehand.
 */
export function PlayerWord({ match, p, assistantQuality, onWord }: { match: MatchState; p: MPlayer; assistantQuality: number; onWord: (word: WordId) => void }) {
  if (!p.onPitch || p.sentOff || isFinished(match)) return null;
  const recent = (p.wordsAt ?? []).filter((t) => p.ticksPlayed - t < 900);
  const last = recent[recent.length - 1];
  const wait = last !== undefined ? WORD_COOLDOWN - (p.ticksPlayed - last) : 0;
  const active = p.word && p.ticksPlayed < p.word.until ? p.word : undefined;
  const rating = p.used && p.ticksPlayed > 300 ? playerRating(match, p) : 6.5;
  // a better assistant reads the dressing room better
  const showRead = assistantQuality >= 8;
  const lastWord = [...match.events].reverse().find((e) => e.type === "word" && e.player === p.id);
  const [lw, lo, reply] = (lastWord?.text ?? "").split("|");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">Have a word with {p.shortName}</span>
        {active && <span className="text-[10px] text-muted">{WORDS[active.id as WordId]?.label}: {Math.ceil((active.until - p.ticksPlayed) / 60)} min left</span>}
      </div>
      {lastWord && (
        <p className="rounded bg-surface px-2 py-1 text-[11px]">
          {lastWord.minute}′ “{WORDS[lw as WordId]?.line}” <span className="text-muted">{reply}</span>{" "}
          <span className={cn("font-semibold", TONE[lo as WordOutcome])}>{OUTCOME_LABEL[lo as WordOutcome]}</span>
        </p>
      )}
      {wait > 0 ? (
        <p className="text-[11px] text-muted">Give him {Math.ceil(wait / 60)} more minute{Math.ceil(wait / 60) === 1 ? "" : "s"} before you speak to him again.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {WORD_IDS.filter((w) => wordAvailable(p, w)).map((w) => {
            const read = outcomeOf(wordScore(p, w, { rating, recent: recent.length }));
            return (
              <button
                key={w}
                type="button"
                onClick={() => onWord(w)}
                title={`${WORDS[w].blurb} Decided by: ${WORDS[w].decidedBy}.`}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-left hover:border-text"
              >
                <span className="block text-xs font-semibold">{WORDS[w].label}</span>
                <span className="block text-[10px] text-muted">{WORDS[w].decidedBy}</span>
                {showRead && <span className={cn("block text-[10px] font-semibold", TONE[read])}>Assistant: {read === "bad" ? "he won't like it" : read === "unmoved" ? "won't do much" : read === "fired" ? "he'll love it" : "should help"}</span>}
              </button>
            );
          })}
        </div>
      )}
      {recent.length >= 2 && wait <= 0 && <p className="text-[10px] text-muted">You&apos;ve spoken to him {recent.length} times recently. Players tune out if you keep on at them.</p>}
    </div>
  );
}
