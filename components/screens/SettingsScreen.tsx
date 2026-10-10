"use client";

import type { Delegation } from "@/game/save";
import { exportSlot, updateSave, useCareer } from "@/lib/store/save-store";
import { toast } from "../overlay";
import { Button, ButtonLink, PageHeader, Panel, Toggle } from "../ui";

const DELEGATE: { key: keyof Delegation; label: string; description: string }[] = [
  { key: "selection", label: "Team selection", description: "Your assistant picks the strongest available XI before each match. Your formation and roles stay." },
  { key: "training", label: "Training", description: "Your assistant sets the weekly focus and intensity based on fitness and fixtures." },
  { key: "press", label: "Press conferences", description: "Your assistant answers the media with a safe, cautious line." },
  { key: "youth", label: "Youth intake", description: "The best prospects are signed automatically if there is room in the squad." },
];

export function SettingsScreen() {
  const save = useCareer();
  return (
    <div>
      <PageHeader eyebrow="Manager" title="Settings" subtitle="Hand routine jobs to your staff for quicker sessions. You can take them back any time." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Delegation" subtitle="How good the result is depends on your assistant manager">
          <div className="flex flex-col px-3 pb-3">
            {DELEGATE.map((d) => (
              <Toggle key={d.key} checked={save.delegation[d.key]} onChange={(v) => updateSave((s) => void (s.delegation[d.key] = v))} label={d.label} description={d.description} />
            ))}
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Getting started">
            <div className="flex flex-col gap-2 px-4 pb-4 text-sm">
              <p className="text-muted">Show the first-season checklist on the Club page again.</p>
              <Button
                size="sm"
                className="w-fit"
                onClick={() => {
                  updateSave((s) => void (s.onboarding = { tactics: false, training: false, match: false, scouting: false, transfers: false, dismissed: false }));
                  toast("Checklist restored.");
                }}
              >
                Reset checklist
              </Button>
            </div>
          </Panel>
          <Panel title="This save" subtitle="Stored only in this browser until cloud sync arrives">
            <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
              <dl className="grid grid-cols-2 gap-1.5">
                <dt className="text-muted">Device</dt>
                <dd className="text-right font-mono text-xs">{save.sync.deviceId}</dd>
                <dt className="text-muted">Revision</dt>
                <dd className="text-right tabular">{save.sync.revision}</dd>
                <dt className="text-muted">Last saved</dt>
                <dd className="text-right">{new Date(save.updatedAt).toLocaleString()}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const out = exportSlot(save.id);
                    if (!out) return;
                    const url = URL.createObjectURL(new Blob([out.json], { type: "application/json" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = out.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export backup
                </Button>
                <ButtonLink href="/" size="sm" variant="ghost">
                  Manage save slots
                </ButtonLink>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
