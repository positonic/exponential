"use client";

import { api } from "~/trpc/react";

/**
 * Describes the favourite target. For entity favourites ("objective" /
 * "keyResult") only `entityType` + `entityId` matter — the server resolves the
 * workspace and title. For "page" favourites `entityId` is the workspace-
 * relative path and `label`/`icon`/`workspaceId` are snapshotted on the row.
 */
export interface FavoriteTarget {
  entityType: "objective" | "keyResult" | "page";
  entityId: string;
  label?: string | null;
  icon?: string | null;
  workspaceId?: string | null;
  /** Gate the underlying isFavorite query (e.g. only when a drawer is open). */
  enabled?: boolean;
}

/**
 * Reusable favourite toggle. Encapsulates the `isFavorite` read plus the
 * `toggle` mutation with an optimistic flip, rollback on error, and
 * invalidation of BOTH the per-item state and the sidebar `list`. Extracted
 * from the OKR detail drawer so any surface (page headers, drawers, rows) can
 * add a favourite control with one call.
 */
export function useFavorite(target: FavoriteTarget) {
  const utils = api.useUtils();
  // The isFavorite query/cache is keyed by (entityType, entityId) only.
  const key = { entityType: target.entityType, entityId: target.entityId };
  const enabled = (target.enabled ?? true) && key.entityId.length > 0;

  const query = api.favorite.isFavorite.useQuery(key, { enabled });
  const favorited = query.data?.favorited ?? false;

  const mutation = api.favorite.toggle.useMutation({
    // Optimistic flip; reconcile on settle.
    onMutate: async () => {
      await utils.favorite.isFavorite.cancel(key);
      const prev = utils.favorite.isFavorite.getData(key);
      utils.favorite.isFavorite.setData(key, (old) => ({
        favorited: !(old?.favorited ?? false),
      }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        utils.favorite.isFavorite.setData(key, context.prev);
      }
    },
    onSettled: () => {
      void utils.favorite.isFavorite.invalidate(key);
      // Refresh the sidebar Favourites section.
      void utils.favorite.list.invalidate();
    },
  });

  const toggle = () => {
    if (!key.entityId) return;
    mutation.mutate({
      entityType: target.entityType,
      entityId: target.entityId,
      label: target.label ?? undefined,
      icon: target.icon ?? undefined,
      workspaceId: target.workspaceId ?? undefined,
    });
  };

  return {
    favorited,
    toggle,
    isPending: mutation.isPending,
    isLoading: query.isLoading,
  };
}
