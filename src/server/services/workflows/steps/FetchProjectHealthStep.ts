import { db } from "~/server/db";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";

export interface ProjectHealthSummary {
  id: string;
  name: string;
  healthScore: number;
  status: string;
  openActionsCount: number;
  overdueActionsCount: number;
  completedThisWeek: number;
}

/**
 * Fetches project health summaries for active projects
 */
export class FetchProjectHealthStep implements IStepExecutor {
  type = "fetch_project_health";
  label = "Fetch project health summaries";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const userId = (input.userId as string) ?? context.userId;
    const workspaceId = (input.workspaceId as string) ?? context.workspaceId;
    const healthThreshold = (config.healthThreshold as number) ?? 70;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch projects with action counts
    const projects = await db.project.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { createdById: userId },
          { team: { members: { some: { userId } } } },
          ...(workspaceId ? [{ workspaceId }] : []),
        ],
      },
      include: {
        _count: {
          select: {
            actions: true,
          },
        },
        actions: {
          where: {
            status: "ACTIVE",
          },
          select: {
            id: true,
            scheduledStart: true,
            completedAt: true,
            status: true,
          },
        },
      },
    });

    const projectHealthSummaries: ProjectHealthSummary[] = await Promise.all(
      projects.map(async (project) => {
        const openActions = project.actions.filter((a) => a.status === "ACTIVE");
        const overdueActions = openActions.filter(
          (a) => a.scheduledStart && new Date(a.scheduledStart) < today
        );

        // Count completed this week
        const completedThisWeek = await db.action.count({
          where: {
            projectId: project.id,
            status: "COMPLETED",
            completedAt: {
              gte: weekAgo,
            },
          },
        });

        // Compute health score from available data (no healthScore field in schema yet)
        const overdueRatio = openActions.length > 0
          ? overdueActions.length / openActions.length
          : 0;
        const healthScore = Math.round(100 * (1 - overdueRatio));

        return {
          id: project.id,
          name: project.name,
          healthScore,
          status: project.status,
          openActionsCount: openActions.length,
          overdueActionsCount: overdueActions.length,
          completedThisWeek,
        };
      })
    );

    // Filter to unhealthy projects if threshold specified
    const unhealthyProjects = projectHealthSummaries.filter(
      (p) => p.healthScore < healthThreshold
    );

    // Sort by health score (lowest first)
    projectHealthSummaries.sort((a, b) => a.healthScore - b.healthScore);

    return {
      projectHealthSummaries,
      unhealthyProjects,
      totalProjects: projectHealthSummaries.length,
      unhealthyCount: unhealthyProjects.length,
      healthThreshold,
    };
  }
}
