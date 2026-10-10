"use client";

import { useState } from "react";
import { answerRequest, hierarchy, MEETINGS, REACTION_INFO, teamMeeting, type MeetingTopic, type Reaction } from "@/game/dynamics";
import { averageForm } from "@/game/ratings";
import { Rng } from "@/game/rng";
import type { Player } from "@/game/types";
import { act, useCareer } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { PlayerLink } from "../PlayerParts";
import { TalkDialog } from "../TalkDialog";
import { Button, Card, Empty, Meter, PageHeader, Panel, PosBadge, StatTile, Tag, cn } from "../ui";

const toneOf = (r: Reaction) => (REACTION_INFO[r].tone === "good" ? "good" : REACTION_INFO[r].tone === "bad" ? "bad" : "neutral");

function moodLabel(m: number) {
  return m >= 80 ? "Superb" : m >= 65 ? "Good" : m >= 50 ? "Okay" : m >= 35 ? "Poor" : "Very poor";
}

/** The dressing room: hierarchy, groups, cohesion, happiness and conversations. */
export function DynamicsScreen() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const h = hierarchy(save);
  const [talkTo, setTalkTo] = useState<Player | null>(null);
  const mood = h.players.reduce((a, r) => a + r.player.morale, 0) / Math.max(1, h.players.length);
  const unhappy = h.players.filter((r) => r.player.morale < 40 || r.player.transferRequest);
  const sinceMeeting = save.calendarIndex - save.dynamics.lastMeeting;

  function respond(id: string, key: string) {
    const out = act((d) => answerRequest(d, id, key));
    toast(out.text, toneOf(out.reaction) === "bad" ? "bad" : toneOf(out.reaction) === "good" ? "good" : "info");
  }

  function meeting(topic: MeetingTopic) {
    const out = act((d) => {
      const rng = new Rng(d.rngState);
      const r = teamMeeting(d, topic, rng);
      d.rngState = rng.getState();
      return r;
    });
    toast(`${REACTION_INFO[out.reaction].label}. ${out.text}`, toneOf(out.reaction) === "bad" ? "bad" : toneOf(out.reaction) === "good" ? "good" : "info");
  }

  return (
    <div>
      <PageHeader eyebrow="Team" title="Dynamics" subtitle="Who runs the dressing room, how happy everyone is, and how well the squad knows each other." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Team cohesion" value={`${Math.round(club.cohesion ?? 60)}%`} hint="Stable squads link up better" />
        <StatTile label="Squad mood" value={moodLabel(mood)} hint={`${Math.round(mood)}/100 average`} />
        <StatTile label="Captain" value={h.captain ? h.captain.lastName : "–"} hint="The most influential player" />
        <StatTile label="Unhappy" value={unhappy.length} tone={unhappy.length ? "bad" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {save.requests.length > 0 && (
            <Panel title="Players who want a word" subtitle="Unanswered requests sour after three weeks">
              <ul className="flex flex-col gap-3 px-4 pb-4">
                {save.requests.map((r) => (
                  <li key={r.id} className="rounded-md bg-surface-2 p-3 text-sm">
                    <p className="mb-2">{r.text}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.options.map((o) => (
                        <Button key={o.key} size="sm" onClick={() => respond(r.id, o.key)}>
                          {o.label}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Card>
            <div className="px-4 pt-3.5 pb-2.5">
              <div className="text-sm font-semibold">Hierarchy</div>
              <div className="text-xs text-muted">Influence comes from status, time at the club, age, leadership and quality. Leaders&apos; moods spread.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="table min-w-[560px]">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Player</th>
                    <th>Standing</th>
                    <th className="num">Influence</th>
                    <th>Mood</th>
                    <th className="num">Rapport</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {h.players.map(({ player: p, influence, tier }) => (
                    <tr key={p.id}>
                      <td>
                        <PosBadge pos={p.positions[0]} />
                      </td>
                      <td className="whitespace-nowrap">
                        <PlayerLink p={p} />
                        {(p.settled ?? 100) < 60 && (
                          <Tag tone="warn" className="ml-1.5">
                            Settling in
                          </Tag>
                        )}
                      </td>
                      <td className="text-xs">{tier === "Other" ? <span className="text-muted">Other</span> : tier}</td>
                      <td className="num tabular">{Math.round(influence)}</td>
                      <td>
                        <span className={cn("text-xs", p.morale < 40 ? "text-loss-ink" : p.morale >= 70 ? "text-win-ink" : "")}>{moodLabel(p.morale)}</span>
                      </td>
                      <td className="num tabular text-xs">{Math.round(p.rapport ?? 50)}</td>
                      <td className="num">
                        <Button size="sm" variant="ghost" onClick={() => setTalkTo(p)}>
                          Talk
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Team meeting" subtitle={sinceMeeting < 4 ? `Last meeting ${sinceMeeting} week${sinceMeeting === 1 ? "" : "s"} ago: another one now will carry less weight.` : "Address the whole squad."}>
            <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
              {(Object.keys(MEETINGS) as MeetingTopic[]).map((t) => (
                <button key={t} onClick={() => meeting(t)} className="rounded-md border border-line px-3 py-2 text-left hover:border-text">
                  <span className="block text-sm font-semibold">{MEETINGS[t].label}</span>
                  <span className="block text-xs text-muted">{MEETINGS[t].blurb}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Social groups" subtitle="Players stick together by nationality and age">
            <ul className="flex flex-col gap-3 px-4 pb-4">
              {h.groups.map((g) => (
                <li key={g.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className={cn("text-xs", g.mood < 45 ? "text-loss-ink" : "text-muted")}>{moodLabel(g.mood)}</span>
                  </div>
                  <Meter value={g.mood} label={`${g.name} mood`} />
                  <p className="mt-1 text-xs text-muted">
                    Led by {g.leader.lastName} · {g.members.map((m) => m.lastName).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Unhappy players">
            {unhappy.length === 0 ? (
              <Empty title="Everyone's content" />
            ) : (
              <ul className="flex flex-col gap-2 px-4 pb-4 text-sm">
                {unhappy.map(({ player: p, tier }) => {
                  const form = averageForm(p);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        <PlayerLink p={p} /> <span className="text-xs text-muted">· {tier}{form !== null ? ` · form ${form.toFixed(1)}` : ""}{p.transferRequest ? " · wants to leave" : ""}</span>
                      </span>
                      <Button size="sm" onClick={() => setTalkTo(p)}>
                        Talk
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      {talkTo && <TalkDialog player={talkTo} open onClose={() => setTalkTo(null)} />}
    </div>
  );
}
