"use client";

import { useRouter } from "next/navigation";
import { acceptJob, leagueOfClub, squadOf } from "@/game/career";
import { overall } from "@/game/ratings";
import { setSave, useCareer } from "@/lib/store/save-store";
import { Button, Card, Crest, Empty, PageHeader } from "../ui";

/** After a sacking: pick one of the clubs offering a job. */
export function JobsScreen() {
  const save = useCareer();
  const router = useRouter();
  const offers = save.jobOffers ?? [];
  return (
    <div>
      <PageHeader eyebrow="Manager" title="Job offers" subtitle="The board let you go. These clubs want to talk." />
      {offers.length === 0 ? (
        <Empty title="No offers">You&apos;re in a job.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {offers.map((id) => {
            const c = save.clubs[id];
            const league = leagueOfClub(save, id);
            const squad = squadOf(save, id);
            const avg = Math.round(squad.reduce((a, p) => a + overall(p), 0) / Math.max(1, squad.length));
            return (
              <Card key={id} className="flex flex-col gap-3 p-5">
                <Crest design={c.crest} colors={c.colors} label={c.shortName} size={56} />
                <div>
                  <div className="font-display text-3xl leading-none">{c.name}</div>
                  <div className="mt-1 text-sm text-muted">
                    {league.name} · squad average {avg} OVR
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => {
                    setSave(acceptJob(save, id));
                    router.push("/club");
                  }}
                >
                  Take the job
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
