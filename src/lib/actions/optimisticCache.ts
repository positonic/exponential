import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Optimistic patching across *every* cached list of actions.
 *
 * The UI reads actions from more than one procedure: `action.getAll` backs the
 * standalone lists, `action.getToday` backs the Today widgets, and
 * `action.getProjectActions` backs the project page's Tasks tab. Patching only
 * `getAll` — which is what every mutation here used to do — leaves the project
 * page with no optimistic path at all, so a reschedule there sits still until
 * the mutation *and* the follow-up refetch both land. That is the ~3s stall.
 *
 * These helpers work off the raw query cache rather than `utils.<proc>.setData`
 * so a single call covers every input variant of a procedure (each project id,
 * each assignee filter) without the caller having to know which ones exist.
 * They also only touch entries that are already cached, so — unlike a bare
 * `setData(undefined, …)` — they never fabricate an empty list for a query the
 * user has not opened yet.
 */

/** Cached entries captured before a patch, for rollback on error. */
export type ActionCacheSnapshot = Array<[QueryKey, unknown]>;

/** The shape we need to match a cached row against a mutation's target. */
export type CachedActionRow = Record<string, unknown> & { id: string };

export async function cancelActionQueries(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => queryClient.cancelQueries({ queryKey })),
  );
}

/**
 * Run `patch` over every action in every cached list under `keys`, returning a
 * snapshot for `restoreActionCaches`. `patch` should return the row unchanged
 * for rows it does not target.
 */
export function patchActionCaches(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
  patch: (action: CachedActionRow) => CachedActionRow,
): ActionCacheSnapshot {
  const snapshot: ActionCacheSnapshot = [];

  for (const queryKey of keys) {
    for (const [cachedKey, data] of queryClient.getQueriesData({ queryKey })) {
      if (!Array.isArray(data)) continue;
      snapshot.push([cachedKey, data]);
      queryClient.setQueryData(
        cachedKey,
        (data as CachedActionRow[]).map(patch),
      );
    }
  }

  return snapshot;
}

export function restoreActionCaches(
  queryClient: QueryClient,
  snapshot: ActionCacheSnapshot,
): void {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}
