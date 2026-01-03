import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const projectSetupRouter = createTRPCRouter({
  /**
   * Get the most recent project created during onboarding
   */
  getOnboardingProject: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get user's onboarding status
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: {
        onboardingCompletedAt: true,
        projectSetupCompletedAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Find the most recent project created by this user
    const project = await ctx.db.project.findFirst({
      where: { createdById: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        _count: {
          select: { actions: true },
        },
      },
    });

    return {
      project,
      onboardingCompleted: !!user.onboardingCompletedAt,
      projectSetupCompleted: !!user.projectSetupCompletedAt,
    };
  }),

  /**
   * Update project name and description
   */
  updateProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, name, description } = input;
      const userId = ctx.session.user.id;

      // Verify project belongs to user
      const project = await ctx.db.project.findFirst({
        where: {
          id: projectId,
          createdById: userId,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or you don't have access",
        });
      }

      // Generate new slug if name changed
      const newSlug =
        name !== project.name
          ? name.toLowerCase().replace(/\s+/g, "-")
          : project.slug;

      const updatedProject = await ctx.db.project.update({
        where: { id: projectId },
        data: {
          name,
          description: description ?? project.description,
          slug: newSlug,
        },
        select: {
          id: true,
          name: true,
          description: true,
          slug: true,
        },
      });

      return { success: true, project: updatedProject };
    }),

  /**
   * Bulk create tasks/actions for the project
   */
  createProjectTasks: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        tasks: z.array(
          z.object({
            name: z.string().min(1).max(200),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, tasks } = input;
      const userId = ctx.session.user.id;

      // Verify project belongs to user
      const project = await ctx.db.project.findFirst({
        where: {
          id: projectId,
          createdById: userId,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or you don't have access",
        });
      }

      // Filter out empty task names
      const validTasks = tasks.filter((t) => t.name.trim().length > 0);

      if (validTasks.length === 0) {
        return { success: true, createdCount: 0 };
      }

      // Get current max kanban order for this project
      const maxOrder = await ctx.db.action.findFirst({
        where: {
          projectId,
          kanbanOrder: { not: null },
        },
        orderBy: { kanbanOrder: "desc" },
        select: { kanbanOrder: true },
      });

      const startingOrder = (maxOrder?.kanbanOrder ?? -1) + 1;

      // Create all tasks
      const createdActions = await ctx.db.$transaction(
        validTasks.map((task, index) =>
          ctx.db.action.create({
            data: {
              name: task.name.trim(),
              createdById: userId,
              projectId,
              kanbanStatus: "TODO",
              kanbanOrder: startingOrder + index,
              status: "ACTIVE",
              priority: "Quick",
            },
            select: {
              id: true,
              name: true,
            },
          })
        )
      );

      return {
        success: true,
        createdCount: createdActions.length,
        actions: createdActions,
      };
    }),

  /**
   * Complete the project setup wizard
   */
  completeSetup: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const updatedUser = await ctx.db.user.update({
      where: { id: userId },
      data: {
        projectSetupCompletedAt: new Date(),
      },
      select: {
        projectSetupCompletedAt: true,
      },
    });

    return {
      success: true,
      completedAt: updatedUser.projectSetupCompletedAt,
    };
  }),

  /**
   * Skip the project setup wizard
   */
  skipSetup: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const updatedUser = await ctx.db.user.update({
      where: { id: userId },
      data: {
        projectSetupCompletedAt: new Date(),
      },
      select: {
        projectSetupCompletedAt: true,
      },
    });

    return {
      success: true,
      skipped: true,
      completedAt: updatedUser.projectSetupCompletedAt,
    };
  }),
});
