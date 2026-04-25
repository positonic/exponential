import { z } from "zod";
import { tool } from "@langchain/core/tools";

const getProjectContextSchema = z.object({
  projectId: z.string().describe("The ID of the project to get context for"),
});

export const createProjectTools = (ctx: any) => {
  // Validate authenticated context exists
  if (!ctx?.session?.user?.id) {
    throw new Error('Unauthorized: Authentication required to access project tools');
  }

  const getProjectContextTool = tool(
    async (input): Promise<string> => {
      try {
        const project = await ctx.db.project.findUnique({
          where: {
            id: input.projectId,
            createdById: ctx.session.user.id
          },
          include: {
            goals: {
              include: {
                lifeDomain: true
              }
            },
            outcomes: true,
          }
        });

        if (!project) {
          return "Project not found or access denied";
        }

        return JSON.stringify({
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            priority: project.priority,
            progress: project.progress,
          },
          goals: project.goals.map((g: any) => ({
            id: g.id,
            title: g.title,
            description: g.description,
            lifeDomain: g.lifeDomain?.title ?? 'Unknown',
            dueDate: g.dueDate?.toISOString(),
          })),
          outcomes: project.outcomes.map((o: any) => ({
            id: o.id,
            description: o.description,
            type: o.type ?? 'daily',
            dueDate: o.dueDate?.toISOString(),
            whyThisOutcome: o.whyThisOutcome,
          })),
        }, null, 2);
      } catch (error) {
        console.error('Error getting project context:', error);
        return `Failed to get project context: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "get_project_context",
      description: "Gets the full context for a project including its goals and outcomes. Use this when asked about project outcomes, goals, or objectives.",
      schema: getProjectContextSchema,
    }
  );

  return { getProjectContextTool };
};
