"use client";

import { useState } from "react";
import { answerPress, fansLabel } from "@/game/media";
import { Rng } from "@/game/rng";
import type { PressTone } from "@/game/save";
import { act, useCareer } from "@/lib/store/save-store";
import { Card, Empty, Icon, ICONS, Meter, PageHeader, Panel, StatTile, Tabs, Tag } from "../ui";

const TONE_LABEL: Record<PressTone, string> = {
  confident: "Confident",
  cautious: "Measured",
  fiery: "Fiery",
  praise: "Praise",
  critical: "Critical",
  deflect: "Deflect",
  mindgames: "Mind games",
};

/** Answer the current press conference, question by question. */
export function PressConferenceCard() {
  const save = useCareer();
  const pc = save.press;
  const [last, setLast] = useState<string | null>(null);
  if (!pc) return last ? <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">{last}</p> : null;
  const q = pc.questions[pc.answered];
  const opp = (() => {
    const all = [...save.leagues.flatMap((l) => l.fixtures), ...save.cup.rounds.flatMap((r) => r.fixtures), ...(save.superCup ? [save.superCup] : [])];
    const f = all.find((x) => x.id === pc.fixtureId);
    return f ? save.clubs[f.homeId === save.userClubId ? f.awayId : f.homeId] : undefined;
  })();
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="eyebrow">
          {pc.kind === "pre" ? "Pre-match" : "Post-match"} press conference{opp ? ` · ${opp.name}` : ""}
        </span>
        <span className="text-xs text-muted">
          Question {pc.answered + 1} of {pc.questions.length}
        </span>
      </div>
      {last && <p className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">{last}</p>}
      <p className="mb-3 font-display text-2xl leading-tight">&ldquo;{q.text}&rdquo;</p>
      <div className="flex flex-col gap-2">
        {q.options.map((o) => (
          <button
            key={o.tone}
            type="button"
            onClick={() => {
              const out = act((d) => {
                const rng = new Rng(d.rngState);
                const r = answerPress(d, o.tone, rng);
                d.rngState = rng.getState();
                return r;
              });
              setLast(out);
            }}
            className="rounded-md border border-line px-4 py-3 text-left hover:border-text hover:bg-surface-2"
          >
            <span className="eyebrow">{TONE_LABEL[o.tone]}</span>
            <span className="mt-1 block text-sm">&ldquo;{o.label}&rdquo;</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

type Tab = "news" | "awards";

export function MediaScreen() {
  const save = useCareer();
  const [tab, setTab] = useState<Tab>("news");
  const fans = save.fans ?? 60;
  const season = save.leagues[0].season;
  const awards = (save.awards ?? []).filter((a) => a.season === season || a.season === season - 1).slice().reverse();
  const mine = (save.awards ?? []).filter((a) => a.clubId === save.userClubId);

  return (
    <div>
      <PageHeader eyebrow="Manager" title="Media" subtitle="Press conferences, what the papers are saying, the fans' mood and the awards." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Supporters" value={fansLabel(fans)} hint={`${Math.round(fans)}/100: crowds and the board notice`} tone={fans < 35 ? "bad" : undefined} />
        <StatTile label="Press conferences" value={save.press ? "Waiting" : "None"} hint={save.delegation.press ? "Delegated to your assistant" : "Unanswered ones go to your assistant"} />
        <StatTile label="Awards this season" value={mine.filter((a) => a.season === season).length} hint="For your club and players" />
        <StatTile label="Manager awards" value={save.manager.awards?.length ?? 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {save.press ? <PressConferenceCard /> : <Card className="p-4 text-sm text-muted">No press conference waiting. The media want you before big games, every few weeks, and after matches.</Card>}
          <Panel title="Supporters' mood">
            <div className="px-4 pb-4 text-sm">
              <Meter value={fans} label="Supporters' mood" />
              <p className="mt-2 text-xs text-muted">Wins (doubly so in derbies), bold press answers and fair ticket prices keep them happy. Restless fans thin the crowds and worry the board.</p>
            </div>
          </Panel>
        </div>
        <div>
          <Tabs
            value={tab}
            onChange={setTab}
            className="mb-3"
            options={[
              { value: "news", label: "News" },
              { value: "awards", label: "Awards" },
            ]}
          />
          {tab === "news" ? (
            <Card>
              {save.news.length === 0 ? (
                <Empty title="Quiet week" />
              ) : (
                <ul className="divide-y divide-line">
                  {save.news.slice(0, 40).map((n) => (
                    <li key={n.id} className="flex gap-3 px-4 py-2.5 text-sm">
                      <Icon d={ICONS.news} className="mt-0.5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">{n.text}</span>
                      <span className="shrink-0 text-[11px] text-muted">W{n.week + 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Card>
              {awards.length === 0 ? (
                <Empty title="No awards yet">Monthly awards come every four league weeks; season awards at the end.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {awards.slice(0, 60).map((a, i) => (
                    <li key={i} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                      <span className="w-40 shrink-0 text-xs text-muted">
                        {a.name}
                        {a.month ? ` · M${a.month}` : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        {a.playerName ?? (save.clubs[a.clubId]?.isUser ? save.manager.name : save.clubs[a.clubId]?.manager?.name ?? "")} <span className="text-muted">({save.clubs[a.clubId]?.shortName})</span>
                        {a.clubId === save.userClubId && (
                          <Tag tone="highlight" className="ml-1.5">
                            Yours
                          </Tag>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{a.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
