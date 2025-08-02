import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PRIORITY_VALUES, type Priority } from "~/types/priority";

export const actionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    console.log("in getAll")
    return ctx.db.action.findMany({
      where: {
        createdById: ctx.session.user.id,
        status: {
          not: "DELETED",
        },
      },
      include: {
        project: true,
        syncs: true, // Include ActionSync records to show sync status
      },
      orderBy: {
        project: {
          priority: "asc",
        },
      },
    });
  }),

  getProjectActions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          projectId: input.projectId,
          status: {
            not: "DELETED",
          },
        },
        include: {
          project: true,
          syncs: true, // Include ActionSync records to show sync status
        },
        orderBy: [
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        projectId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(PRIORITY_VALUES).default("Quick"),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "DELETED"]).default("ACTIVE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists before creating action
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id }
      });
      
      if (!user) {
        throw new Error(`User not found: ${ctx.session.user.id}. Please ensure your account is properly set up.`);
      }
      
      return ctx.db.action.create({
        data: {
          ...input,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        projectId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(PRIORITY_VALUES).optional(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "DELETED"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      return ctx.db.action.update({
        where: { id },
        data: updateData,
      });
    }),

  getToday: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return ctx.db.action.findMany({
      where: {
        createdById: ctx.session.user.id,
        dueDate: {
          gte: today,
          lt: tomorrow,
        },
        status: "ACTIVE",
      },
      include: {
        project: true,
      },
      orderBy: {
        project: {
          priority: "desc",
        },
      },
    });
  }),

  updateActionsProject: protectedProcedure
    .input(
      z.object({
        transcriptionSessionId: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log('🔄 updateActionsProject called with:', {
        transcriptionSessionId: input.transcriptionSessionId,
        projectId: input.projectId,
        userId: ctx.session.user.id
      });

      // First, let's check what actions exist for this transcription session
      let existingActions;
      try {
        existingActions = await ctx.db.action.findMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id,
          },
          select: {
            id: true,
            name: true,
            projectId: true,
            transcriptionSessionId: true,
          },
        });

        console.log('📋 Found existing actions for this transcription:', {
          count: existingActions.length,
          actions: existingActions.map(a => ({
            id: a.id,
            name: a.name,
            currentProjectId: a.projectId,
            transcriptionSessionId: a.transcriptionSessionId
          }))
        });
      } catch (error) {
        console.error('❌ Error finding actions:', error);
        throw new Error(`Failed to find actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Update all actions associated with this transcription session
      let result;
      try {
        result = await ctx.db.action.updateMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id, // Ensure user can only update their own actions
          },
          data: {
            projectId: input.projectId,
          },
        });

        console.log('✅ Update result:', {
          count: result.count,
          message: `Updated ${result.count} action${result.count === 1 ? '' : 's'}`,
          existingActionsFound: existingActions.length
        });
      } catch (error) {
        console.error('❌ Error updating actions:', error);
        throw new Error(`Failed to update actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return {
        count: result.count,
        message: `Updated ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),

  // Debug endpoint to check action-transcription relationships
  debugTranscriptionActions: protectedProcedure
    .input(z.object({ transcriptionSessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const actions = await ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          transcriptionSessionId: true,
        },
        orderBy: {
          id: 'desc'
        }
      });

      const transcriptionSession = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: {
          id: true,
          sessionId: true,
          title: true,
        }
      });

      return {
        transcriptionSession,
        allUserActions: actions,
        actionsForThisTranscription: actions.filter(a => a.transcriptionSessionId === input.transcriptionSessionId),
        totalActions: actions.length,
      };
    }),

  // Link existing actions to a transcription session
  linkActionsToTranscription: protectedProcedure
    .input(z.object({ 
      actionIds: z.array(z.string()),
      transcriptionSessionId: z.string() 
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns the actions
        },
        data: {
          transcriptionSessionId: input.transcriptionSessionId,
        },
      });

      return {
        count: result.count,
        message: `Linked ${result.count} action${result.count === 1 ? '' : 's'} to transcription`,
      };
    }),

  // Bulk delete actions
  bulkDelete: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.deleteMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns the actions
        },
      });

      return {
        count: result.count,
        message: `Deleted ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),
}); 