"use client";

import { useState } from "react";
import { REACTION_INFO, talkTo, TOPICS, topicAvailability, type TalkResult, type Topic } from "@/game/dynamics";
import { Rng } from "@/game/rng";
import type { Player } from "@/game/types";
import { act, useCareer } from "@/lib/store/save-store";
import { Dialog } from "./overlay";
import { Button, Tag, cn } from "./ui";

/** Have a word with a player (docs/DEPTH_PLAN.md §8). */
export function TalkDialog({ player, open, onClose }: { player: Player; open: boolean; onClose: () => void }) {
  const save = useCareer();
  const p = save.players[player.id] ?? player;
  const [result, setResult] = useState<{ topic: Topic; res: TalkResult } | null>(null);
  const avail = topicAvailability(save, p);
  const rapport = Math.round(p.rapport ?? 50);

  function say(topic: Topic) {
    const res = act((d) => {
      const rng = new Rng(d.rngState);
      const r = talkTo(d, p.id, topic, rng);
      d.rngState = rng.getState();
      return r;
    });
    setResult({ topic, res });
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setResult(null);
        onClose();
      }}
      title={`Talk to ${p.lastName}`}
      description={`Morale ${Math.round(p.morale)} · rapport with you ${rapport}/100 · last training ${p.training?.length ? p.training[p.training.length - 1].toFixed(1) : "–"}`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted">You: {TOPICS[result.topic].blurb}</div>
          <blockquote className="rounded-md bg-surface-2 px-3 py-2 text-sm italic">&ldquo;{result.res.reply.replace(/^"|"$/g, "")}&rdquo;</blockquote>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Tag tone={REACTION_INFO[result.res.reaction].tone === "good" ? "good" : REACTION_INFO[result.res.reaction].tone === "bad" ? "bad" : "neutral"}>{REACTION_INFO[result.res.reaction].label}</Tag>
            <span className="text-muted">
              Morale {result.res.morale >= 0 ? "+" : ""}
              {Math.round(result.res.morale)} · rapport {result.res.rapport >= 0 ? "+" : ""}
              {Math.round(result.res.rapport)}
            </span>
          </div>
          {result.res.extra && <p className="text-sm">{result.res.extra}</p>}
          <Button size="sm" className="w-fit" onClick={() => setResult(null)}>
            Say something else
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(TOPICS) as Topic[]).map((t) => {
            const why = avail[t];
            const recent = p.talks?.[t] !== undefined && save.calendarIndex - p.talks[t]! < 3;
            return (
              <button
                key={t}
                disabled={!!why}
                onClick={() => say(t)}
                title={why ?? undefined}
                className={cn("rounded-md border border-line px-3 py-2 text-left hover:border-text disabled:cursor-not-allowed disabled:opacity-40")}
              >
                <span className="block text-sm font-semibold">{TOPICS[t].label}</span>
                <span className="block text-xs text-muted">{why ?? (recent ? "You raised this recently: it will carry less weight." : TOPICS[t].blurb)}</span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
