import { useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { parseNavLayout, type NavSection } from "~/lib/navLayout";

/**
 * One save chain per workspace, at module scope. Every edit sends the full
 * snapshot, so in-flight saves must land in edit order or a stale snapshot
 * could overwrite a newer one. The chain lives outside the hook because the
 * nav and the customise panel are mounted alternately: a chain held in a
 * ref would restart empty each time the panel opened or closed, letting a
 * save made just before Done race the first edit made just after.
 */
const saveChains = new Map<string, Promise<unknown>>();

function enqueue(workspaceId: string, task: () => Promise<unknown>): void {
  const prev = saveChains.get(workspaceId) ?? Promise.resolve();
  saveChains.set(workspaceId, prev.then(task).catch(() => undefined));
}

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
  // Until both queries have returned data the layout below is a placeholder
  // (the defaults), so an edit now would fork the workspace from the wrong
  // base. Checking the data rather than `isLoading` also covers a failed
  // query and the gaps between its retries.
  const isLoading =
    isPreferencesLoading ||
    preferences === undefined ||
    (!!workspaceId && (isWorkspaceLayoutLoading || workspaceLayout === undefined));
  const layout: NavSection[] = parseNavLayout(
    workspaceLayout?.navLayout ?? preferences?.navLayout ?? null,
  );

  // Success and failure both refetch: on failure that rolls the optimistic
  // cache back to what the server holds, and the toast says so, whether the
  // edit came from the panel or from a fold in the ordinary sidebar.
  const refetch = () => {
    if (workspaceId) {
      void utils.navigationPreference.getWorkspaceLayout.invalidate({ workspaceId });
    }
  };
  const onError = () => {
    refetch();
    notifications.show({
      title: "Sidebar not saved",
      message: "Your last sidebar change could not be saved and has been undone.",
      color: "red",
    });
  };
  const update = api.navigationPreference.updateWorkspaceLayout.useMutation({
    onSuccess: refetch,
    onError,
  });
  const reset = api.navigationPreference.resetWorkspaceLayout.useMutation({
    onSuccess: refetch,
    onError,
  });

  const saveLayout = useCallback(
    (next: NavSection[]) => {
      if (!workspaceId || isLoading) return;
      // Optimistic: the sidebar re-renders from the cache immediately.
      utils.navigationPreference.getWorkspaceLayout.setData(
        { workspaceId },
        { navLayout: next },
      );
      enqueue(workspaceId, () => update.mutateAsync({ workspaceId, layout: next }));
    },
    [workspaceId, isLoading, update, utils],
  );

  // Reset rides the same chain, so it cannot overtake an in-flight save and
  // then be undone by it.
  const resetLayout = useCallback(() => {
    if (!workspaceId) return;
    enqueue(workspaceId, () => reset.mutateAsync({ workspaceId }));
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
