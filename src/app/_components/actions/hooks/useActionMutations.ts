import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { notifications } from "@mantine/notifications";
import { api, type RouterInputs } from "~/trpc/react";
import {
  cancelActionQueries,
  patchActionCaches,
  restoreActionCaches,
  type ActionCacheSnapshot,
  type CachedActionRow,
} from "~/lib/actions/optimisticCache";

export type ActionUpdateInput = RouterInputs["action"]["update"];

interface ActionMutationsContext {
  viewName: string;
  projectId?: string;
}

interface UseActionMutationsResult {
  updateAction: (input: ActionUpdateInput) => void;
  isUpdating: boolean;
}

/**
 * Every cached list an action can appear in. `getProjectActions` is the one the
 * project page's Tasks tab reads — omitting it is what left that page with no
 * optimistic path. Keys are path-only, so each matches all input variants.
 */
const ACTION_LIST_KEYS = [
  getQueryKey(api.action.getAll),
  getQueryKey(api.action.getToday),
  getQueryKey(api.action.getProjectActions),
];

/**
 * Wraps `api.action.update.useMutation` with cache-routing,
 * optimistic-update, and toast behavior. Caller is responsible for
 * computing `kanbanStatus` (e.g. when toggling completion of a project
 * task).
 */
export function useActionMutations(
  context: ActionMutationsContext,
): UseActionMutationsResult {
  const utils = api.useUtils();
  const queryClient = useQueryClient();

  const mutation = api.action.update.useMutation<ActionCacheSnapshot>({
    onMutate: async (variables) => {
      await cancelActionQueries(queryClient, ACTION_LIST_KEYS);

      return patchActionCaches(queryClient, ACTION_LIST_KEYS, (a) => {
        if (a.id !== variables.id) return a;
        const next: CachedActionRow = { ...a };
        if (variables.status !== undefined) next.status = variables.status;
        if (variables.scheduledStart !== undefined)
          next.scheduledStart = variables.scheduledStart;
        if (variables.dueDate !== undefined) next.dueDate = variables.dueDate;
        if (variables.priority !== undefined) next.priority = variables.priority;
        if (variables.kanbanStatus !== undefined)
          next.kanbanStatus = variables.kanbanStatus;
        return next;
      });
    },

    onError: (_err, _vars, snapshot) => {
      if (snapshot) restoreActionCaches(queryClient, snapshot);
      notifications.show({
        title: "Update failed",
        message: "Could not update action.",
        color: "red",
      });
    },

    onSettled: (data) => {
      const projectIdFromResult = data?.projectId ?? context.projectId ?? null;

      if (context.viewName === "transcription-actions") {
        void utils.action.getByTranscription.invalidate();
      } else if (context.viewName.toLowerCase() === "today") {
        // TodayLayout reads from getAll; getToday is still used by other
        // surfaces (NextActions, MomentumWidget, TodayOverview) so refresh both.
        void utils.action.getAll.invalidate();
        void utils.action.getToday.invalidate();
      } else if (projectIdFromResult) {
        void utils.action.getProjectActions.invalidate({
          projectId: projectIdFromResult,
        });
      } else {
        void utils.action.getAll.invalidate();
      }

      void utils.scoring.getTodayScore.invalidate();
      void utils.scoring.getProductivityStats.invalidate();
    },
  });

  return {
    updateAction: (input) => mutation.mutate(input),
    isUpdating: mutation.isPending,
  };
}
