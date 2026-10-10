"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { currentSeason, weekLabel } from "@/game/career";
import { PressConferenceCard } from "./screens/MediaScreen";
import { formatMoney } from "@/game/ratings";
import type { SaveGame } from "@/game/save";
import { nextStep, pendingItems } from "@/lib/next-step";
import { completeRoundAsync, startNextSeasonAsync } from "@/lib/sim/client";
import { setSave, updateSave, useSave } from "@/lib/store/save-store";
import { Dialog, toast } from "./overlay";
import { Button, ButtonLink, Crest, ICONS, Icon, Spinner, cn } from "./ui";

/** Renders a career screen once the local save has loaded. */
export function RequireCareer({ children }: { children: ReactNode }) {
  const save = useSave();
  if (save === undefined) {
    return (
      <div className="flex flex-col gap-3 py-10" aria-busy="true">
        <div className="h-10 w-64 animate-pulse rounded-md bg-surface-2" />
        <div className="h-32 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }
  if (save === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="font-display text-3xl">No career open.</p>
        <p className="text-muted">Start a new one, or continue one from the home screen.</p>
        <div className="flex gap-2">
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
          <ButtonLink href="/new" variant="primary">
            New career
          </ButtonLink>
        </div>
      </div>
    );
  }
  return <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-surface-2" />}>{children}</Suspense>;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

function navGroups(save: SaveGame | null | undefined): { label: string; items: NavItem[] }[] {
  const unread = save ? save.inbox.filter((m) => !m.read).length : 0;
  const youth = save?.youthIntake?.players.length ?? 0;
  const offers = save?.offers.length ?? 0;
  return [
    {
      label: "Overview",
      items: [
        { href: "/club", label: "Home", icon: ICONS.home },
        { href: "/inbox", label: "Inbox", icon: ICONS.inbox, badge: unread },
      ],
    },
    {
      label: "Team",
      items: [
        { href: "/squad", label: "Squad", icon: ICONS.squad },
        { href: "/tactics", label: "Tactics", icon: ICONS.tactics },
        { href: "/prep", label: "Match prep", icon: ICONS.whistle },
        { href: "/dynamics", label: "Dynamics", icon: ICONS.squad, badge: save?.requests?.length ?? 0 },
        { href: "/training", label: "Training", icon: ICONS.training },
        { href: "/youth", label: "Academy", icon: ICONS.star, badge: youth },
      ],
    },
    {
      label: "Competitions",
      items: [
        { href: "/league", label: "League", icon: ICONS.league },
        { href: "/cup", label: "Cup", icon: ICONS.cup },
        { href: "/fixtures", label: "Fixtures & results", icon: ICONS.fixtures },
      ],
    },
    {
      label: "Club",
      items: [
        { href: "/transfers", label: "Transfers", icon: ICONS.transfers, badge: offers },
        { href: "/scouting", label: "Scouting", icon: ICONS.scouting },
        { href: "/analytics", label: "Analytics", icon: ICONS.league },
        { href: "/finances", label: "Finances", icon: ICONS.finances },
        { href: "/staff", label: "Staff", icon: ICONS.staff },
      ],
    },
    {
      label: "Manager",
      items: [
        { href: "/manager", label: "Profile & trophies", icon: ICONS.manager },
        { href: "/media", label: "Media", icon: ICONS.news, badge: save?.press ? 1 : 0 },
        { href: "/settings", label: "Settings & delegation", icon: ICONS.settings },
        { href: "/editor", label: "Editor", icon: ICONS.editor },
      ],
    },
  ];
}

const MOBILE_TABS: NavItem[] = [
  { href: "/club", label: "Home", icon: ICONS.home },
  { href: "/squad", label: "Squad", icon: ICONS.squad },
  { href: "/tactics", label: "Tactics", icon: ICONS.tactics },
  { href: "/league", label: "League", icon: ICONS.league },
];

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition",
        active ? "bg-highlight font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon d={item.icon} />
      <span className="flex-1 truncate">{item.label}</span>
      {!!item.badge && <span className="rounded bg-accent px-1.5 text-[11px] font-semibold tabular text-accent-ink">{item.badge}</span>}
    </Link>
  );
}

