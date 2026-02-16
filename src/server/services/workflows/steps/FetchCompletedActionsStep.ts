import { db } from "~/server/db";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";
import { startOfDay, subDays } from "date-fns";

export interface CompletedAction {
  id: string;
  name: string;
  projectName: string | null;
  completedAt: Date;
  duration: number | null;
}

/**
 * Fetches completed actions for a user within a specified lookback period
 */
export class FetchCompletedActionsStep implements IStepExecutor {
  type = "fetch_completed_actions";
  label = "Fetch completed actions";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const lookbackDays = (config.lookbackDays as number) ?? 1;
    const userId = (input.userId as string) ?? context.userId;
    const workspaceId = (input.workspaceId as string) ?? context.workspaceId;

    const since = startOfDay(subDays(new Date(), lookbackDays));

    const actions = await db.action.findMany({
      where: {
        createdById: userId,
        status: "COMPLETED",
        completedAt: {
          gte: since,
        },
        ...(workspaceId && {
          project: {
            workspaceId,
          },
        }),
      },
      include: {
        project: {
          select: { name: true },
        },
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    const completedActions: CompletedAction[] = actions.map((a) => ({
      id: a.id,
      name: a.name,
      projectName: a.project?.name ?? null,
      completedAt: a.completedAt!,
      duration: a.duration,
    }));

    return {
      completedActions,
      completedCount: completedActions.length,
      lookbackDays,
      since: since.toISOString(),
    };
  }
}
