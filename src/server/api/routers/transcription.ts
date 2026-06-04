import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
//import { getSetups } from "~/server/services/videoService";
import { uploadToBlob } from "~/lib/blob";
import { FirefliesSyncService } from "~/server/services/FirefliesSyncService";
import { TranscriptionProcessingService } from "~/server/services/TranscriptionProcessingService";
import { weeklyMeetingStats } from "~/server/services/meetings/weeklyMeetingStats";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import {
  TranscriptSummarizerService,
  SummarizationNotConfiguredError,
} from "~/server/services/TranscriptSummarizerService";
import {
  buildProjectAccessWhere,
  canEditProject,
  getProjectAccess,
  hasProjectAccess,
  requireProjectAccess,
} from "~/server/services/access";

// Keep in-memory store for development/debugging
const transcriptionStore: Record<string, string[]> = {};

// ────────────────────────────────────────────────────────────────────
// Title-token stopwords for `findRelated` matching.
//
// Tokens that appear in nearly every meeting title carry no signal, so we
// strip them before computing overlap. The list is intentionally narrow
// (meeting-pattern words + common articles/prepositions); domain-specific
// vocabulary like project names or topics MUST pass through.
// ────────────────────────────────────────────────────────────────────
const TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  // meeting-pattern words
  "meeting",
  "call",
  "sync",
  "weekly",
  "daily",
  "monthly",
  "quarterly",
  "standup",
  "checkin",
  "check-in",
  "review",
  "1:1",
  "1-1",
  "1on1",
  "one-on-one",
  "discussion",
  "session",
  "huddle",
  "catchup",
  "catch-up",
  // common articles / prepositions
  "the",
  "a",
  "an",
  "and",
  "or",
  "with",
  "at",
  "of",
  "to",
  "for",
  "in",
  "on",
  "by",
  "vs",
  "via",
  "re",
]);

/**
 * Tokenize a meeting title for related-meeting matching: lowercase, split
 * on non-alphanumeric, drop empty + stopwords. Returns a unique-token list
 * (caller wraps in Set if needed).
 */
function tokenizeTitle(title: string): string[] {
  const raw = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !TITLE_STOPWORDS.has(t));
  // Dedupe while preserving order — score denominator should count each
  // distinct token once even if the user repeats a word in the title.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Centralized access check for a transcription session.
 *
 * Rules (in order):
 * 1. The session owner always has access.
 * 2. If the session is tied to a project, project access is authoritative —
 *    a workspace member without project access (e.g. on a restricted project)
 *    is denied even if they could otherwise see the workspace.
 * 3. Otherwise, fall back to direct workspace membership (the legacy
 *    "owner OR workspace member" behavior for project-less transcriptions).
 */
async function ensureTranscriptionAccess(
  db: PrismaClient,
  userId: string,
  session: {
    userId: string | null;
    projectId: string | null;
    workspaceId: string | null;
  },
  permission: "view" | "edit",
): Promise<void> {
  if (session.userId && session.userId === userId) return;

  if (session.projectId) {
    const access = await getProjectAccess(db, userId, session.projectId);
    const allowed =
      permission === "view" ? hasProjectAccess(access) : canEditProject(access);
    if (allowed) return;
  } else if (session.workspaceId) {
    const membership = await db.workspaceUser.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: session.workspaceId },
      },
    });
    if (membership) return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      permission === "view"
        ? "Not authorized to view this transcription"
        : "Not authorized to update this transcription",
  });
}

