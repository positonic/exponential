import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
//import { getSetups } from "~/server/services/videoService";
import { uploadToBlob } from "~/lib/blob";
import { FirefliesSyncService } from "~/server/services/FirefliesSyncService";
import { TranscriptionProcessingService } from "~/server/services/TranscriptionProcessingService";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";

// Keep in-memory store for development/debugging
const transcriptionStore: Record<string, string[]> = {};

export const transcriptionRouter = createTRPCRouter({
  startSession: apiKeyMiddleware
    .input(z.object({
      projectId: z.string().nullable(),
      workspaceId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Type-safe userId access
      const userId = ctx.userId;
      const { projectId, workspaceId } = input;

      // Create record in database using ctx.db
      const session = await ctx.db.transcriptionSession.create({
        data: {
          sessionId: `session_${Date.now()}`,
          transcription: "",
          userId,
          projectId, // Save projectId
          workspaceId: workspaceId ?? null,
        },
      });

      // Keep in-memory store for debugging
      transcriptionStore[session.id] = [];

      return {
        id: session.id,
        startTime: new Date().toISOString(),
        projectId: session.projectId,
      };
    }),

  saveTranscription: apiKeyMiddleware
    .input(
      z.object({
        id: z.string(),
        transcription: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // First, get the current transcription session
      const existingSession = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });

      if (!existingSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription session not found",
        });
      }

      // Verify the session belongs to the authenticated user
      if (existingSession.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this transcription session",
        });
      }

      // Check if existing transcription has content and append if so
      const updatedTranscription =
        existingSession.transcription && existingSession.transcription !== ""
          ? `${existingSession.transcription} ${input.transcription}`
          : input.transcription;

      // Update with the combined transcription
      await ctx.db.transcriptionSession.update({
        where: { id: input.id },
        data: {
          transcription: updatedTranscription,
        },
      });
      return {
        success: true,
        id: input.id,
        savedAt: new Date().toISOString(),
      };
    }),

  getSessions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.transcriptionSession.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        setupId: true,
        createdAt: true,
        updatedAt: true,
        transcription: true,
        title: true,
      },
    });
  }),

  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
        include: {
          screenshots: {
            orderBy: {
              createdAt: "desc",
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          sourceIntegration: {
            select: {
              id: true,
              provider: true,
              name: true,
            },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Allow access if user is the owner OR a member of the recording's workspace
      let hasAccess = session.userId === ctx.session.user.id;
      if (!hasAccess && session.workspaceId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId: session.workspaceId,
            },
          },
        });
        hasAccess = !!membership;
      }

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this session",
        });
      }

      return session;
    }),

  updateTranscription: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        transcription: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      // Allow access if user is the owner OR a member of the recording's workspace
      let hasAccess = existing.userId === ctx.session.user.id;
      if (!hasAccess && existing.workspaceId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId: existing.workspaceId,
            },
          },
        });
        hasAccess = !!membership;
      }
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this transcription",
        });
      }

      const session = await ctx.db.transcriptionSession.update({
        where: { id: input.id },
        data: {
          transcription: input.transcription,
          updatedAt: new Date(),
        },
      });
      return session;
    }),

  updateDetails: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        description: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        transcription: z.string().optional(),
        workspaceId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the transcription belongs to the user
      const existing = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      // Allow access if user is the owner OR a member of the recording's workspace
      let hasAccess = existing.userId === ctx.session.user.id;
      if (!hasAccess && existing.workspaceId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId: existing.workspaceId,
            },
          },
        });
        hasAccess = !!membership;
      }
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this transcription",
        });
      }

      const updateData: {
        description?: string;
        notes?: string;
        summary?: string;
        transcription?: string;
        workspaceId?: string | null;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (input.description !== undefined) {
        updateData.description = input.description;
      }
      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }
      if (input.summary !== undefined) {
        updateData.summary = input.summary;
      }
      if (input.transcription !== undefined) {
        updateData.transcription = input.transcription;
      }
      if (input.workspaceId !== undefined) {
        if (input.workspaceId !== null) {
          const member = await ctx.db.workspaceUser.findUnique({
            where: {
              userId_workspaceId: {
                userId: ctx.session.user.id,
                workspaceId: input.workspaceId,
              },
            },
          });
          if (!member) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You are not a member of this workspace",
            });
          }
        }
        updateData.workspaceId = input.workspaceId;
      }

      const session = await ctx.db.transcriptionSession.update({
        where: { id: input.id },
        data: updateData,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              taskManagementTool: true,
              taskManagementConfig: true,
            },
          },
          screenshots: true,
          sourceIntegration: {
            select: {
              id: true,
              provider: true,
              name: true,
            },
          },
          actions: {
            where: { status: { not: "DRAFT" } },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      });
      return session;
    }),

  updateTitle: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure the session belongs to the user
      const session = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }
      // Allow access if user is the owner OR a member of the recording's workspace
      let hasAccess = session.userId === ctx.session.user.id;
      if (!hasAccess && session.workspaceId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId: session.workspaceId,
            },
          },
        });
        hasAccess = !!membership;
      }
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this session",
        });
      }
      // Update the title
      const updated = await ctx.db.transcriptionSession.update({
        where: { id: input.id },
        data: { title: input.title, updatedAt: new Date() },
      });
      return updated;
    }),

  createManualTranscription: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
        transcription: z.string().min(1, "Transcription text is required"),
        meetingDate: z.date().optional(),
        notes: z.string().optional(),
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.transcriptionSession.create({
        data: {
          sessionId: `manual_${Date.now()}`,
          title: input.title,
          description: input.description ?? null,
          transcription: input.transcription,
          meetingDate: input.meetingDate ?? null,
          notes: input.notes ?? null,
          projectId: input.projectId ?? null,
          workspaceId: input.workspaceId ?? null,
          userId: ctx.session.user.id,
        },
        include: {
          sourceIntegration: {
            select: {
              id: true,
              provider: true,
              name: true,
            },
          },
          actions: {
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      });

      return session;
    }),

  // Get transcriptions for a specific project (used by ManyChat agent context)
  getProjectTranscriptions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.transcriptionSession.findMany({
        where: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
          archivedAt: null,
        },
        orderBy: { processedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          summary: true,
          processedAt: true,
          meetingDate: true,
          actions: {
            where: { status: { not: "DRAFT" } },
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      });
    }),

  getAllTranscriptions: protectedProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().optional().default(false),
          workspaceId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        userId: ctx.session.user.id,
      };

      // Exclude archived by default unless explicitly requested
      if (!input?.includeArchived) {
        whereClause.archivedAt = null;
      }

      // Filter by workspace if provided - include meetings with direct workspaceId
      // OR meetings whose project belongs to the workspace
      if (input?.workspaceId) {
        whereClause.OR = [
          { workspaceId: input.workspaceId },
          { project: { workspaceId: input.workspaceId } },
        ];
      }

      return ctx.db.transcriptionSession.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              taskManagementTool: true,
              taskManagementConfig: true,
            },
          },
          screenshots: true,
          sourceIntegration: {
            select: {
              id: true,
              provider: true,
              name: true,
            },
          },
          actions: {
            where: { status: { not: "DRAFT" } },
            select: {
              id: true,
              name: true,
              status: true,
              priority: true,
            },
          },
        },
      });
    }),

  assignProject: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the project's workspace if a project is being assigned
      let workspaceId: string | null = null;
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { workspaceId: true },
        });
        workspaceId = project?.workspaceId ?? null;
      }

      // Update the transcription session
      const session = await ctx.db.transcriptionSession.update({
        where: {
          id: input.transcriptionId,
        },
        data: {
          projectId: input.projectId,
          workspaceId,
          updatedAt: new Date(),
        },
      });

      // Also update all associated actions to the same project
      await ctx.db.action.updateMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
        },
        data: {
          projectId: input.projectId,
        },
      });

      return session;
    }),

  bulkAssignProject: protectedProcedure
    .input(
      z.object({
        transcriptionIds: z.array(z.string()),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the project's workspace if a project is being assigned
      let workspaceId: string | null = null;
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { workspaceId: true },
        });
        workspaceId = project?.workspaceId ?? null;
      }

      // Update all transcription sessions
      const result = await ctx.db.transcriptionSession.updateMany({
        where: {
          id: {
            in: input.transcriptionIds,
          },
          userId: ctx.session.user.id, // Ensure user only updates their own transcriptions
        },
        data: {
          projectId: input.projectId,
          workspaceId,
          updatedAt: new Date(),
        },
      });

      // Also update all associated actions to the same project
      await ctx.db.action.updateMany({
        where: {
          transcriptionSessionId: {
            in: input.transcriptionIds,
          },
        },
        data: {
          projectId: input.projectId,
        },
      });

      return { count: result.count };
    }),

  // Add to your transcriptionRouter
  saveScreenshot: apiKeyMiddleware
    .input(
      z.object({
        sessionId: z.string(),
        screenshot: z.string(),
        timestamp: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Generate unique filename
        const filename = `screenshots/${input.sessionId}/${input.timestamp.replace(/[/:]/g, "-")}.png`;

        // Upload to Vercel Blob
        const blob = await uploadToBlob(input.screenshot, filename);

        // Save metadata in database
        await ctx.db.screenshot.create({
          data: {
            url: blob.url,
            timestamp: input.timestamp,
            transcriptionSessionId: input.sessionId,
          },
        });

        return { success: true, url: blob.url };
      } catch (error) {
        console.error("Error saving screenshot:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save screenshot",
        });
      }
    }),

  // Fireflies bulk sync endpoints
  getFirefliesIntegrations: protectedProcedure.query(async ({ ctx }) => {
    return FirefliesSyncService.getUserFirefliesIntegrations(
      ctx.session.user.id,
    );
  }),

  // Fireflies bulk sync endpoints for project
  getFirefliesProjectIntegrations: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.projectId) {
        // Get Fireflies integrations associated with this project through workflows
        const projectWorkflows = await ctx.db.workflow.findMany({
          where: {
            projectId: input.projectId,
            provider: "fireflies",
            status: "ACTIVE",
          },
          include: {
            integration: {
              include: {
                credentials: {
                  where: {
                    keyType: {
                      in: ["API_KEY", "EMAIL"],
                    },
                  },
                },
              },
            },
          },
        });

        // Map workflows to integration format expected by the UI
        return projectWorkflows
          .filter(
            (workflow) =>
              workflow.integration &&
              workflow.integration.credentials.length > 0,
          )
          .map((workflow) => ({
            id: workflow.integration.id,
            name: workflow.integration.name,
            provider: workflow.integration.provider,
            status: workflow.integration.status,
            credentials: workflow.integration.credentials,
          }));
      } else {
        // Fallback to all user integrations for backend compatibility
        return FirefliesSyncService.getUserFirefliesIntegrations(
          ctx.session.user.id,
        );
      }
    }),

  getFirefliesSyncStatus: protectedProcedure
    .input(z.object({ integrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const integration = await FirefliesSyncService.getFirefliesIntegration(
        ctx.session.user.id,
        input.integrationId,
      );

      if (!integration) {
        return {
          integrationName: null,
          lastSyncAt: null,
          estimatedNewCount: 0,
          isAvailable: false,
        };
      }

      const estimatedNewCount =
        await FirefliesSyncService.estimateNewTranscripts(
          ctx.session.user.id,
          input.integrationId,
        );

      return {
        integrationName: integration.name,
        lastSyncAt: integration.lastSyncAt,
        estimatedNewCount,
        isAvailable: true,
      };
    }),

  bulkSyncFromFireflies: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        syncSinceDays: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await FirefliesSyncService.bulkSyncFromFireflies(
        ctx.session.user.id,
        input.integrationId,
        input.syncSinceDays,
      );

      // Log the manual sync event
      await ctx.db.webhookLog.create({
        data: {
          provider: "fireflies",
          eventType: "manual_sync",
          status: result.success ? "success" : "failed",
          errorMessage: result.error,
          userId: ctx.session.user.id,
          metadata: {
            integrationId: input.integrationId,
            syncSinceDays: input.syncSinceDays,
            newTranscripts: result.newTranscripts,
            updatedTranscripts: result.updatedTranscripts,
            skippedTranscripts: result.skippedTranscripts,
          },
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to sync from Fireflies",
        });
      }

      return result;
    }),

  // Sync Fireflies transcriptions and automatically associate them with a project
  syncFirefliesForProject: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        projectId: z.string(),
        syncSinceDays: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // First, sync from Fireflies
      const syncResult = await FirefliesSyncService.bulkSyncFromFireflies(
        ctx.session.user.id,
        input.integrationId,
        input.syncSinceDays,
      );

      if (!syncResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: syncResult.error || "Failed to sync from Fireflies",
        });
      }

      // If new transcripts were created, find the recently synced ones and associate them with the project
      let projectAssociations = 0;
      if (syncResult.newTranscripts > 0) {
        // Get recent transcriptions that don't have a project assigned yet from this integration
        const recentUnassignedTranscriptions =
          await ctx.db.transcriptionSession.findMany({
            where: {
              userId: ctx.session.user.id,
              sourceIntegrationId: input.integrationId,
              projectId: null,
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            take: syncResult.newTranscripts, // Limit to the number of new transcripts we just synced
          });

        // Associate each unassigned transcription with the project
        for (const transcription of recentUnassignedTranscriptions) {
          const result =
            await TranscriptionProcessingService.associateWithProject(
              transcription.id,
              input.projectId,
              ctx.session.user.id,
              true, // autoProcess = true
            );

          if (result.success) {
            projectAssociations++;
          }
        }
      }

      return {
        ...syncResult,
        projectAssociations,
      };
    }),

  deleteTranscription: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the transcription belongs to the user
      const transcription = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });

      if (!transcription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      if (transcription.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this transcription",
        });
      }

      // Delete the transcription (actions will be deleted due to onDelete: SetNull)
      await ctx.db.transcriptionSession.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  bulkDeleteTranscriptions: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Delete only transcriptions that belong to the current user
      const result = await ctx.db.transcriptionSession.deleteMany({
        where: {
          id: { in: input.ids },
          userId: ctx.session.user.id, // Ensure user only deletes their own transcriptions
        },
      });

      return { count: result.count };
    }),

  associateWithProject: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        projectId: z.string(),
        autoProcess: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.associateWithProject(
        input.transcriptionId,
        input.projectId,
        ctx.session.user.id,
        input.autoProcess,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            result.error || "Failed to associate transcription with project",
        });
      }

      return result;
    }),

  processTranscription: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.processTranscription(
        input.transcriptionId,
        ctx.session.user.id,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            result.errors.join(", ") || "Failed to process transcription",
        });
      }

      return result;
    }),

  generateDraftActions: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.generateDraftActions(
        input.transcriptionId,
        ctx.session.user.id,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            result.errors.join(", ") || "Failed to generate draft actions",
        });
      }

      return result;
    }),

  publishDraftActions: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const transcription = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionId },
      });

      if (!transcription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      if (transcription.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this transcription",
        });
      }

      const draftActions = await ctx.db.action.findMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: "DRAFT",
          createdById: ctx.session.user.id,
        },
        select: { id: true },
      });

      if (draftActions.length === 0) {
        return { publishedCount: 0 };
      }

      const result = await ctx.db.action.updateMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: "DRAFT",
          createdById: ctx.session.user.id,
        },
        data: {
          status: "ACTIVE",
        },
      });

      await ctx.db.transcriptionSession.update({
        where: { id: input.transcriptionId },
        data: {
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { publishedCount: result.count };
    }),

  publishSelectedDraftActions: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        actionIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const transcription = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionId },
      });

      if (!transcription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      if (transcription.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this transcription",
        });
      }

      if (input.actionIds.length === 0) {
        return { publishedCount: 0 };
      }

      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          transcriptionSessionId: input.transcriptionId,
          status: "DRAFT",
          createdById: ctx.session.user.id,
        },
        data: {
          status: "ACTIVE",
        },
      });

      // Check if any drafts remain; if not, mark transcription as processed
      const remainingDrafts = await ctx.db.action.count({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: "DRAFT",
          createdById: ctx.session.user.id,
        },
      });

      if (remainingDrafts === 0) {
        await ctx.db.transcriptionSession.update({
          where: { id: input.transcriptionId },
          data: {
            processedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      return { publishedCount: result.count };
    }),

  sendSlackNotification: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.sendSlackNotification(
        input.transcriptionId,
        ctx.session.user.id,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error || "Failed to send Slack notification",
        });
      }

      return result;
    }),
  sendSlackSummary: protectedProcedure
    .input(z.object({ 
      transcriptionId: z.string(),
      channel: z.string(),
      includeSummary: z.boolean().default(true),
      includeActions: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.sendSlackSummary(
        input.transcriptionId,
        ctx.session.user.id,
        {
          channel: input.channel,
          includeSummary: input.includeSummary,
          includeActions: input.includeActions,
        }
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error || "Failed to send Slack summary",
        });
      }

      return result;
    }),

  archiveTranscription: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the transcription belongs to the user
      const transcription = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });

      if (!transcription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      if (transcription.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to archive this transcription",
        });
      }

      // Archive the transcription
      await ctx.db.transcriptionSession.update({
        where: { id: input.id },
        data: {
          archivedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { success: true };
    }),

  unarchiveTranscription: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the transcription belongs to the user
      const transcription = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });

      if (!transcription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      if (transcription.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to unarchive this transcription",
        });
      }

      // Unarchive the transcription
      await ctx.db.transcriptionSession.update({
        where: { id: input.id },
        data: {
          archivedAt: null,
          updatedAt: new Date(),
        },
      });

      return { success: true };
    }),

  bulkArchiveTranscriptions: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Archive only transcriptions that belong to the current user
      const result = await ctx.db.transcriptionSession.updateMany({
        where: {
          id: { in: input.ids },
          userId: ctx.session.user.id, // Ensure user only archives their own transcriptions
        },
        data: {
          archivedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { count: result.count };
    }),

  toggleActionGeneration: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get the transcription with its actions
      const transcription = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionId },
        include: {
          actions: { select: { id: true } },
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }

      if (transcription.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to modify this transcription",
        });
      }

      // Check if transcription has a project assigned
      if (!transcription.projectId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transcription must be assigned to a project before generating actions",
        });
      }

      // If actions have already been generated, delete them
      if (transcription.processedAt && transcription.actions.length > 0) {
        // Delete all actions linked to this transcription
        const deletedCount = await ctx.db.action.deleteMany({
          where: { transcriptionSessionId: input.transcriptionId },
        });

        // Clear the processedAt flag
        await ctx.db.transcriptionSession.update({
          where: { id: input.transcriptionId },
          data: { processedAt: null },
        });

        return {
          action: "deleted" as const,
          actionsDeleted: deletedCount.count,
        };
      }

      // Otherwise, process the transcription to generate actions
      const result = await TranscriptionProcessingService.processTranscription(
        input.transcriptionId,
        ctx.session.user.id,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.errors.join(", ") || "Failed to process transcription",
        });
      }

      return {
        action: "generated" as const,
        actionsCreated: result.actionsCreated,
      };
    }),

  // Get webhook activity logs for the Activity tab
  getWebhookLogs: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
          status: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db.webhookLog.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input?.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: (input?.limit ?? 50) + 1,
        ...(input?.cursor
          ? {
              cursor: { id: input.cursor },
              skip: 1,
            }
          : {}),
      });

      let nextCursor: string | undefined;
      if (logs.length > (input?.limit ?? 50)) {
        const nextItem = logs.pop();
        nextCursor = nextItem?.id;
      }

      return {
        logs,
        nextCursor,
      };
    }),
});
