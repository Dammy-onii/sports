"use client";

import { squadOf } from "@/game/career";
import { overall, potentialStars } from "@/game/ratings";
import { MAX_SQUAD_SIZE, releaseYouth, signYouth } from "@/game/youth";
import { act, useCareer } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { Button, Card, Empty, Ovr, PageHeader, PosBadge, Stars, StatTile } from "../ui";

/** Youth intake decisions and academy overview. */
export function YouthScreen() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const intake = save.youthIntake;
  const squadSize = squadOf(save, club.id).length;
  const youngsters = squadOf(save, club.id).filter((p) => p.age <= 19);
  return (
    <div>
      <PageHeader eyebrow="Team" title="Academy" subtitle="Each pre-season the academy produces prospects. Better academies produce more, with higher potential." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatTile label="Academy level" value={`${club.academy} / 5`} />
        <StatTile label="Squad size" value={`${squadSize} / ${MAX_SQUAD_SIZE}`} />
        <StatTile label="Teenagers in squad" value={youngsters.length} />
      </div>
      <Card>
        {!intake ? (
          <Empty title="No prospects waiting">The next youth intake arrives at the start of next season.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Prospect</th>
                <th className="num">Age</th>
                <th className="num">OVR</th>
                <th>Potential</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {intake.players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <PosBadge pos={p.positions[0]} />
                  </td>
                  <td className="font-medium">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="num">{p.age}</td>
                  <td className="num">
                    <Ovr value={overall(p)} />
                  </td>
                  <td>
                    <Stars value={potentialStars(p)} />
                  </td>
                  <td className="num">
                    <span className="inline-flex gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          const r = act((d) => signYouth(d, p.id));
                          toast(r.ok ? `${p.lastName} signs his first professional contract.` : (r.reason ?? "Couldn't sign him."), r.ok ? "good" : "bad");
                        }}
                      >
                        Sign
                      </Button>
                      <Button size="sm" onClick={() => act((d) => releaseYouth(d, p.id))}>
                        Release
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {intake && <p className="mt-2 text-xs text-muted">Unsigned prospects leave after week {intake.decideBy}.</p>}
    </div>
  );
}
