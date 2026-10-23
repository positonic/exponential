import { useCallback, useRef } from "react";
import { api } from "~/trpc/react";
import { parseNavLayout, type NavSection } from "~/lib/navLayout";

/**
 * The sidebar layout in effect for a workspace, and a serialised saver for it.
 *
 * Resolution order (ADR-0073): the user's layout for this workspace, then their
 * user-wide `navLayout` from the settings page, then the defaults. Saving
 * always writes the per-workspace row, so the first edit in a workspace forks
 * it from the user-wide layout.
 */
export function useWorkspaceNavLayout(workspaceId: string | null) {
  const utils = api.useUtils();

  const { data: preferences, isLoading: isPreferencesLoading } =
    api.navigationPreference.getPreferences.useQuery(undefined, { staleTime: 30 * 1000 });
  const { data: workspaceLayout, isLoading: isWorkspaceLayoutLoading } =
    api.navigationPreference.getWorkspaceLayout.useQuery(
      { workspaceId: workspaceId ?? "" },
      { enabled: !!workspaceId, staleTime: 30 * 1000 },
    );

  const isCustomised = workspaceLayout?.navLayout != null;
  // Until both queries settle the layout below is a placeholder (the defaults),
  // so an edit now would fork the workspace from the wrong base.
  const isLoading = isPreferencesLoading || (!!workspaceId && isWorkspaceLayoutLoading);
  const layout: NavSection[] = parseNavLayout(
    workspaceLayout?.navLayout ?? preferences?.navLayout ?? null,
  );

  const update = api.navigationPreference.updateWorkspaceLayout.useMutation({
    onSuccess: () => {
      if (workspaceId) {
        void utils.navigationPreference.getWorkspaceLayout.invalidate({ workspaceId });
      }
    },
  });
  const reset = api.navigationPreference.resetWorkspaceLayout.useMutation({
    onSuccess: () => {
      if (workspaceId) {
        void utils.navigationPreference.getWorkspaceLayout.invalidate({ workspaceId });
      }
    },
  });

  // Every edit sends the full snapshot, so in-flight saves must land in edit
  // order or a stale snapshot could overwrite a newer one. Chain them.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const saveLayout = useCallback(
    (next: NavSection[]) => {
      if (!workspaceId || isLoading) return;
      // Optimistic: the sidebar re-renders from the cache immediately.
      utils.navigationPreference.getWorkspaceLayout.setData(
        { workspaceId },
        { navLayout: next },
      );
      saveChain.current = saveChain.current
        .then(() => update.mutateAsync({ workspaceId, layout: next }))
        .catch(() => undefined);
    },
    [workspaceId, isLoading, update, utils],
  );

  const resetLayout = useCallback(() => {
    if (!workspaceId) return;
    reset.mutate({ workspaceId });
  }, [workspaceId, reset]);

  return {
    layout,
    isCustomised,
    isLoading,
    saveLayout,
    resetLayout,
    isSaving: update.isPending,
    saveError: update.error?.message ?? null,
  };
}
