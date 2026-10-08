'use client';

import { useMemo } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { api } from '~/trpc/react';
import { useLocalDay } from '~/hooks/useDayRollover';
import { useRefetchAfterMutations } from '~/hooks/useRefetchAfterMutations';
import { partitionActions } from '~/lib/actions/partition';
import { isInboxAction } from '~/server/services/actions/myActionsWhere';

/**
 * The unsorted-actions count (the inbox's Actions tab) and the sidebar's
 * Today badge.
 *
 * Both count the `/today` partition's buckets (ADR-0034) on the viewer's local
 * day: the Today badge is `partitionActions(...).todays`, scheduled today or
 * unscheduled and due today — so rescheduling actions to today moves it even
 * when they have no deadline.
 *
 * Fetched as two counts (`action.getSidebarCounts`), not by downloading every
 * action on every page. Two things keep the badges as current as they were
 * when they were derived from the full lists:
 *
 * - When a page already has `action.getAll()` loaded — the list every action
 *   mutation optimistically updates or invalidates, and the one `/today`
 *   partitions — and it is at least as recent as the counts, the badges are
 *   computed from it, so they move the moment the list does. The list is only
 *   read here, never fetched.
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
  const day = useLocalDay();
  const counts = api.action.getSidebarCounts.useQuery({ day }, {
    // At midnight the key changes; keep yesterday's counts until today's land
    // rather than blanking the badges for a round trip.
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
  const allActions = api.action.getAll.useQuery(undefined, { enabled: false });

  useRefetchAfterMutations([getQueryKey(api.action.getSidebarCounts)]);

  const listIsFresh =
    !!allActions.data && allActions.dataUpdatedAt >= counts.dataUpdatedAt;
  const fromList = useMemo(() => {
    if (!listIsFresh || !allActions.data) return undefined;
    return {
      inboxCount: allActions.data.filter(isInboxAction).length,
      todayCount: partitionActions(allActions.data, { today: day.start }).todays.length,
    };
  }, [listIsFresh, allActions.data, day.start]);

  return {
    inboxCount: fromList?.inboxCount ?? counts.data?.inboxCount,
    todayCount: fromList?.todayCount ?? counts.data?.todayCount,
    isError: counts.isError && fromList === undefined,
  };
}
