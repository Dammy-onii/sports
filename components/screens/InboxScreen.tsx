"use client";

import { useState } from "react";
import { updateSave, useCareer } from "@/lib/store/save-store";
import { InboxList } from "../InboxList";
import { Button, Card, PageHeader, Tabs } from "../ui";

export function InboxScreen() {
  const save = useCareer();
  const tags = Array.from(new Set(save.inbox.map((m) => m.tag).filter(Boolean))) as string[];
  const [tab, setTab] = useState<string>("all");
  const list = save.inbox.filter((m) => tab === "all" || (tab === "action" ? !!m.action : tab === "unread" ? !m.read : m.tag === tab));
  const unread = save.inbox.filter((m) => !m.read).length;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Inbox"
        subtitle="Results, scout reports, offers and squad news. Messages with actions can be handled right here."
        actions={
          <Button size="sm" disabled={!unread} onClick={() => updateSave((d) => d.inbox.forEach((m) => (m.read = true)))}>
            Mark all read
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread", count: unread },
          { value: "action", label: "Needs action", count: save.inbox.filter((m) => m.action).length },
          ...tags.map((t) => ({ value: t, label: t })),
        ]}
      />
      <Card>
        <InboxList save={save} messages={list} emptyText="Nothing here." />
      </Card>
    </div>
  );
}