export const transcriptionRouter = createTRPCRouter({
  startSession: apiKeyMiddleware
    .input(z.object({
      projectId: z.string().nullable(),
      workspaceId: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Type-safe userId access
      const userId = ctx.userId;
      const { projectId, workspaceId, title } = input;

      if (projectId) {
        const access = await getProjectAccess(ctx.db, userId, projectId);
        if (!hasProjectAccess(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }

      // Create record in database using ctx.db
      const session = await ctx.db.transcriptionSession.create({
        data: {
          sessionId: `session_${Date.now()}`,
          transcription: "",
          userId,
          projectId, // Save projectId
          workspaceId: workspaceId ?? null,
          title: title ?? null,
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

  // Stateless transcript → meeting-summary markdown for the device's **Local
  // summary** "Exponential server" provider (ADR 0006, exponential-ios). A pure
  // preview: it creates NO TranscriptionSession and writes nothing — the device
  // renders the markdown locally and never Submits it, so a preview can't pollute
  // a Meeting. Authenticated like the other device calls (device-token JWT or
  // x-api-key) via apiKeyMiddleware; `ctx.userId` gates access even though no row
  // is touched, so it isn't an unauthenticated LLM endpoint.
  summarize: apiKeyMiddleware
    .input(
      z.object({
        transcript: z.string().min(1, "Transcript is required"),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ markdown: string }> => {
      // Touch userId so the call is unambiguously authenticated (and lints clean).
      void ctx.userId;
      try {
        const markdown = await TranscriptSummarizerService.summarize(
          input.transcript,
        );
        return { markdown };
      } catch (error) {
        if (error instanceof SummarizationNotConfiguredError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to summarize transcript",
        });
      }
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
              slug: true,
            },
          },
          sourceIntegration: {
            select: {
              id: true,
              provider: true,
              name: true,
            },
          },
          participants: {
            select: {
              id: true,
              email: true,
              name: true,
              speakerLabel: true,
              isHost: true,
              userId: true,
              contactId: true,
            },
          },
          actions: {
            orderBy: { createdAt: "asc" },
          },
          project: {
            select: {
              id: true,
              slug: true,
              name: true,
              taskManagementTool: true,
              taskManagementConfig: true,
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

      await ensureTranscriptionAccess(
        ctx.db,
        ctx.session.user.id,
        session,
        "view",
      );

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

      await ensureTranscriptionAccess(
        ctx.db,
        ctx.session.user.id,
        existing,
        "edit",
      );

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
        meetingDate: z.date().nullable().optional(),
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

      await ensureTranscriptionAccess(
        ctx.db,
        ctx.session.user.id,
        existing,
        "edit",
      );

      const updateData: {
        description?: string;
        notes?: string;
        summary?: string;
        transcription?: string;
        workspaceId?: string | null;
        meetingDate?: Date | null;
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
      if (input.meetingDate !== undefined) {
        updateData.meetingDate = input.meetingDate;
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
      const session = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.id },
      });
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      await ensureTranscriptionAccess(
        ctx.db,
        ctx.session.user.id,
        session,
        "edit",
      );

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

  // Get transcriptions for a specific project (used by ManyChat agent context).
  // Project access is authoritative: any user with project access sees every
  // transcription tied to it, regardless of who uploaded each one.
  getProjectTranscriptions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.transcriptionSession.findMany({
        where: {
          projectId: input.projectId,
          archivedAt: null,
        },
        orderBy: { processedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          summary: true,
          notes: true,
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
          // Meeting type filter for the Meetings v2 tab strip.
          // - 'all' / undefined: no narrowing
          // - 'mine': caller is the session owner OR a Participant on the
          //   session (covers both creator and attendance)
          // - 'one_on_one': only Meetings with exactly two Participants
          //   (derived from `participantCount = 2` since no stored
          //   `meetingType` column exists in v1)
          // - 'customer' / 'internal': always empty — short-circuited below
          //   until a meeting-tagging mechanism exists
          meetingType: z
            .enum(["all", "mine", "one_on_one", "customer", "internal"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Customer and Internal tabs ship with honest empty states — no
      // tagging mechanism exists yet.
      if (
        input?.meetingType === "customer" ||
        input?.meetingType === "internal"
      ) {
        return [];
      }

      // Visibility: own transcriptions, OR transcriptions tied to a project
      // the user can access, OR transcriptions the caller is a linked
      // Participant on (calendar invitee — users get to see Meetings they
      // attended even if someone else uploaded the transcript).
      const accessFilter = {
        OR: [
          { userId },
          { project: buildProjectAccessWhere(userId) },
          { participants: { some: { userId } } },
        ],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filters: any[] = [accessFilter];

      if (!input?.includeArchived) {
        filters.push({ archivedAt: null });
      }

      // Optional workspace filter — match either direct workspaceId or via the
      // project's workspace.
      if (input?.workspaceId) {
        filters.push({
          OR: [
            { workspaceId: input.workspaceId },
            { project: { workspaceId: input.workspaceId } },
          ],
        });
      }

      if (input?.meetingType === "one_on_one") {
        filters.push({ participantCount: 2 });
      }

      if (input?.meetingType === "mine") {
        // "Mine" = the caller owns the Meeting or appears in its
        // Participant list. Participant userId may be null for email-only
        // invitees we haven't linked yet; those are correctly excluded.
        filters.push({
          OR: [
            { userId },
            { participants: { some: { userId } } },
          ],
        });
      }

      return ctx.db.transcriptionSession.findMany({
        where: { AND: filters },
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
          // Authoritative Participant rows for the Meeting card — avatars
          // and attendee count come from the calendar invite, not the
          // transcript speakers.
          participants: {
            select: {
              id: true,
              email: true,
              name: true,
              user: { select: { id: true, name: true, image: true } },
              contact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
    }),

  weeklyStats: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
          // ISO date string from the client (e.g. start of week in user's
          // local timezone). The service treats this as the inclusive lower
          // bound of the 7-day window.
          weekStart: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return weeklyMeetingStats(ctx.db, {
        userId: ctx.session.user.id,
        workspaceId: input?.workspaceId,
        weekStart: input?.weekStart,
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
      // Verify the user can edit the source transcription.
      const existing = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionId },
        select: { userId: true, projectId: true, workspaceId: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription not found",
        });
      }
      await ensureTranscriptionAccess(
        ctx.db,
        ctx.session.user.id,
        existing,
        "edit",
      );

      // Verify the user can edit the target project, and resolve its workspace.
      let workspaceId: string | null = null;
      if (input.projectId) {
        const targetAccess = await getProjectAccess(
          ctx.db,
          ctx.session.user.id,
          input.projectId,
        );
        if (!canEditProject(targetAccess)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have edit access to the target project",
          });
        }
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { workspaceId: true },
        });
        workspaceId = project?.workspaceId ?? null;
      }

      const session = await ctx.db.transcriptionSession.update({
        where: { id: input.transcriptionId },
        data: {
          projectId: input.projectId,
          workspaceId,
          updatedAt: new Date(),
        },
      });

      // Also update all associated actions to the same project
      await ctx.db.action.updateMany({
        where: { transcriptionSessionId: input.transcriptionId },
        data: { projectId: input.projectId },
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
      // Verify the user can edit the target project, and resolve its workspace.
      let workspaceId: string | null = null;
      if (input.projectId) {
        const targetAccess = await getProjectAccess(
          ctx.db,
          ctx.session.user.id,
          input.projectId,
        );
        if (!canEditProject(targetAccess)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have edit access to the target project",
          });
        }
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { workspaceId: true },
        });
        workspaceId = project?.workspaceId ?? null;
      }

      // Sources are scoped to user-owned transcriptions to keep bulk
      // semantics narrow — broader source access can be added once the UI
      // exposes shared transcriptions.
      const result = await ctx.db.transcriptionSession.updateMany({
        where: {
          id: { in: input.transcriptionIds },
          userId: ctx.session.user.id,
        },
        data: {
          projectId: input.projectId,
          workspaceId,
          updatedAt: new Date(),
        },
      });

      // Also update actions of the transcriptions we just touched. Mirror
      // the source userId scope so we don't touch other users' actions.
      await ctx.db.action.updateMany({
        where: {
          transcriptionSessionId: { in: input.transcriptionIds },
          transcriptionSession: { userId: ctx.session.user.id },
        },
        data: { projectId: input.projectId },
      });

      return { count: result.count };
    }),

  assignWorkspace: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        workspaceId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const existing = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionId },
        select: {
          userId: true,
          projectId: true,
          project: { select: { workspaceId: true } },
        },
      });

      if (!existing || existing.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      // Clear project if it doesn't belong to the new workspace
      let projectId = existing.projectId;
      if (input.workspaceId) {
        if (existing.project?.workspaceId !== input.workspaceId) {
          projectId = null;
        }
      } else {
        // Clearing workspace also clears project
        projectId = null;
      }

      return ctx.db.transcriptionSession.update({
        where: { id: input.transcriptionId },
        data: {
          workspaceId: input.workspaceId,
          projectId,
          updatedAt: new Date(),
        },
      });
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
        const access = await getProjectAccess(
          ctx.db,
          ctx.session.user.id,
          input.projectId,
        );
        if (!hasProjectAccess(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
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
    .use(requireProjectAccess("edit"))
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

      // If actions have already been generated (active or draft), delete them
      if ((transcription.processedAt ?? transcription.actionsSavedAt) && transcription.actions.length > 0) {
        // Delete all actions linked to this transcription
        const deletedCount = await ctx.db.action.deleteMany({
          where: { transcriptionSessionId: input.transcriptionId },
        });

        // Clear processing flags
        await ctx.db.transcriptionSession.update({
          where: { id: input.transcriptionId },
          data: { processedAt: null, actionsSavedAt: null },
        });

        return {
          action: "deleted" as const,
          actionsDeleted: deletedCount.count,
        };
      }

      // Generate draft actions (requires human review before publishing)
      const result = await TranscriptionProcessingService.generateDraftActions(
        input.transcriptionId,
        ctx.session.user.id,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.errors.join(", ") || "Failed to generate draft actions",
        });
      }

      return {
        action: "generated" as const,
        actionsCreated: result.actionsCreated,
      };
    }),

  // ────────────────────────────────────────────────────────────────────
  // One2b agent integration: deterministic related-meeting matching
  //
  // `findRelated` powers the meetingContextAgent's pre-meeting briefs by
  // returning past TranscriptionSessions that look related to an upcoming
  // meeting via two independent signals:
  //   1. Title-token overlap (after stopword filtering).
  //   2. Participant email overlap.
  //
  // The two buckets are returned independently — a session can appear in
  // both, and that's intentional: the agent uses both signals.
  //
  // Scope is workspace-only; project membership doesn't grant access here.
  // Uses simple Prisma + JS filtering (no pg_trgm) since per-workspace
  // session counts are bounded.
  // ────────────────────────────────────────────────────────────────────
  findRelated: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        meetingTitle: z.string().min(1),
        participantEmails: z.array(z.string().email()).default([]),
        matchThreshold: z.number().min(0).max(1).default(0.5),
        lookbackDays: z.number().min(1).max(365).default(90),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .output(
      z.object({
        byTitle: z.array(
          z.object({
            transcriptionSessionId: z.string(),
            title: z.string().nullable(),
            meetingDate: z.date().nullable(),
            summary: z.string().nullable(),
            matchedTokens: z.array(z.string()),
            titleScore: z.number(),
          }),
        ),
        byParticipantOverlap: z.array(
          z.object({
            transcriptionSessionId: z.string(),
            title: z.string().nullable(),
            meetingDate: z.date().nullable(),
            summary: z.string().nullable(),
            matchedEmails: z.array(z.string()),
            overlapRatio: z.number(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const callerId = ctx.session.user.id;

      // 1. Workspace membership check.
      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: callerId,
            workspaceId: input.workspaceId,
          },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      const cutoff = new Date(
        Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000,
      );

      // 2. Tokenize the input title (stopword-filtered).
      const inputTokens = tokenizeTitle(input.meetingTitle);
      const inputTokenSet = new Set(inputTokens);

      // 3. Title matching — fetch candidates in workspace + window, filter
      //    in JS. At expected workspace volumes (low thousands of sessions
      //    over the lookback window) this is well under DB cost of pg_trgm.
      let byTitle: Array<{
        transcriptionSessionId: string;
        title: string | null;
        meetingDate: Date | null;
        summary: string | null;
        matchedTokens: string[];
        titleScore: number;
      }> = [];

      if (inputTokens.length > 0) {
        const titleCandidates = await ctx.db.transcriptionSession.findMany({
          where: {
            workspaceId: input.workspaceId,
            meetingDate: { gte: cutoff },
            title: { not: null },
          },
          select: {
            id: true,
            title: true,
            meetingDate: true,
            summary: true,
          },
        });

        for (const candidate of titleCandidates) {
          if (!candidate.title) continue;
          const candidateTokens = new Set(tokenizeTitle(candidate.title));
          const matched: string[] = [];
          for (const token of inputTokenSet) {
            if (candidateTokens.has(token)) {
              matched.push(token);
            }
          }
          if (matched.length === 0) continue;
          byTitle.push({
            transcriptionSessionId: candidate.id,
            title: candidate.title,
            meetingDate: candidate.meetingDate,
            summary: candidate.summary,
            matchedTokens: matched,
            titleScore: matched.length / inputTokens.length,
          });
        }

        byTitle.sort((a, b) => {
          if (b.titleScore !== a.titleScore) {
            return b.titleScore - a.titleScore;
          }
          const aTime = a.meetingDate?.getTime() ?? 0;
          const bTime = b.meetingDate?.getTime() ?? 0;
          return bTime - aTime;
        });
        byTitle = byTitle.slice(0, input.limit);
      }

      // 4. Participant matching.
      let byParticipantOverlap: Array<{
        transcriptionSessionId: string;
        title: string | null;
        meetingDate: Date | null;
        summary: string | null;
        matchedEmails: string[];
        overlapRatio: number;
      }> = [];

      if (input.participantEmails.length > 0) {
        const lowercaseInputEmails = input.participantEmails.map((e) =>
          e.toLowerCase(),
        );
        const inputEmailSet = new Set(lowercaseInputEmails);

        const participantRows =
          await ctx.db.transcriptionSessionParticipant.findMany({
            where: {
              workspaceId: input.workspaceId,
              email: { in: lowercaseInputEmails, mode: "insensitive" },
              transcriptionSession: {
                meetingDate: { gte: cutoff },
              },
            },
            include: {
              transcriptionSession: {
                select: {
                  id: true,
                  title: true,
                  meetingDate: true,
                  summary: true,
                },
              },
            },
          });

        // Group by transcriptionSessionId, collect matched emails.
        const grouped = new Map<
          string,
          {
            session: {
              id: string;
              title: string | null;
              meetingDate: Date | null;
              summary: string | null;
            };
            emails: Set<string>;
          }
        >();
        for (const row of participantRows) {
          const lowered = row.email.toLowerCase();
          if (!inputEmailSet.has(lowered)) continue;
          const existing = grouped.get(row.transcriptionSessionId);
          if (existing) {
            existing.emails.add(lowered);
          } else {
            grouped.set(row.transcriptionSessionId, {
              session: row.transcriptionSession,
              emails: new Set([lowered]),
            });
          }
        }

        for (const { session, emails } of grouped.values()) {
          const overlapRatio = emails.size / input.participantEmails.length;
          if (overlapRatio < input.matchThreshold) continue;
          byParticipantOverlap.push({
            transcriptionSessionId: session.id,
            title: session.title,
            meetingDate: session.meetingDate,
            summary: session.summary,
            matchedEmails: Array.from(emails),
            overlapRatio,
          });
        }

        byParticipantOverlap.sort((a, b) => {
          if (b.overlapRatio !== a.overlapRatio) {
            return b.overlapRatio - a.overlapRatio;
          }
          const aTime = a.meetingDate?.getTime() ?? 0;
          const bTime = b.meetingDate?.getTime() ?? 0;
          return bTime - aTime;
        });
        byParticipantOverlap = byParticipantOverlap.slice(0, input.limit);
      }

      // 5. NOTE: do not dedupe across buckets — a session appearing in both
      //    is itself a signal (corroborating evidence) for the agent.
      return { byTitle, byParticipantOverlap };
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
