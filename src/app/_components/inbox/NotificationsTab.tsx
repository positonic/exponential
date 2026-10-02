'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ActionIcon,
  Button,
  SegmentedControl,
  Select,
  Skeleton,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAt,
  IconBell,
  IconCalendarEvent,
  IconCheck,
  IconClockExclamation,
  IconListDetails,
  IconMicrophone,
  IconNews,
  IconUserCheck,
  type Icon,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '~/server/services/notifications/emit/constants';
import { compactAge } from '~/app/_components/product/overview/overviewShared';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { toPlainText } from '~/lib/content/plainText';

const PAGE_SIZE = 20;

/** How each notification category reads in the inbox. */
const CATEGORY_DISPLAY: Record<NotificationCategory, { label: string; icon: Icon }> = {
  [NOTIFICATION_CATEGORIES.ASSIGNMENT]: { label: 'Assignments', icon: IconUserCheck },
  [NOTIFICATION_CATEGORIES.MENTION]: { label: 'Mentions', icon: IconAt },
  [NOTIFICATION_CATEGORIES.DUE_DATE]: { label: 'Due dates', icon: IconClockExclamation },
  [NOTIFICATION_CATEGORIES.MEETING_READY]: { label: 'Meetings', icon: IconMicrophone },
  [NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED]: {
    label: 'Added to meetings',
    icon: IconCalendarEvent,
  },
  [NOTIFICATION_CATEGORIES.AGENDA_READY]: { label: 'Agendas', icon: IconListDetails },
  [NOTIFICATION_CATEGORIES.SUMMARY]: { label: 'Summaries', icon: IconNews },
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...Object.entries(CATEGORY_DISPLAY).map(([value, { label }]) => ({ value, label })),
];

function isCategory(value: string): value is NotificationCategory {
  return value in CATEGORY_DISPLAY;
}

/**
 * The inbox's Notifications tab: every in-app Notification for the user
 * (ADR-0045), newest first, across all categories. Unread by default —
 * marking an item read (its tick, or "Mark all read") clears it from the
 * list, so the tab works down to zero; "All" shows the read history too.
 * Opening an item never marks it read: a row with a deeplink navigates to
 * what it refers to, and one without (a summary) expands its full body in
 * place. Notifications are personal and cross-workspace, like the inbox.
 */
export function NotificationsTab() {
  const utils = api.useUtils();
  const [show, setShow] = useState<'unread' | 'all'>('unread');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const categoryFilter = category === 'all' ? undefined : category;

  const list = api.notification.list.useInfiniteQuery(
    { category: categoryFilter, unreadOnly: show === 'unread', limit: PAGE_SIZE },
    { getNextPageParam: (page) => page.nextCursor },
  );

  const invalidate = () => {
    void utils.notification.list.invalidate();
    void utils.notification.unreadCount.invalidate();
  };
  const markRead = api.notification.markRead.useMutation({ onSuccess: invalidate });
  const markAllRead = api.notification.markAllRead.useMutation({ onSuccess: invalidate });

  // From the server, not the loaded pages: in "All" an unread row may sit
  // beyond the first page.
  const { data: unreadInView } = api.notification.unreadCount.useQuery(
    categoryFilter ? { category: categoryFilter } : undefined,
  );
  const hasUnread = (unreadInView ?? 0) > 0;

  const notifications = list.data?.pages.flatMap((page) => page.notifications) ?? [];

  return (
    <section className="wsa-card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedControl
          size="xs"
          value={show}
          onChange={(value) => setShow(value === 'all' ? 'all' : 'unread')}
          data={[
            { value: 'unread', label: 'Unread' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Select
          size="xs"
          aria-label="Notification type"
          value={category}
          onChange={(value) => setCategory(value && isCategory(value) ? value : 'all')}
          data={CATEGORY_OPTIONS}
          allowDeselect={false}
          w={180}
        />
        <Button
          size="xs"
          variant="subtle"
          className="ml-auto"
          leftSection={<IconCheck size={14} />}
          disabled={!hasUnread}
          loading={markAllRead.isPending}
          onClick={() => markAllRead.mutate({ category: categoryFilter })}
        >
          Mark all read
        </Button>
      </div>

      {list.isLoading ? (
        [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} mb={4} radius="sm" />)
      ) : notifications.length === 0 ? (
        <p className="wsa-feed__empty">
          {show === 'unread'
            ? "You're all caught up — no unread notifications."
            : 'No notifications yet.'}
        </p>
      ) : (
        <>
          {notifications.map((notification) => {
            const display = isCategory(notification.category)
              ? CATEGORY_DISPLAY[notification.category]
              : { label: notification.category, icon: IconBell };
            const CategoryIcon = display.icon;
            const isUnread = notification.readAt === null;
            // Messages may be Markdown excerpts; the row is one line, so text only.
            const preview = toPlainText(notification.message);
            const isExpanded = expandedId === notification.id;
            const body = notification.markdown ?? notification.message;
            const row = (
              <>
                <span className="wsa-item__icon" title={display.label}>
                  <CategoryIcon size={14} stroke={1.75} />
                </span>
                <span
                  className={
                    isUnread ? 'wsa-item__label wsa-item__label--unread' : 'wsa-item__label'
                  }
                >
                  {notification.title}
                  {preview && <span className="wsa-item__sub">{preview}</span>}
                </span>
                <span className="wsa-item__meta">
                  {isUnread && <span className="wsa-item__dot" aria-label="Unread" />}
                  {compactAge(notification.createdAt)}
                </span>
              </>
            );
            return (
              <div key={notification.id}>
                <div className="flex items-center gap-1">
                  {notification.deeplink ? (
                    <UnstyledButton
                      component={Link}
                      href={notification.deeplink}
                      className="wsa-item min-w-0 flex-1"
                    >
                      {row}
                    </UnstyledButton>
                  ) : (
                    <UnstyledButton
                      className="wsa-item min-w-0 flex-1"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : notification.id)}
                    >
                      {row}
                    </UnstyledButton>
                  )}
                  {/* Always rendered so read and unread rows line up. */}
                  <Tooltip label="Mark read" disabled={!isUnread}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label="Mark read"
                      className={isUnread ? undefined : 'invisible'}
                      onClick={() => markRead.mutate({ notificationId: notification.id })}
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                  </Tooltip>
                </div>
                {isExpanded && body && (
                  <div className="mb-2 ml-8 mr-8 rounded-md border border-border-primary bg-surface-secondary px-3 py-2 text-sm">
                    <MarkdownRenderer content={body} variant="compact" />
                  </div>
                )}
              </div>
            );
          })}
          {list.hasNextPage && (
            <div className="wsa-feed__footer">
              <Button
                variant="default"
                size="sm"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
