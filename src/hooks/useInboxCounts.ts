'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { api } from '~/trpc/react';
import { useStartOfToday } from '~/hooks/useStartOfToday';

/**
 * The inbox's attention counts: unread notifications and "Waiting on me".
 * Their sum is the sidebar's Inbox badge — things that need you — while the
 * unsorted-actions count lives on the inbox's Actions tab.
 *
 * Counts only, never rows, since the badge renders on every page. Any
 * successful mutation refetches them (marking read, promoting a ticket,
 * deciding, completing an action all change them), mirroring
 * `useSidebarActionCounts`.
 */
export function useInboxCounts(): {
  notifications: number | undefined;
  waiting: number | undefined;
  total: number | undefined;
  isError: boolean;
} {
  const queryClient = useQueryClient();
  const startOfToday = useStartOfToday();
  const queryOptions = {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  };
  const unread = api.notification.unreadCount.useQuery(undefined, queryOptions);
  const waiting = api.inbox.waitingOnMeCounts.useQuery(
    { startOfToday },
    queryOptions,
  );

  useEffect(() => {
    const keys = [
      getQueryKey(api.notification.unreadCount),
      getQueryKey(api.inbox.waitingOnMeCounts),
    ];
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        // Several badges mount this hook; don't let them cancel each other's refetch.
        for (const queryKey of keys) {
          void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
        }
      }
    });
  }, [queryClient]);

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
