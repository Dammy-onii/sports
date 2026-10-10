"use client";

import { tieWinner } from "@/game/cup";
import type { SaveGame } from "@/game/save";
import type { Fixture } from "@/game/types";
import { useCareer } from "@/lib/store/save-store";
import { Card, Crest, Empty, PageHeader, Tag, cn } from "../ui";

/** Domestic cup: every round drawn so far, with the user's path highlighted. */
export function CupScreen() {
  const save = useCareer();
  const cup = save.cup;
  const me = save.userClubId;
  const alive = cup.alive.includes(me) && !cup.winnerId;
  const winner = cup.winnerId ? save.clubs[cup.winnerId] : undefined;
  const firstRoundCount = cup.rounds[0]?.fixtures.length ?? 0;
  const status = winner
    ? winner.id === me
      ? "You won it!"
      : `Won by ${winner.name}.`
    : alive
      ? cup.byes.includes(me) && cup.rounds.length === 1
        ? "Seeded: you have a bye into the next round."
        : "Still in it."
      : cup.rounds.length
        ? "Knocked out."
        : "The draw hasn't been made yet.";

  return (
    <div>
      <PageHeader eyebrow={`Season ${cup.season}`} title={cup.name} subtitle={`A straight knockout for every club in the pyramid. Draws go straight to penalties. ${status}`}>
        <div className="mt-2 flex gap-2">
          {alive && <Tag tone="highlight">In the cup</Tag>}
          {winner && <Tag tone={winner.id === me ? "good" : "neutral"}>Winner: {winner.shortName}</Tag>}
        </div>
      </PageHeader>

      {cup.rounds.length === 0 ? (
        <Empty title="No rounds yet" />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max gap-4">
            {cup.rounds.map((round, i) => (
              <section key={i} className="w-64 shrink-0">
                <h2 className="eyebrow mb-2">
                  {round.name}
                  <span className="ml-1 normal-case tracking-normal text-muted">· {round.fixtures.length} ties</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {round.fixtures.map((f) => (
                    <Tie key={f.id} save={save} f={f} />
                  ))}
                </div>
                {i === 0 && cup.byes.length > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    Byes ({cup.byes.length}): {cup.byes.map((id) => save.clubs[id]?.shortName).join(", ")}
                  </p>
                )}
              </section>
            ))}
            {!cup.winnerId && <FutureRounds count={remainingRounds(firstRoundCount, cup.byes.length, cup.rounds.length)} />}
          </div>
        </div>
      )}
    </div>
  );
}

function remainingRounds(firstTies: number, byes: number, drawn: number): number {
  const size = firstTies * 2 + byes;
  return Math.max(0, Math.round(Math.log2(Math.max(1, size))) - drawn);
}

function FutureRounds({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <section key={i} className="w-48 shrink-0">
          <h2 className="eyebrow mb-2 text-muted">To be drawn</h2>
          <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Drawn after the previous round</div>
        </section>
      ))}
    </>
  );
}

function Tie({ save, f }: { save: SaveGame; f: Fixture }) {
  const w = tieWinner(f);
  const r = f.result;
  const mine = f.homeId === save.userClubId || f.awayId === save.userClubId;
  const row = (id: string, goals?: number) => {
    const c = save.clubs[id];
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5", w && w !== id && "text-muted", w === id && "font-semibold")}>
        {c && <Crest design={c.crest} colors={c.colors} label={c.shortName} size={16} />}
        <span className={cn("min-w-0 flex-1 truncate text-sm", id === save.userClubId && "underline decoration-2 underline-offset-2")}>{c?.name ?? id}</span>
        <span className="text-sm tabular">{goals ?? ""}</span>
      </div>
    );
  };
  return (
    <Card className={cn("overflow-hidden", mine && "border-text")}>
      {row(f.homeId, r?.homeGoals)}
      <div className="border-t border-line" />
      {row(f.awayId, r?.awayGoals)}
      {r?.penalties && (
        <div className="border-t border-line bg-surface-2 px-3 py-1 text-[11px] text-muted">
          {r.penalties[0]}–{r.penalties[1]} on penalties
        </div>
      )}
    </Card>
  );
}
