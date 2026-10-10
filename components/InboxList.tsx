"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/game/ratings";
import type { SaveGame } from "@/game/save";
import { promisePlaytime } from "@/game/squad";
import { acceptOffer, rejectOffer } from "@/game/transfers";
import type { InboxMessage } from "@/game/types";
import { act, updateSave } from "@/lib/store/save-store";
import { toast } from "./overlay";
import { Button, ButtonLink, Empty, Tag, cn } from "./ui";

function MessageActions({ save, m }: { save: SaveGame; m: InboxMessage }) {
  const a = m.action;
  if (!a) return null;
  switch (a.kind) {
    case "offer": {
      const offer = save.offers.find((o) => o.id === a.offerId);
      if (!offer) return <span className="text-xs text-muted">Offer no longer open.</span>;
      const p = save.players[offer.playerId];
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const r = act((d) => acceptOffer(d, offer.id));
              toast(r.ok ? `${p.lastName} sold for ${formatMoney(offer.fee)}.` : (r.reason ?? "Couldn't complete the sale."), r.ok ? "good" : "bad");
            }}
          >
            Accept {formatMoney(offer.fee)}
          </Button>
          <Button size="sm" onClick={() => act((d) => rejectOffer(d, offer.id))}>
            Reject
          </Button>
          <ButtonLink size="sm" variant="ghost" href={`/player?id=${offer.playerId}`}>
            View player
          </ButtonLink>
        </div>
      );
    }
    case "unhappy": {
      const p = save.players[a.playerId];
      if (!p || p.clubId !== save.userClubId) return null;
      return (
        <div className="flex flex-wrap gap-2">
          {!p.promise && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                act((d) => promisePlaytime(d.players[p.id], d.calendarIndex));
                toast(`You promised ${p.lastName} more football. Keep your word over the next six weeks.`);
              }}
            >
              Promise playing time
            </Button>
          )}
          <ButtonLink size="sm" href={`/player?id=${p.id}`}>
            View player
          </ButtonLink>
        </div>
      );
    }
    case "press": {
      return save.press ? (
        <ButtonLink size="sm" variant="primary" href="/media">
          Face the press
        </ButtonLink>
      ) : (
        <span className="text-xs text-muted">Answered.</span>
      );
    }
    case "youth":
      return save.youthIntake ? (
        <ButtonLink size="sm" variant="primary" href="/youth">
          Review prospects
        </ButtonLink>
      ) : null;
    case "report":
      return save.reports.some((r) => r.id === a.reportId) ? (
        <ButtonLink size="sm" href={`/report?id=${a.reportId}`}>
          Match report
        </ButtonLink>
      ) : null;
    case "player":
    case "contract":
      return (
        <ButtonLink size="sm" href={`/player?id=${a.playerId}`}>
          View player
        </ButtonLink>
      );
    case "link":
      return (
        <ButtonLink size="sm" href={a.href}>
          {a.label}
        </ButtonLink>
      );
  }
}

export function InboxList({ save, messages, limit, emptyText = "No messages." }: { save: SaveGame; messages: InboxMessage[]; limit?: number; emptyText?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = limit ? messages.slice(0, limit) : messages;
  if (!list.length) return <Empty>{emptyText}</Empty>;
  return (
    <ul className="divide-y divide-line">
      {list.map((m) => {
        const expanded = open === m.id;
        return (
          <li key={m.id} className={cn(!m.read && "bg-highlight/35")}>
            <button
              type="button"
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
              onClick={() => {
                setOpen(expanded ? null : m.id);
                if (!m.read) updateSave((d) => void (d.inbox.find((x) => x.id === m.id)!.read = true));
              }}
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", m.read ? "bg-transparent" : "bg-win")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {m.tag && <Tag>{m.tag}</Tag>}
                  <span className={cn("truncate text-sm", !m.read && "font-semibold")}>{m.title}</span>
                </span>
                {!expanded && <span className="mt-0.5 line-clamp-1 block text-xs text-muted">{m.body}</span>}
              </span>
              {m.action && !expanded && <span className="mt-0.5 shrink-0 text-xs text-win-ink">Action</span>}
            </button>
            {expanded && (
              <div className="flex flex-col gap-3 px-4 pb-4 pl-9">
                <p className="whitespace-pre-line text-sm text-text/85">{m.body}</p>
                <MessageActions save={save} m={m} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function InboxLink() {
  return (
    <Link href="/inbox" className="text-xs text-muted underline-offset-4 hover:text-text hover:underline">
      All messages
    </Link>
  );
}
