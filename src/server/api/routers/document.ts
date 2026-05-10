/**
 * Document tracker tRPC router (Phase 3c).
 *
 * Provides workspace-scoped document storage backed by S3 + the existing
 * KnowledgeService embedding pipeline. The future `documentTrackerAgent`
 * (mastra side) will call into these procedures for ingestion + retrieval.
 *
 * NOTE: Google Drive sync, image OCR, and file-attachment handling on
 * other entities (e.g. emails) are intentionally OUT of scope for this PR.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { db as dbInstance } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  uploadFile,
  getPresignedDownloadUrl,
  deleteObject,
  downloadObject,
  keyForDocument,
} from "~/lib/s3";
import { extractText } from "~/lib/document-parser";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import { DocumentSource } from "~/server/services/embedding/sources/DocumentSource";

// ── Constants ────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  "drive_file",
  "upload",
  "url",
  "email_attachment",
] as const;

const INGESTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const PRESIGNED_URL_TTL_SECONDS = 3600;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Verify the caller is a member of the workspace. Throws FORBIDDEN if not.
 */
async function assertWorkspaceMember(
  db: Prisma.TransactionClient | typeof dbInstance,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { userId: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace",
    });
  }
}

/**
 * Fetch a document and confirm it lives in the given workspace.
 * Throws NOT_FOUND otherwise (we deliberately use NOT_FOUND for both
 * "doesn't exist" and "wrong workspace" to avoid leaking existence).
 */
async function getDocumentInWorkspace(
  db: typeof dbInstance,
  documentId: string,
  workspaceId: string,
) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Document not found",
    });
  }
  return doc;
}

// ── Router ───────────────────────────────────────────────────────────

