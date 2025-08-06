import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
//import { getSetups } from "~/server/services/videoService";
import { uploadToBlob } from "~/lib/blob";
import { FirefliesSyncService } from "~/server/services/FirefliesSyncService";
import { TranscriptionProcessingService } from "~/server/services/TranscriptionProcessingService";

// Keep in-memory store for development/debugging
const transcriptionStore: Record<string, string[]> = {};


// Middleware to check API key
const apiKeyMiddleware = publicProcedure.use(async ({ ctx, next }) => {
  const apiKey = ctx.headers.get("x-api-key");

  if (!apiKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "API key is required",
    });
  }

  // Find the verification token and associated user
  const verificationToken = await ctx.db.verificationToken.findFirst({
    where: {
      token: apiKey,
    },
  });

  if (!verificationToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired API key",
    });
  }

  // Type-safe error handling
  const userId = verificationToken.userId;
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No user associated with this API key",
    });
  }

  // Add the user id to the context
  return next({
    ctx: {
      ...ctx,
      userId, // Now type-safe
    },
  });
});

export const transcriptionRouter = createTRPCRouter({
  startSession: apiKeyMiddleware
    .input(z.object({ projectId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      // Type-safe userId access
      const userId = ctx.userId;
      const { projectId } = input;

      // Create record in database using ctx.db
      const session = await ctx.db.transcriptionSession.create({
        data: {
          sessionId: `session_${Date.now()}`,
          transcription: "",
          userId,
          projectId, // Save projectId
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
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      if (session.userId !== ctx.session.user.id) {
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
      const session = await ctx.db.transcriptionSession.update({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        data: {
          transcription: input.transcription,
          updatedAt: new Date(),
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
      if (session.userId !== ctx.session.user.id) {
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

  getAllTranscriptions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.transcriptionSession.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
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
      // Update the transcription session
      const session = await ctx.db.transcriptionSession.update({
        where: {
          id: input.transcriptionId,
        },
        data: {
          projectId: input.projectId,
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
  saveScreenshot: protectedProcedure
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
    return FirefliesSyncService.getUserFirefliesIntegrations(ctx.session.user.id);
  }),

  getFirefliesSyncStatus: protectedProcedure
    .input(z.object({ integrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const integration = await FirefliesSyncService.getFirefliesIntegration(
        ctx.session.user.id,
        input.integrationId
      );
      
      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Fireflies integration not found",
        });
      }

      const estimatedNewCount = await FirefliesSyncService.estimateNewTranscripts(
        ctx.session.user.id,
        input.integrationId
      );

      return {
        integrationName: integration.name,
        lastSyncAt: integration.lastSyncAt,
        estimatedNewCount,
      };
    }),

  bulkSyncFromFireflies: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        syncSinceDays: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await FirefliesSyncService.bulkSyncFromFireflies(
        ctx.session.user.id,
        input.integrationId,
        input.syncSinceDays
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to sync from Fireflies",
        });
      }

      return result;
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.associateWithProject(
        input.transcriptionId,
        input.projectId,
        ctx.session.user.id,
        input.autoProcess
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error || "Failed to associate transcription with project",
        });
      }

      return result;
    }),

  processTranscription: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.processTranscription(
        input.transcriptionId,
        ctx.session.user.id
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.errors.join(", ") || "Failed to process transcription",
        });
      }

      return result;
    }),

  sendSlackNotification: protectedProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await TranscriptionProcessingService.sendSlackNotification(
        input.transcriptionId,
        ctx.session.user.id
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error || "Failed to send Slack notification",
        });
      }

      return result;
    }),
});
