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
        // integration is null when the connection is DISCONNECTED (soft
        // disconnect / deleted Integration row) — links and runs survive.
        integrationId: config.integrationId,
        integrationName: config.integration?.name ?? null,
        integrationStatus: config.integration?.status ?? null,
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

      // The upsert doubles as reconnect: a disconnected config (null
      // integration link) is revived in place — same [productId, provider]
      // row, so its TicketSync links and run history stay attached even when
      // a different database is linked (ADR-0042).
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
      // Soft disconnect (ADR-0042): null the integration link, never delete
      // the row. TicketSync links and TicketSyncRun history survive so a
      // wrong-database accident stays auditable and revertible; saveConfig
      // revives the same row on reconnect.
      await ctx.db.ticketSyncConfig.update({
        where: {
          productId_provider: { productId: input.productId, provider: "notion" },
        },
        data: { integrationId: null },
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
        select: {
          id: true,
          integrationId: true,
          propertyNames: true,
          enabled: true,
        },
      });
      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Notion sync configured for this product",
        });
      }

      // A disconnected connection (null integration link) can't reach Notion
      // at all — reconnect first.
      if (!config.integrationId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Notion sync is disconnected for this product",
        });
      }

      // Real syncs honour the pause switch server-side (the UI only disables
      // the button). Dry-run previews are read-only and stay allowed.
      if (!config.enabled && !(input.dryRun ?? false)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Notion sync is paused for this product",
        });
      }

      const adapterResult = await createNotionTicketSyncAdapter(ctx.db, {
        integrationId: config.integrationId,
        propertyNames: config.propertyNames,
      });
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
        triggeredById: ctx.session.user.id,
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
        include: {
          // Who triggered the run; null for cron/agent runs (and rows from
          // before the ledger recorded it) — the UI renders those as system.
          triggeredBy: { select: { id: true, name: true, email: true } },
        },
      });
    }),
});
