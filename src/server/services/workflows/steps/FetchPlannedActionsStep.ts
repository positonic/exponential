import { db } from "~/server/db";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";
import { startOfDay, endOfDay } from "date-fns";

export interface PlannedAction {
  id: string;
  name: string;
  projectName: string | null;
  scheduledStart: Date | null;
  duration: number | null;
  priority: string;
}

/**
 * Fetches actions planned for today (or a specific date)
 */
export class FetchPlannedActionsStep implements IStepExecutor {
  type = "fetch_planned_actions";
  label = "Fetch planned actions";

  async execute(
    input: Record<string, unknown>,
    _config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const userId = (input.userId as string) ?? context.userId;
    const workspaceId = (input.workspaceId as string) ?? context.workspaceId;
    const targetDate = input.targetDate ? new Date(input.targetDate as string) : new Date();

    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    const actions = await db.action.findMany({
      where: {
        createdById: userId,
        status: "ACTIVE",
        scheduledStart: {
          gte: dayStart,
          lte: dayEnd,
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
      orderBy: [
        { priority: "desc" },
        { scheduledStart: "asc" },
      ],
    });

    const plannedActions: PlannedAction[] = actions.map((a) => ({
      id: a.id,
      name: a.name,
      projectName: a.project?.name ?? null,
      scheduledStart: a.scheduledStart,
      duration: a.duration,
      priority: a.priority,
    }));

    // Calculate total planned time
    const totalPlannedMinutes = plannedActions.reduce(
      (sum, a) => sum + (a.duration ?? 30),
      0
    );

    return {
      plannedActions,
      plannedCount: plannedActions.length,
      totalPlannedMinutes,
      targetDate: targetDate.toISOString(),
    };
  }
}
