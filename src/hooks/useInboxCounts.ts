'use client';

import { getQueryKey } from '@trpc/react-query';
import { api } from '~/trpc/react';
import { useDayRollover } from '~/hooks/useDayRollover';
import { useRefetchAfterMutations } from '~/hooks/useRefetchAfterMutations';
import { NOTIFICATION_CATEGORIES } from '~/server/services/notifications/emit/constants';

/**
 * Notification categories the sidebar badge leaves out. Summaries are a
 * daily roll-up the user reads by email or push; counting them would give
 * the badge a floor it never clears. They still show, unread, on the
 * inbox's Notifications tab.
 */
export const BADGE_EXCLUDED_CATEGORIES = [NOTIFICATION_CATEGORIES.SUMMARY];

/**
 * The inbox's attention counts: unread notifications (less
 * {@link BADGE_EXCLUDED_CATEGORIES}) and "Waiting on me". Their sum is the
 * sidebar's Inbox badge — things that need you — while the unsorted-actions
 * count lives on the inbox's Actions tab.
 *
 * Counts only, never rows, since the badge renders on every page. Three
 * things keep them current:
 * - successful mutations refetch them, and mark the Waiting on me list stale
 *   (marking read, promoting a ticket, deciding, completing an action all
 *   change them), once per burst via `useRefetchAfterMutations` — the
 *   Waiting on me counts are several access-scoped counts, too heavy to run
 *   on every keystroke-level mutation;
 * - the unread count polls, because other people's mentions and
 *   assignments add to it;
 * - the day boundary rolls over at local midnight (`useDayRollover`), since
 *   the sidebar never remounts and "overdue" moves with the date.
 */
export function useInboxCounts(): {
  notifications: number | undefined;
  waiting: number | undefined;
  total: number | undefined;
  isError: boolean;
} {
  const startOfToday = useDayRollover();
  const queryOptions = {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  };
  const unread = api.notification.unreadCount.useQuery(
    { excludeCategories: BADGE_EXCLUDED_CATEGORIES },
    { ...queryOptions, refetchInterval: 90 * 1000, refetchIntervalInBackground: false },
  );
  const waiting = api.inbox.waitingOnMeCounts.useQuery(
    { startOfToday },
    queryOptions,
  );

  useRefetchAfterMutations([
    getQueryKey(api.notification.unreadCount),
    getQueryKey(api.inbox.waitingOnMeCounts),
    getQueryKey(api.inbox.waitingOnMe),
  ]);

  const notifications = unread.data;
  const waitingTotal = waiting.data?.total;
  return {
    notifications,
    waiting: waitingTotal,
    total:
      notifications === undefined && waitingTotal === undefined
        ? undefined
        : (notifications ?? 0) + (waitingTotal ?? 0),
    isError: unread.isError && waiting.isError,
  };
}
