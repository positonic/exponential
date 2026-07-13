import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess } from "./product";
import { DEFAULT_STATUS_MAP } from "~/server/services/ticketSync/mapping";
import { runInboundTicketSync } from "~/server/services/ticketSync/engine";
import { createNotionTicketSyncAdapter } from "~/server/services/ticketSync/notionAdapter";

/**
 * ticketSync — configuration surface for the product ↔ Notion backlog sync.
 *
 * This router only manages the standing link (TicketSyncConfig): which Notion
 * integration + database a product's ticket board mirrors, whether the sync is
 * enabled, and the seeded status mapping. Sync execution lives in the sync
 * engine service and is exposed separately.
 *
 * The credential is pinned via `integrationId` (not resolved per-session) so
 * scheduled runs work without a session user. `pushEnabled` defaults to false
 * and stays false until Phase 2 ships — inbound-only is read-only against
 * Notion, so a misconfigured link can never damage the Notion backlog.
 */
export const ticketSyncRouter = createTRPCRouter({
  getConfig: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      const config = await ctx.db.ticketSyncConfig.findUnique({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
        include: {
          integration: {
            select: { id: true, name: true, status: true },
          },
          _count: { select: { syncs: true } },
        },
      });

      if (!config) return null;

      return {
        id: config.id,
        productId: config.productId,
        provider: config.provider,
        integrationId: config.integrationId,
        integrationName: config.integration.name,
        integrationStatus: config.integration.status,
        databaseId: config.databaseId,
        databaseName: config.databaseName,
        enabled: config.enabled,
        pushEnabled: config.pushEnabled,
        statusMap: config.statusMap,
        lastPulledAt: config.lastPulledAt,
        linkedTicketCount: config._count.syncs,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    }),

  saveConfig: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        integrationId: z.string(),
        databaseId: z.string(),
        databaseName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      // The integration must be the caller's own Notion connection — same
      // ownership rule as integration.getNotionDatabases.
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          provider: "notion",
          userId: ctx.session.user.id,
        },
        select: { id: true },
      });
      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notion integration not found",
        });
      }

      return ctx.db.ticketSyncConfig.upsert({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
        create: {
          productId: input.productId,
          provider: "notion",
          integrationId: input.integrationId,
          databaseId: input.databaseId,
          databaseName: input.databaseName,
          // Seed with the tolerant import heuristics; editable later without
          // redeploying (configurable-map, sticky-collapse decision).
          statusMap: DEFAULT_STATUS_MAP,
          createdById: ctx.session.user.id,
        },
        update: {
          integrationId: input.integrationId,
          databaseId: input.databaseId,
          databaseName: input.databaseName,
        },
      });
    }),

  setEnabled: protectedProcedure
    .input(z.object({ productId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);
      return ctx.db.ticketSyncConfig.update({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
        data: { enabled: input.enabled },
      });
    }),

  disconnect: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);
      // Cascades sync records and runs. Tickets themselves are untouched;
      // re-connecting re-adopts them via their stored Notion page ids.
      await ctx.db.ticketSyncConfig.delete({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
      });
      return { ok: true };
    }),

  syncNow: protectedProcedure
    .input(z.object({ productId: z.string(), dryRun: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      const config = await ctx.db.ticketSyncConfig.findUnique({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
        select: { id: true, integrationId: true, propertyNames: true },
      });
      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Notion sync configured for this product",
        });
      }

      const adapterResult = await createNotionTicketSyncAdapter(ctx.db, config);
      if (!adapterResult.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: adapterResult.error,
        });
      }

      return runInboundTicketSync(ctx.db, adapterResult.adapter, {
        configId: config.id,
        trigger: "manual",
        dryRun: input.dryRun ?? false,
      });
    }),

  listRuns: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      const config = await ctx.db.ticketSyncConfig.findUnique({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
        select: { id: true },
      });
      if (!config) return [];

      return ctx.db.ticketSyncRun.findMany({
        where: { configId: config.id },
        orderBy: { startedAt: "desc" },
        take: input.limit ?? 10,
      });
    }),
});