function ContinueButton({ save, compact }: { save: SaveGame; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const step = nextStep(save);

  async function advance() {
    setBusy(true);
    try {
      const next = step.kind === "season" ? await startNextSeasonAsync(save) : await completeRoundAsync(save);
      setSave(next);
      const headline = next.inbox.find((m) => !m.read && m.tag === "Result") ?? next.inbox[0];
      if (headline) toast(headline.title);
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "jobs" || step.kind === "resume") {
    return (
      <ButtonLink href={step.href} variant="primary" className={compact ? "h-9 px-3" : ""}>
        <Icon d={ICONS.play} className="h-4 w-4" />
        {step.label}
      </ButtonLink>
    );
  }
  if (step.kind === "play") {
    return (
      <ButtonLink href={step.href} variant="primary" className={compact ? "h-9 px-3" : ""} title={step.sub}>
        <Icon d={ICONS.play} className="h-4 w-4" />
        <span className="max-w-[60vw] truncate">{step.label}</span>
      </ButtonLink>
    );
  }
  return (
    <Button variant="primary" size={compact ? "sm" : "md"} onClick={advance} disabled={busy} title={step.kind === "advance" ? step.sub : undefined}>
      {busy ? <Spinner /> : <Icon d={ICONS.chevronRight} className="h-4 w-4" />}
      {step.label}
      {step.kind === "advance" && !compact && <span className="hidden font-normal opacity-70 lg:inline">· {step.sub}</span>}
    </Button>
  );
}

function PressDialog({ save, open, onClose }: { save: SaveGame; open: boolean; onClose: () => void }) {
  if (!save.press) return null;
  return (
    <Dialog open={open} onClose={onClose} title="Press conference">
      <PressConferenceCard />
    </Dialog>
  );
}

export function CareerShell({ children }: { children: ReactNode }) {
  const save = useSave();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [pressOpen, setPressOpen] = useState(false);
  const club = save ? save.clubs[save.userClubId] : null;
  const colors = club?.colors ?? { primary: "#eceae4", secondary: "#dcd9d2" };
  const groups = navGroups(save);
  const pending = save ? pendingItems(save) : [];
  const isActive = (href: string) => pathname === href || (href !== "/club" && pathname.startsWith(href + "/"));

  // close the More sheet on navigation
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const pendingChips = (
    <>
      {pending.map((p) =>
        p.href === "press" ? (
          <button
            key={p.label}
            type="button"
            onClick={() => setPressOpen(true)}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-xs hover:border-text"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-win" />
            {p.label}
          </button>
        ) : (
          <Link key={p.label} href={p.href} className="inline-flex h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-xs hover:border-text">
            <span className={cn("h-1.5 w-1.5 rounded-full", p.tone === "warn" ? "bg-warn" : "bg-win")} />
            {p.label}
          </Link>
        ),
      )}
    </>
  );

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>
      {/* Desktop side nav */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <Link href="/" className="flex items-baseline px-4 pb-3 pt-4 font-display text-3xl">
          Touchline<span className="ml-0.5 inline-block h-2 w-2 rounded-full bg-win" />
        </Link>
        <div className="mx-3 mb-3 flex items-center gap-3 rounded-md bg-surface-2 p-2.5">
          <Crest design={club?.crest} colors={colors} label={club?.shortName ?? ""} size={34} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{club?.name ?? "—"}</div>
            <div className="text-xs text-muted tabular">{club ? formatMoney(club.balance) : " "}</div>
          </div>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="eyebrow px-2.5 pb-1 pt-2">{g.label}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.href} item={it} active={isActive(it.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 md:px-8">
            <Link href="/club" className="flex min-w-0 items-center gap-2.5 md:hidden">
              <Crest design={club?.crest} colors={colors} label={club?.shortName ?? ""} size={28} />
              <span className="truncate text-sm font-semibold">{club?.name ?? "Touchline"}</span>
            </Link>
            {save && (
              <div className="hidden min-w-0 md:block">
                <div className="text-sm font-medium">{weekLabel(save)}</div>
                <div className="text-xs text-muted">
                  Season {currentSeason(save)} · Week {Math.min(save.calendarIndex + 1, save.calendar.length)} of {save.calendar.length}
                </div>
              </div>
            )}
            <div className="ml-auto hidden flex-wrap items-center justify-end gap-1.5 lg:flex">{pendingChips}</div>
            {save && (
              <div className="ml-auto lg:ml-2">
                <ContinueButton save={save} compact />
              </div>
            )}
          </div>
          {pending.length > 0 && <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-2 lg:hidden">{pendingChips}</div>}
        </header>

        <main id="main" className="flex-1 px-4 py-5 pb-28 md:px-8 md:py-7 md:pb-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {MOBILE_TABS.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href) ? "page" : undefined}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(n.href) ? "font-medium text-text" : "text-muted")}
          >
            <span className={cn("rounded-md px-3 py-0.5", isActive(n.href) && "bg-highlight")}>
              <Icon d={n.icon} />
            </span>
            {n.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted" aria-haspopup="dialog">
          <span className="relative rounded-md px-3 py-0.5">
            <Icon d={ICONS.more} />
            {pending.length > 0 && <span className="absolute right-2 top-0 h-2 w-2 rounded-full bg-win" />}
          </span>
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/35 animate-fade md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-label="All sections"
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-lg bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))] animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />
            {groups.map((g) => (
              <div key={g.label} className="mb-3">
                <div className="eyebrow px-2.5 pb-1">{g.label}</div>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map((it) => (
                    <NavLink key={it.href} item={it} active={isActive(it.href)} onClick={() => setMoreOpen(false)} />
                  ))}
                </div>
              </div>
            ))}
            <Link href="/" onClick={() => setMoreOpen(false)} className="mt-2 block px-2.5 text-sm text-muted underline-offset-4 hover:underline">
              Exit to home screen
            </Link>
          </div>
        </div>
      )}
      {save && <PressDialog save={save} open={pressOpen} onClose={() => setPressOpen(false)} />}
    </div>
  );
}
