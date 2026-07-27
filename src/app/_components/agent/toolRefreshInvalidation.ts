import type { api } from '~/trpc/react';
import { entitiesToRefresh } from '../manyChatToolRefresh';

type TrpcUtils = ReturnType<typeof api.useUtils>;

/**
 * Invalidate the React Query caches whose views an agent write just made
 * stale. `entitiesToRefresh` (the pure, unit-tested matcher — see ADR-0023)
 * decides *which* entities; this helper owns the actual `utils.*.invalidate()`
 * wiring so every chat surface (the Zoe drawer via ManyChat, the Zoe canvas)
 * refreshes the same set. Procedure-wide (no args) invalidation keeps it
 * robust against arg source/coercion drift and only refetches mounted
 * observers.
 */
export function applyToolRefreshInvalidations(
  utils: TrpcUtils,
  executedToolNames: string[],
  pageType?: string,
): void {
  const toRefresh = entitiesToRefresh(executedToolNames, pageType);

  if (toRefresh.has('goalActivity')) {
    // Goal feed + count + the goal itself (for the health badge).
    void utils.goalActivity.getFeed.invalidate();
    void utils.goalActivity.getCount.invalidate();
    void utils.goal.getById.invalidate();
  }
  if (toRefresh.has('action')) {
    // Full canonical Action set, mirroring the hand-written create/update/bulk
    // invalidation sets so create, update, move, and delete refresh every
    // surface (today list, project board, calendar, score widgets).
    void utils.action.getAll.invalidate();
    void utils.action.getToday.invalidate();
    void utils.action.getScheduledByDate.invalidate();
    void utils.action.getScheduledByDateRange.invalidate();
    void utils.action.getProjectActions.invalidate();
    void utils.scoring.getTodayScore.invalidate();
    void utils.scoring.getProductivityStats.invalidate();
  }
  if (toRefresh.has('okr')) {
    // Objective cards, hero stats, the year/period counts, and the
    // create-KR objective picker — the full set the OKR dashboard mounts,
    // so agent-created objectives/KRs and (un)links appear without reload.
    void utils.okr.getByObjective.invalidate();
    void utils.okr.getStats.invalidate();
    void utils.okr.getCountsByYear.invalidate();
    void utils.okr.getAvailableGoals.invalidate();
  }
  if (toRefresh.has('crmContact')) {
    // Contact list + the dashboard stat cards + per-contact interaction feed,
    // so agent-created/updated contacts and logged interactions appear without
    // a reload.
    void utils.crmContact.getAll.invalidate();
    void utils.crmContact.getStats.invalidate();
    void utils.crmContact.getInteractions.invalidate();
  }
}
