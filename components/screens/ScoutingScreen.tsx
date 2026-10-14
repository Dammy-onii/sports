"use client";

import { useState } from "react";
import { addAssignment, maxAssignments, removeAssignment } from "@/game/club";
import { STAFF_INFO, staffRating } from "@/game/economy";
import { formatMoney, playerValue } from "@/game/ratings";
import type { ScoutAssignment } from "@/game/save";
import { fmtRange, knowledgeOf, ovrRange } from "@/game/scouting";
import type { Player } from "@/game/types";
import { act, updateSave, useCareer, useOnboarding } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { PlayerLink, PotentialStars } from "../PlayerParts";
import { Button, ButtonLink, Card, Empty, Field, PageHeader, Panel, PosBadge, StatTile, Tabs, Tag } from "../ui";
import { Term } from "../Term";

const GROUPS = [
  { value: "GK", label: "Goalkeepers" },
  { value: "DEF", label: "Defenders" },
  { value: "MID", label: "Midfielders" },
  { value: "ATT", label: "Attackers" },
];

type Tab = "reports" | "shortlist";

export function ScoutingScreen() {
  const save = useCareer();
  useOnboarding("scouting");
  const [tab, setTab] = useState<Tab>("reports");
  const club = save.clubs[save.userClubId];
  const scout = club.staff.scout;
  const rating = staffRating(club.staff, "scout");
  const cap = maxAssignments(save);

  const describe = (a: ScoutAssignment) => {
    if (a.kind === "position") return GROUPS.find((g) => g.value === a.value)?.label ?? a.value;
    if (a.kind === "youth") return "Young talent (21 and under)";
    return a.value === "FA" ? "Free agents" : (save.leagues.find((l) => l.id === a.value)?.name ?? a.value);
  };

  const scouted = Object.values(save.players)
    .filter((p) => p.clubId !== save.userClubId && knowledgeOf(save, p) >= 60)
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 60);
  const shortlisted = save.shortlist.map((id) => save.players[id]).filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="Club"
        title="Scouting"
        subtitle="Other clubs' players show attribute ranges until your scouts have watched them. Assignments scout new players every week; requests are scouted in full."
        actions={
          <ButtonLink href="/staff" size="sm">
            Staff
          </ButtonLink>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Chief scout" value={scout ? scout.name : "Vacant"} hint={`Rating ${rating}/20`} />
        <StatTile label="Assignments" value={`${save.scouting.assignments.length} / ${cap}`} hint="A better scout runs more" />
        <StatTile label="Requests queued" value={save.scouting.queue.length} hint={`${1 + Math.floor(rating / 7)} reported per week`} />
        <StatTile label="Players known" value={scouted.length >= 60 ? "60+" : scouted.length} hint="60%+ knowledge" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Assignments" subtitle={STAFF_INFO.scout.effect}>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {save.scouting.assignments.length === 0 && <p className="text-sm text-muted">No assignments. Your scout is only watching your shortlist.</p>}
              {save.scouting.assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
                  <span>{describe(a)}</span>
                  <Button size="sm" variant="ghost" onClick={() => updateSave((d) => removeAssignment(d, a.id))}>
                    Remove
                  </Button>
                </div>
              ))}
              <NewAssignment disabled={save.scouting.assignments.length >= cap} leagues={save.leagues.map((l) => ({ value: l.id, label: l.name }))} />
            </div>
          </Panel>
          <Panel title="Scouting requests" subtitle="Players you asked about by name">
            <ul className="flex flex-col gap-1 px-4 pb-4 text-sm">
              {save.scouting.queue.length === 0 && <li className="text-muted">Use “Scout him” on any player&apos;s profile.</li>}
              {save.scouting.queue.map((id, i) => {
                const p = save.players[id];
                if (!p) return null;
                return (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="mr-2 text-xs text-muted tabular">{i + 1}.</span>
                      <PlayerLink p={p} />
                    </span>
                    <button className="text-xs text-muted hover:text-text" onClick={() => updateSave((d) => void (d.scouting.queue = d.scouting.queue.filter((x) => x !== id)))}>
                      Cancel
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <div>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "reports", label: `Scouted players` },
              { value: "shortlist", label: `Shortlist (${shortlisted.length})` },
            ]}
            className="mb-3"
          />
          <Card>
            {tab === "reports" ? (
              scouted.length ? <PlayerTable players={scouted} /> : <Empty title="No reports yet">Set an assignment and reports arrive after each match week.</Empty>
            ) : shortlisted.length ? (
              <PlayerTable players={shortlisted} />
            ) : (
              <Empty title="Shortlist empty">Add players from their profile or the transfer market to track them.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function NewAssignment({ disabled, leagues }: { disabled: boolean; leagues: { value: string; label: string }[] }) {
  const [kind, setKind] = useState<ScoutAssignment["kind"]>("position");
  const [value, setValue] = useState("MID");
  const options = kind === "position" ? GROUPS : kind === "league" ? [...leagues, { value: "FA", label: "Free agents" }] : [{ value: "u21", label: "21 and under, anywhere" }];
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Look at">
          <select
            className="input"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as ScoutAssignment["kind"];
              setKind(k);
              setValue(k === "position" ? "MID" : k === "league" ? (leagues[0]?.value ?? "FA") : "u21");
            }}
          >
            <option value="position">Position</option>
            <option value="league">Division</option>
            <option value="youth">Youth</option>
          </select>
        </Field>
        <Field label="Target">
          <select className="input" value={value} onChange={(e) => setValue(e.target.value)} disabled={kind === "youth"}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button
        size="sm"
        variant="primary"
        disabled={disabled}
        onClick={() => {
          const r = act((d) => addAssignment(d, kind, value));
          if (!r.ok) toast(r.reason ?? "Couldn't add it.", "bad");
        }}
      >
        {disabled ? "At capacity" : "Add assignment"}
      </Button>
    </div>
  );
}

function PlayerTable({ players }: { players: Player[] }) {
  const save = useCareer();
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Player</th>
            <th>Club</th>
            <th className="num">Age</th>
            <th className="num"><Term k="ovr">OVR</Term></th>
            <th><Term k="potential">Potential</Term></th>
            <th className="num">Value</th>
            <th className="num">Known</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const k = knowledgeOf(save, p);
            return (
              <tr key={p.id}>
                <td>
                  <PosBadge pos={p.positions[0]} />
                </td>
                <td>
                  <PlayerLink p={p} />
                  {save.shortlist.includes(p.id) && (
                    <Tag tone="highlight" className="ml-1.5">
                      ★
                    </Tag>
                  )}
                </td>
                <td className="text-muted">{save.clubs[p.clubId]?.shortName ?? "Free"}</td>
                <td className="num">{p.age}</td>
                <td className="num font-semibold">{fmtRange(ovrRange(p, k))}</td>
                <td>
                  <PotentialStars save={save} p={p} />
                </td>
                <td className="num">{formatMoney(playerValue(p))}</td>
                <td className="num text-muted">{Math.round(k)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
