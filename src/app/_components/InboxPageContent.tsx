"use client";

import { Badge, Tabs, Text, Title } from "@mantine/core";
import { IconBell, IconHourglass, IconListCheck } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DocsHelpLink } from "~/app/_components/docs/DocsHelpLink";
import { NotificationsTab } from "~/app/_components/inbox/NotificationsTab";
import { WaitingOnMeTab } from "~/app/_components/inbox/WaitingOnMeTab";
import { useInboxCounts } from "~/hooks/useInboxCounts";
import { api } from "~/trpc/react";
import { useSidebarActionCounts } from "~/hooks/useSidebarActionCounts";
import { Actions } from "./Actions";
// The wsa-card / wsa-item row styles, shared with the home page's
// "Needs your attention" card.
import "~/app/_components/home/activity/activity-home.css";

const TABS = ["notifications", "waiting", "actions"] as const;
type InboxTab = (typeof TABS)[number];

function parseTab(value: string | null): InboxTab {
  return TABS.find((tab) => tab === value) ?? "notifications";
}

const SUBTITLES: Record<InboxTab, string> = {
  notifications: "Assignments, mentions, due dates and meeting updates",
  waiting: "Decisions, reviews, QA tickets and overdue actions that need you",
  actions: "Actions without a date or project assigned",
};

function TabCount({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <Badge size="xs" variant="light" circle={count < 10}>
      {count}
    </Badge>
  );
}

/**
 * `/inbox` — one place to clear what needs you, across every workspace.
 * Three tabs, each cleared its own way: Notifications (read them), Waiting on
 * me (act on them), Actions (give them a date or project). The tab lives in
 * `?tab=`; Notifications is the default. The "My activity" history is
 * deliberately not here — it never clears — it's the "Mine" filter on
 * `/activity`.
 *
 * The `activity-layout` wrapper supplies the `--activity-*` chip tokens the
 * shared row styles use.
 */
export function InboxPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const { waiting } = useInboxCounts();
  // Every unread notification, summaries included — the tab counts what its
  // Unread list shows; only the sidebar badge leaves summaries out.
  const { data: notifications } = api.notification.unreadCount.useQuery();
  const { inboxCount } = useSidebarActionCounts();

  function setTab(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    const value = parseTab(next);
    if (value === "notifications") params.delete("tab");
    else params.set("tab", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="activity-layout w-full">
      {/* Page Header */}
      <div className="mb-4 w-full">
        <div className="flex items-center gap-2">
          <Title order={2} size="h3" className="text-text-primary">
            Inbox
          </Title>
          <DocsHelpLink pathname="/inbox" />
        </div>
        <Text size="sm" c="dimmed" mt={4}>
          {SUBTITLES[tab]}
        </Text>
      </div>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab
            value="notifications"
            leftSection={<IconBell size={16} />}
            rightSection={<TabCount count={notifications} />}
          >
            Notifications
          </Tabs.Tab>
          <Tabs.Tab
            value="waiting"
            leftSection={<IconHourglass size={16} />}
            rightSection={<TabCount count={waiting} />}
          >
            Waiting on me
          </Tabs.Tab>
          <Tabs.Tab
            value="actions"
            leftSection={<IconListCheck size={16} />}
            rightSection={<TabCount count={inboxCount} />}
          >
            Actions
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="notifications">
          <NotificationsTab />
        </Tabs.Panel>
        <Tabs.Panel value="waiting">
          <WaitingOnMeTab />
        </Tabs.Panel>
        <Tabs.Panel value="actions">
          <Actions viewName="inbox" />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
