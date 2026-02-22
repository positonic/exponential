import { db } from "~/server/db";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";
import { startOfDay } from "date-fns";

export interface BlockerItem {
  id: string;
  name: string;
  projectName: string | null;
  scheduledStart: Date | null;
  daysOverdue: number;
  priority: string;
  blockedByCount: number;
}

/**
 * Identifies blockers and overdue items that need attention
 */
export class FetchBlockersStep implements IStepExecutor {
  type = "fetch_blockers";
  label = "Identify blockers and overdue items";

  async execute(
    input: Record<string, unknown>,
    _config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const userId = (input.userId as string) ?? context.userId;
    const workspaceId = (input.workspaceId as string) ?? context.workspaceId;

    const today = startOfDay(new Date());

    // Fetch overdue actions
    const overdueActions = await db.action.findMany({
      where: {
        createdById: userId,
        status: "ACTIVE",
        scheduledStart: {
          lt: today,
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

    const blockers: BlockerItem[] = overdueActions.map((action) => {
      const scheduledDate = action.scheduledStart ? new Date(action.scheduledStart) : null;
      const daysOverdue = scheduledDate
        ? Math.floor((today.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: action.id,
        name: action.name,
        projectName: action.project?.name ?? null,
        scheduledStart: action.scheduledStart,
        daysOverdue,
        priority: action.priority,
        blockedByCount: action.blockedByIds.length,
      };
    });

    // Find high-priority blockers (HIGH priority or blocking others)
    const criticalBlockers = blockers.filter(
      (b) => b.priority === "HIGH" || b.blockedByCount > 0 || b.daysOverdue > 3
    );

    // Calculate total overdue time
    const totalOverdueDays = blockers.reduce((sum, b) => sum + b.daysOverdue, 0);

    return {
      blockers,
      criticalBlockers,
      overdueCount: blockers.length,
      criticalCount: criticalBlockers.length,
      totalOverdueDays,
    };
  }
}
