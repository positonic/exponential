import { notifications } from "@mantine/notifications";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

export type ActionUpdateInput = RouterInputs["action"]["update"];

interface ActionMutationsContext {
  viewName: string;
  projectId?: string;
}

interface UseActionMutationsResult {
  updateAction: (input: ActionUpdateInput) => void;
  isUpdating: boolean;
}

type GetAllActions = RouterOutputs["action"]["getAll"];
type GetTodayActions = RouterOutputs["action"]["getToday"];
type GetProjectActions = RouterOutputs["action"]["getProjectActions"];

interface OptimisticSnapshot {
  getAll: GetAllActions | undefined;
  getToday: GetTodayActions | undefined;
  projectActions: GetProjectActions | undefined;
}

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

  const projectId = context.projectId;

  const mutation = api.action.update.useMutation({
    onMutate: async (variables) => {
      await Promise.all([
        utils.action.getAll.cancel(),
        utils.action.getToday.cancel(),
        projectId
          ? utils.action.getProjectActions.cancel({ projectId })
          : Promise.resolve(),
      ]);

      const snapshot: OptimisticSnapshot = {
        getAll: utils.action.getAll.getData(),
        getToday: utils.action.getToday.getData(),
        projectActions: projectId
          ? utils.action.getProjectActions.getData({ projectId })
          : undefined,
      };

      const apply = <T extends { id: string }>(list: T[] | undefined): T[] => {
        if (!list) return [];
        return list.map((a) => {
          if (a.id !== variables.id) return a;
          const next: Record<string, unknown> = { ...a };
          if (variables.status !== undefined) next.status = variables.status;
          if (variables.scheduledStart !== undefined)
            next.scheduledStart = variables.scheduledStart;
          if (variables.dueDate !== undefined) next.dueDate = variables.dueDate;
          if (variables.priority !== undefined)
            next.priority = variables.priority;
          if (variables.kanbanStatus !== undefined)
            next.kanbanStatus = variables.kanbanStatus;
          return next as T;
        });
      };

      utils.action.getAll.setData(undefined, apply);
      utils.action.getToday.setData(undefined, apply);
      if (projectId && snapshot.projectActions) {
        // The project tasks page renders from getProjectActions, so patch it
        // too — otherwise completing a row there waits for the server
        // roundtrip + refetch before the UI reacts. Skip when the cache is
        // unfetched: apply() would seed it with an empty list.
        utils.action.getProjectActions.setData({ projectId }, apply);
      }

      return snapshot;
    },

    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      utils.action.getAll.setData(undefined, ctx.getAll);
      utils.action.getToday.setData(undefined, ctx.getToday);
      if (projectId) {
        utils.action.getProjectActions.setData({ projectId }, ctx.projectActions);
      }
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
