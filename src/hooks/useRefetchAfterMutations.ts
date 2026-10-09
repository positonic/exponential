'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * How long after the last successful mutation the badge counts refetch. A
 * burst (bulk edit, drag-reorder, autosave) collapses into one refetch.
 */
export const REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS = 1500;

interface Registry {
  /** Registered query keys, by their JSON form, with a mount count each. */
  keys: Map<string, { queryKey: QueryKey; mounts: number }>;
  unsubscribe: () => void;
}

const registries = new WeakMap<QueryClient, Registry>();

function register(queryClient: QueryClient, queryKeys: QueryKey[]): () => void {
  let registry = registries.get(queryClient);
  if (!registry) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keys: Registry['keys'] = new Map();
    const unsubscribeCache = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const { queryKey } of keys.values()) {
          void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
        }
      }, REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS);
    });
    registry = {
      keys,
      unsubscribe: () => {
        clearTimeout(timer);
        unsubscribeCache();
      },
    };
    registries.set(queryClient, registry);
  }

  const ids = queryKeys.map((queryKey) => {
    const id = JSON.stringify(queryKey);
    const entry = registry.keys.get(id);
    if (entry) entry.mounts++;
    else registry.keys.set(id, { queryKey, mounts: 1 });
    return id;
  });

  const current = registry;
  return () => {
    for (const id of ids) {
      const entry = current.keys.get(id);
      if (!entry) continue;
      entry.mounts--;
      if (entry.mounts === 0) current.keys.delete(id);
    }
    if (current.keys.size === 0) {
      current.unsubscribe();
      registries.delete(queryClient);
    }
  };
}

/**
 * Refetches `queryKeys` once after any burst of successful mutations, for
 * counts that any router's mutation might change (the sidebar badges).
 *
 * Every caller shares one mutation-cache subscription per QueryClient, so a
 * badge mounted in several places, or several badges, cost one refetch per
 * key per burst — not one per mount per mutation. `queryKeys` is read on
 * mount only; pass stable `getQueryKey(...)` results.
 */
export function useRefetchAfterMutations(queryKeys: QueryKey[]): void {
  const queryClient = useQueryClient();
  useEffect(
    () => register(queryClient, queryKeys),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys are read on mount only
    [queryClient],
  );
}
