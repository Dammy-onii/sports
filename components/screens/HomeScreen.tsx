"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  MAX_SLOTS,
  activateSlot,
  deleteSlot,
  exportSlot,
  importSave,
  storageError,
  useSlots,
  type SlotMeta,
} from "@/lib/store/save-store";
import { Button, ButtonLink, Card, Crest } from "../ui";

const MODES = [
  { title: "Quick Match", body: "A one-off friendly against any club. Test your tactics.", href: "/quick", ready: true },
  { title: "Local Head-to-Head", body: "Two managers, one device. Pick your XI and outfox your mate.", href: "/local", ready: true },
  { title: "Online Leagues & Cups", body: "Live and async matches against real managers, federations and trophies.", href: "#", ready: false, phase: "Phase 2" },
];

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SlotCard({ slot, isActive }: { slot: SlotMeta; isActive: boolean }) {
  const router = useRouter();
  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <Crest design={slot.crest} colors={slot.colors} label={slot.shortName} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-bold">{slot.clubName}</span>
            {isActive && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">Last played</span>}
          </div>
          <div className="truncate text-sm text-muted">
            {slot.managerName} · Season {slot.season} · {slot.leagueName}
          </div>
          <div className="text-xs text-muted/70">Saved {new Date(slot.updatedAt).toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          className="flex-1 sm:flex-none"
          onClick={() => {
            activateSlot(slot.id);
            router.push("/club");
          }}
        >
          Continue
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const file = exportSlot(slot.id);
            if (file) download(file.filename, file.json);
          }}
        >
          Export
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete your career with ${slot.clubName}? This can't be undone. Export it first if you want a backup.`)) deleteSlot(slot.id);
          }}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

export function HomeScreen() {
  const index = useSlots();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const slots = index ? [...index.slots].sort((a, b) => b.updatedAt - a.updatedAt) : [];
  const full = slots.length >= MAX_SLOTS;
  const error = index ? storageError() : null;

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = importSave(await file.text());
    setImportError(err);
    if (!err) router.push("/club");
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-6 md:px-10 md:py-8">
        <nav className="flex items-center justify-between gap-4">
          <span className="flex items-baseline font-display text-3xl">
            Touchline<span className="ml-0.5 inline-block h-2 w-2 rounded-full bg-win" />
          </span>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/quick" className="hidden text-text/80 hover:text-text sm:inline">Quick match</Link>
            <Link href="/local" className="hidden text-text/80 hover:text-text sm:inline">Head-to-head</Link>
            {!full && (
              <ButtonLink href="/new" variant="primary" className="h-10">
                New career
              </ButtonLink>
            )}
          </div>
        </nav>

        <header className="pt-6 md:pt-14">
          <div className="eyebrow flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-win" /> A football club manager
          </div>
          <h1 className="mt-6 font-display text-[3.4rem] leading-[0.95] md:text-[6.5rem]">
            <span className="text-muted">Matchday lasts ninety minutes.</span>{" "}
            <span className="marker italic">The club is forever.</span>
          </h1>
          <div className="mt-10 border-t border-line pt-8 md:flex md:items-end md:justify-between md:gap-10">
            <p className="max-w-xl leading-relaxed text-text/80">
              Build a club from the First Division up. Develop players, read their personalities, out-think rival
              managers on matchday and win trophies. Plays fully offline.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="eyebrow">
              Your careers {index && `(${slots.length}/${MAX_SLOTS})`}
            </h2>
            <div className="flex gap-2">
              <Button variant="ghost" className="h-9" onClick={() => fileRef.current?.click()} disabled={full}>
                Import save
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
              {full ? (
                <Button className="h-9" disabled>
                  Slots full
                </Button>
              ) : (
                <ButtonLink href="/new" variant="primary" className="h-9">
                  New career
                </ButtonLink>
              )}
            </div>
          </div>
          {importError && <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm">{importError}</p>}
          {error && <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm">{error}</p>}
          {index === undefined ? (
            <Card className="h-28 animate-pulse" />
          ) : slots.length === 0 ? (
            <Card className="p-5">
              <div className="text-lg font-bold">Start your career</div>
              <p className="mt-1 text-sm text-muted">
                Create your club in the First Division, fight for promotion, and build a dynasty. Plays fully offline.
              </p>
            </Card>
          ) : (
            slots.map((s) => <SlotCard key={s.id} slot={s} isActive={s.id === index.active} />)
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {MODES.map((m) =>
            m.ready ? (
              <ButtonLink key={m.title} href={m.href} className="h-auto flex-col items-start justify-start p-4 text-left">
                <span className="text-sm font-semibold">{m.title}</span>
                <span className="text-xs leading-relaxed text-muted">{m.body}</span>
              </ButtonLink>
            ) : (
              <div key={m.title} className="rounded-md border border-dashed border-line p-4 opacity-70">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{m.title}</span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{m.phase}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{m.body}</p>
              </div>
            ),
          )}
        </section>

        <footer className="mt-auto text-xs text-muted">
          Works offline. Careers are saved on this device. Use Export to back them up or move them to another device.
        </footer>
      </div>
    </main>
  );
}
