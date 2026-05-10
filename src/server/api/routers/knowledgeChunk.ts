import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getKnowledgeService } from "~/server/services/KnowledgeService";

// ────────────────────────────────────────────────────────────────────
// One2b agent integration: lightweight wrappers around KnowledgeService
// for the meetingContextAgent. KnowledgeService scopes by userId + an
// OPTIONAL workspaceId, so these procedures (a) verify caller workspace
// membership, (b) backfill workspaceId on freshly-created chunks since
// KnowledgeService.embedTranscription does not currently set it, and
// (c) wrap KnowledgeService.search with workspace + similarity filters.
// ────────────────────────────────────────────────────────────────────

// KnowledgeService currently hard-codes the OpenAI text-embedding-3-small
// model (1536 dims) inside its constructor. Until KnowledgeService exposes
// this metadata on its result or writes it onto the KnowledgeChunk row,
// we mirror the constants here so the agent response is self-describing.
const EMBEDDING_PROVIDER = "openai";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

export const knowledgeChunkRouter = createTRPCRouter({
  // ──────────────────────────────────────────────────────────────────
  // Embed (or re-embed) a transcript and stamp workspaceId on the chunks.
  // KnowledgeService deletes existing chunks for the source inside its
  // own transaction before inserting the new ones, so re-runs are safe.
  // ──────────────────────────────────────────────────────────────────
  ingestTranscription: protectedProcedure
    .input(
      z.object({
        transcriptionSessionId: z.string(),
        workspaceId: z.string(),
      }),
    )
    .output(
      z.object({
        chunksCreated: z.number(),
        transcriptionSessionId: z.string(),
        embeddingProvider: z.string(),
        embeddingModel: z.string(),
        embeddingDim: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Verify caller workspace membership.
      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: input.workspaceId },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      // 2. Verify the transcript exists and belongs to this workspace.
      const transcript = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: { id: true, workspaceId: true },
      });
      if (!transcript) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription session not found",
        });
      }
      if (transcript.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Transcription session does not belong to this workspace",
        });
      }

      // 3. Embed via KnowledgeService (chunks + embeds + writes).
      const knowledgeService = getKnowledgeService(ctx.db);
      const chunksCreated = await knowledgeService.embedTranscription(
        input.transcriptionSessionId,
      );

      // 4. Workaround: KnowledgeService.embedTranscription does NOT yet set
      //    workspaceId on the inserted chunks (it only writes userId/projectId).
      //    Until KnowledgeService is workspace-aware, backfill here so the
      //    chunks are scoped correctly for subsequent search queries.
      //    Safe to run unconditionally — narrow filter on (sourceType, sourceId).
      if (chunksCreated > 0) {
        await ctx.db.knowledgeChunk.updateMany({
          where: {
            sourceType: "transcription",
            sourceId: input.transcriptionSessionId,
          },
          data: { workspaceId: input.workspaceId },
        });
      }

      return {
        chunksCreated,
        transcriptionSessionId: input.transcriptionSessionId,
        embeddingProvider: EMBEDDING_PROVIDER,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDim: EMBEDDING_DIM,
      };
    }),

  // ──────────────────────────────────────────────────────────────────
  // Workspace-scoped semantic search across knowledge chunks. Hydrates
  // meetingTitle / meetingDate for transcript chunks so the agent can
  // surface provenance to the model without an extra round-trip.
  // ──────────────────────────────────────────────────────────────────
  semanticSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        workspaceId: z.string(),
        sourceType: z.enum(["transcription", "document", "resource"]).optional(),
        sourceId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        similarityThreshold: z.number().min(0).max(1).default(0.3),
      }),
    )
    .output(
      z.array(
        z.object({
          id: z.string(),
          content: z.string(),
          sourceType: z.string(),
          sourceId: z.string(),
          similarity: z.number(),
          speakerName: z.string().nullable().optional(),
          speakerEmail: z.string().nullable().optional(),
          startTimeMs: z.number().nullable().optional(),
          endTimeMs: z.number().nullable().optional(),
          meetingTitle: z.string().nullable().optional(),
          meetingDate: z.date().nullable().optional(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Workspace membership check.
      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: input.workspaceId },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      // 2. KnowledgeService.search only supports 'transcription' | 'resource'.
      //    'document' is reserved in the input schema for future use; for now
      //    we silently drop it (no documents are indexed yet).
      const sourceTypes =
        input.sourceType && input.sourceType !== "document"
          ? [input.sourceType]
          : undefined;

      const knowledgeService = getKnowledgeService(ctx.db);
      const rawResults = await knowledgeService.search(input.query, {
        userId,
        workspaceId: input.workspaceId,
        sourceTypes,
        limit: input.limit,
      });

      // 3. Filter by sourceId (if specified) + similarityThreshold.
      const filtered = rawResults.filter((r) => {
        if (input.sourceId && r.sourceId !== input.sourceId) return false;
        return r.similarity >= input.similarityThreshold;
      });

      // 4. KnowledgeService.search already hydrates sourceTitle + meetingDate
      //    via JOIN, so we just remap to the agent's response shape.
      //    Speaker/timing fields aren't yet populated on KnowledgeChunk by
      //    KnowledgeService; default to null so the schema validates.
      return filtered.map((r) => ({
        id: r.id,
        content: r.content,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        similarity: r.similarity,
        speakerName: null,
        speakerEmail: null,
        startTimeMs: null,
        endTimeMs: null,
        meetingTitle:
          r.sourceType === "transcription" ? r.sourceTitle ?? null : null,
        meetingDate:
          r.sourceType === "transcription"
            ? r.sourceMeta?.meetingDate ?? null
            : null,
      }));
    }),

  // ──────────────────────────────────────────────────────────────────
  // Delete all chunks for a (workspaceId, sourceType, sourceId) tuple.
  // Used by the agent before re-ingesting a transcript to avoid stale
  // chunks accumulating across runs.
  // ──────────────────────────────────────────────────────────────────
  deleteForSource: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        sourceType: z.string(),
        sourceId: z.string(),
      }),
    )
    .output(z.object({ deleted: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: input.workspaceId },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      const result = await ctx.db.knowledgeChunk.deleteMany({
        where: {
          workspaceId: input.workspaceId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });

      return { deleted: result.count };
    }),
});
