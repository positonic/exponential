'use client';

import { getQueryKey } from '@trpc/react-query';
import { api } from '~/trpc/react';
import { useRefetchAfterMutations } from '~/hooks/useRefetchAfterMutations';
import { isInboxAction } from '~/server/services/actions/myActionsWhere';

/**
 * The unsorted-actions count (the inbox's Actions tab) and the sidebar's
 * Today badge.
 *
 * Fetched as two counts (`action.getSidebarCounts`), not by downloading every
 * action on every page. Two things keep the badges as current as they were
 * when they were derived from the full lists:
 *
 * - When a page already has `action.getAll()` / `action.getToday()` loaded —
 *   the lists every action mutation optimistically updates or invalidates —
 *   and that list is at least as recent as the counts, the badge is computed
 *   from it, so it moves the moment the list does. The lists are only read
 *   here, never fetched.
 * - Successful mutations refetch the counts (once per burst, via
 *   `useRefetchAfterMutations`), so actions changed by anything that doesn't
 *   touch those lists (another router, a page without them) still update the
 *   badges.
 */
export function useSidebarActionCounts(): {
  inboxCount: number | undefined;
  todayCount: number | undefined;
  isError: boolean;
} {
  const counts = api.action.getSidebarCounts.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
  const allActions = api.action.getAll.useQuery(undefined, { enabled: false });
  const todayActions = api.action.getToday.useQuery(undefined, { enabled: false });

  useRefetchAfterMutations([getQueryKey(api.action.getSidebarCounts)]);

  const inboxFromList =
    allActions.data && allActions.dataUpdatedAt >= counts.dataUpdatedAt
      ? allActions.data.filter(isInboxAction).length
      : undefined;
  const todayFromList =
    todayActions.data && todayActions.dataUpdatedAt >= counts.dataUpdatedAt
      ? todayActions.data.length
      : undefined;

  return {
    inboxCount: inboxFromList ?? counts.data?.inboxCount,
    todayCount: todayFromList ?? counts.data?.todayCount,
    isError: counts.isError && inboxFromList === undefined,
  };
}
