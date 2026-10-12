"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startLiveMatch, userFixture, weekLabel } from "@/game/career";
import { staffRating } from "@/game/economy";
import type { MatchState } from "@/game/engine/types";
import type { SaveGame } from "@/game/save";
import { completeRoundAsync } from "@/lib/sim/client";
import { setSave, updateSave, useSave } from "@/lib/store/save-store";
import { MatchViewer } from "../match/MatchViewer";
import { Button, ButtonLink } from "../ui";
import { MatchTrainingTimer, useTrainingClock } from "../MatchTrainingTimer";
import { prepSessionProgress } from "@/game/training-session";

export function MatchScreen() {
  const save = useSave();
  const now = useTrainingClock();
  const [skipPrepFor, setSkipPrepFor] = useState<string | null>(null);
  if (save === undefined) return <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>;
  if (save === null)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-muted">No career found.</p>
        <ButtonLink href="/new" variant="primary">New career</ButtonLink>
      </div>
    );
  // Next.js keeps visited pages alive (React <Activity>), so key by fixture:
  // a new matchday mounts a fresh match instead of restoring the last one.
  const fixture = userFixture(save);
  const preparation = prepSessionProgress(save.training, save.calendarIndex, now, save.leagues[0].season);
  if (fixture && !save.liveMatch && save.training.matchPrep && save.training.matchPrep !== "none" && !preparation.ready && skipPrepFor !== fixture.id) {
    return <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="font-display text-3xl">Match training is in progress</h1>
      <MatchTrainingTimer save={save} now={now} />
      <p className="text-sm text-muted">When your drill finishes, the match will be ready to start with its preparation bonuses.</p>
      <div className="flex flex-wrap gap-2"><ButtonLink href="/prep">Change preparation</ButtonLink><Button onClick={() => setSkipPrepFor(fixture.id)}>Play now without prep bonuses</Button></div>
    </main>;
  }
  return <CareerMatch key={fixture?.id ?? "none"} save={save} />;
}

function CareerMatch({ save }: { save: SaveGame }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // Frozen at first render: resuming uses the stored live match, otherwise a new one is created.
  const [live] = useState(() => startLiveMatch(save));

  if (!live) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-muted">No match to play right now.</p>
        <ButtonLink href="/club">Back to club</ButtonLink>
      </div>
    );
  }

  const userSide = (live.setup.home.clubId === save.userClubId ? 0 : 1) as 0 | 1;

  // Record the match as "in progress" once it has actually kicked off, so
  // leaving can't reset it (and an untouched page never claims a fixture).
  function progress(state: MatchState) {
    if (saving || (state.tick === 0 && state.commands.length === 0)) return;
    updateSave((d) => {
      if (userFixture(d)?.id !== live!.fixtureId) return; // fixture already played
      if (d.liveMatch?.fixtureId !== live!.fixtureId) d.liveMatch = structuredClone(live!);
      d.liveMatch.tick = state.tick;
      d.liveMatch.commands = state.commands.map((c) => ({ ...c }));
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-3 md:px-6 md:py-5">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/club" className="text-sm text-muted hover:text-text">
          ← Back to club (progress is saved)
        </Link>
        <span className="text-xs text-muted">{weekLabel(save)}</span>
      </div>
      <MatchViewer
        setup={live.setup}
        seed={live.seed}
        resume={live.tick > 0 ? { tick: live.tick, commands: live.commands } : undefined}
        humanSides={[userSide]}
        onProgress={progress}
        assistantQuality={Math.min(20, staffRating(save.clubs[save.userClubId].staff, "assistant") + (save.clubs[save.userClubId].staff.analyst?.rating ?? 0) / 5)}
        fullTimeTalk
        finishLabel={saving ? "Saving…" : "Save result & see report"}
        onFinish={async (state, { ftTalk }) => {
          if (saving) return;
          setSaving(true);
          const next = await completeRoundAsync(save, state, { ftTalk });
          router.push(next.reports.some((r) => r.fixtureId === live.fixtureId) ? `/report?id=r_${live.fixtureId}` : "/club");
          setSave(next);
        }}
      />
    </main>
  );
}