export const documentRouter = createTRPCRouter({
  // ──────────────────────────────────────────────────────────────────
  // create
  // Inserts a Document row with status='pending'. Does NOT touch S3.
  // Useful for the "register a document, upload later" flow.
  // ──────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        title: z.string().min(1).max(500),
        description: z.string().max(2000).optional(),
        sourceType: z.enum(SOURCE_TYPES),
        sourceUri: z.string().max(2048).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertWorkspaceMember(ctx.db, userId, input.workspaceId);

      const document = await ctx.db.document.create({
        data: {
          workspaceId: input.workspaceId,
          uploadedById: userId,
          title: input.title,
          description: input.description,
          sourceType: input.sourceType,
          sourceUri: input.sourceUri,
          ingestionStatus: "pending",
          chunkCount: 0,
        },
      });

      return { document };
    }),

  // ──────────────────────────────────────────────────────────────────
  // list
  // Workspace-scoped, optional sourceType + ingestionStatus filters,
  // cursor pagination on `id`.
  // ──────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        sourceType: z.enum(SOURCE_TYPES).optional(),
        ingestionStatus: z.enum(INGESTION_STATUSES).optional(),
        limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertWorkspaceMember(ctx.db, userId, input.workspaceId);

      const limit = input.limit ?? DEFAULT_LIST_LIMIT;

      const where: Prisma.DocumentWhereInput = {
        workspaceId: input.workspaceId,
        ...(input.sourceType ? { sourceType: input.sourceType } : {}),
        ...(input.ingestionStatus
          ? { ingestionStatus: input.ingestionStatus }
          : {}),
      };

      const documents = await ctx.db.document.findMany({
        where,
        take: limit + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | null = null;
      if (documents.length > limit) {
        const next = documents.pop();
        nextCursor = next?.id ?? null;
      }

      return { documents, nextCursor };
    }),

  // ──────────────────────────────────────────────────────────────────
  // getById
  // ──────────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        id: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertWorkspaceMember(ctx.db, userId, input.workspaceId);
      return getDocumentInWorkspace(ctx.db, input.id, input.workspaceId);
    }),

  // ──────────────────────────────────────────────────────────────────
  // getDownloadUrl
  // Returns a short-lived presigned S3 URL.
  // ──────────────────────────────────────────────────────────────────
  getDownloadUrl: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        id: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertWorkspaceMember(ctx.db, userId, input.workspaceId);

      const doc = await getDocumentInWorkspace(
        ctx.db,
        input.id,
        input.workspaceId,
      );
      if (!doc.s3Key) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Document has no associated S3 object",
        });
      }

      const url = await getPresignedDownloadUrl(
        doc.s3Key,
        PRESIGNED_URL_TTL_SECONDS,
      );
      return {
        url,
        expiresAt: new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000),
      };
    }),

  // ──────────────────────────────────────────────────────────────────
  // ingest
  // The full upload + extract + embed pipeline.
  // Three input variants: base64 (binary upload), url (fetch + ingest),
  // text (raw text body).
  // ──────────────────────────────────────────────────────────────────
  ingest: protectedProcedure
    .input(
      z.discriminatedUnion("source", [
        z.object({
          source: z.literal("base64"),
          workspaceId: z.string().min(1),
          title: z.string().min(1).max(500),
          mimeType: z.string().min(1),
          base64Data: z.string().min(1),
          filename: z.string().min(1).max(500),
          description: z.string().max(2000).optional(),
        }),
        z.object({
          source: z.literal("url"),
          workspaceId: z.string().min(1),
          title: z.string().min(1).max(500),
          url: z.string().url(),
          mimeType: z.string().optional(),
          description: z.string().max(2000).optional(),
        }),
        z.object({
          source: z.literal("text"),
          workspaceId: z.string().min(1),
          title: z.string().min(1).max(500),
          text: z.string().min(1),
          description: z.string().max(2000).optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertWorkspaceMember(ctx.db, userId, input.workspaceId);

      // Step 1: create the Document row up-front so we can attribute
      // failures to a real id (and surface them via the row's
      // ingestionError field).
      const sourceType =
        input.source === "url" ? "url" : "upload";
      const sourceUri =
        input.source === "url" ? input.url : undefined;
      const document = await ctx.db.document.create({
        data: {
          workspaceId: input.workspaceId,
          uploadedById: userId,
          title: input.title,
          description: input.description,
          sourceType,
          sourceUri,
          ingestionStatus: "pending",
          chunkCount: 0,
        },
      });

      try {
        // Step 2: resolve buffer + mimeType + filename from the input variant.
        let buffer: Buffer;
        let mimeType: string;
        let filename: string;

        if (input.source === "base64") {
          buffer = Buffer.from(input.base64Data, "base64");
          mimeType = input.mimeType;
          filename = input.filename;
        } else if (input.source === "url") {
          const response = await fetch(input.url);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch URL ${input.url}: ${response.status} ${response.statusText}`,
            );
          }
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          mimeType =
            input.mimeType ??
            response.headers.get("content-type") ??
            "application/octet-stream";
          // Try to derive a filename from the URL pathname tail.
          const urlPath = new URL(input.url).pathname;
          const tail = urlPath.split("/").filter(Boolean).pop();
          filename = tail && tail.length > 0 ? tail : "content";
        } else {
          buffer = Buffer.from(input.text, "utf-8");
          mimeType = "text/plain";
          filename = "content.txt";
        }

        const byteSize = buffer.byteLength;

        // Step 3: upload to S3.
        const key = keyForDocument(document.id, filename);
        await uploadFile({ key, body: buffer, contentType: mimeType });

        // Step 4: persist S3 metadata + flip status -> processing.
        const updated = await ctx.db.document.update({
          where: { id: document.id },
          data: {
            s3Key: key,
            mimeType,
            byteSize,
            ingestionStatus: "processing",
          },
        });

        // Step 5: extract text + embed via KnowledgeService.
        const { text } = await extractText(buffer, mimeType, filename);
        const source = DocumentSource.fromEntity(updated, text);
        const knowledgeService = getKnowledgeService(ctx.db);
        const result = await knowledgeService.embedSource(source);

        if (!result.success) {
          throw new Error(result.error ?? "Embedding failed");
        }

        // Step 6: mark completed.
        await ctx.db.document.update({
          where: { id: document.id },
          data: {
            ingestionStatus: "completed",
            chunkCount: result.chunkCount,
            ingestionError: null,
          },
        });

        return {
          documentId: document.id,
          chunksCreated: result.chunkCount,
          ingestionStatus: "completed" as const,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown ingestion error";
        // Best-effort status update — swallow update errors so we still
        // surface the original failure to the caller.
        try {
          await ctx.db.document.update({
            where: { id: document.id },
            data: {
              ingestionStatus: "failed",
              ingestionError: message.slice(0, 2000),
            },
          });
        } catch (updateError) {
          console.error(
            "[documentRouter.ingest] Failed to mark document as failed:",
            updateError,
          );
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Document ingestion failed: ${message}`,
        });
      }
    }),

  // ──────────────────────────────────────────────────────────────────
  // delete
  // Removes S3 object + chunks + Document row.
  // ──────────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertWorkspaceMember(ctx.db, userId, input.workspaceId);

      const doc = await getDocumentInWorkspace(
        ctx.db,
        input.id,
        input.workspaceId,
      );

      // 1. Delete S3 object (if any). Tolerate failures so a stale row
      //    can still be cleaned up.
      if (doc.s3Key) {
        try {
          await deleteObject(doc.s3Key);
        } catch (error) {
          console.error(
            `[documentRouter.delete] Failed to delete S3 object ${doc.s3Key}:`,
            error,
          );
        }
      }

      // 2. Delete KnowledgeChunk rows for this document.
      //    Scoped by sourceType + sourceId (workspaceId is on chunks but
      //    nullable in the current schema — sourceId is unique enough).
      await ctx.db.knowledgeChunk.deleteMany({
        where: { sourceType: "document", sourceId: doc.id },
      });

      // 3. Delete the Document row itself.
      await ctx.db.document.delete({ where: { id: doc.id } });

      return { deleted: true as const };
    }),
});

// `downloadObject` is currently unused by the router but re-exported
// from ~/lib/s3 for the agent layer; importing it here keeps the
// dependency graph honest in case future procedures need it.
void downloadObject;
