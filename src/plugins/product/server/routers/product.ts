import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import type { PrismaClient } from "@prisma/client";

/**
 * Ensure the caller is a member of the workspace. Throws FORBIDDEN otherwise.
 */
async function assertWorkspaceMember(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this workspace",
    });
  }
  return membership;
}

/**
 * Load a product and verify workspace membership in one step.
 */
async function loadProductWithAccess(
  db: PrismaClient,
  userId: string,
  productId: string,
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, workspaceId: true, slug: true },
  });
  if (!product) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  }
  await assertWorkspaceMember(db, userId, product.workspaceId);
  return product;
}

// Exported so other routers (feature, ticket, research, retrospective) can reuse
export { assertWorkspaceMember, loadProductWithAccess };

export const productRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      return ctx.db.product.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              features: true,
              tickets: true,
              researches: true,
              retrospectives: true,
            },
          },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              features: true,
              tickets: true,
              researches: true,
              retrospectives: true,
            },
          },
        },
      });
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        product.workspaceId,
      );
      return product;
    }),

  getBySlug: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        slug: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );
      const product = await ctx.db.product.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: input.workspaceId,
            slug: input.slug,
          },
        },
        include: {
          _count: {
            select: {
              features: true,
              tickets: true,
              researches: true,
              retrospectives: true,
            },
          },
        },
      });
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }
      return product;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(120),
        slug: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Slug must be kebab-case"),
        description: z.string().max(2000).optional(),
        icon: z.string().max(60).optional(),
        color: z.string().max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      return ctx.db.product.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          icon: input.icon,
          color: input.color,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        icon: z.string().max(60).optional(),
        color: z.string().max(60).optional(),
        funTicketIds: z.boolean().optional(),
        estimationScale: z.enum(["fibonacci", "tshirt"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.id);

      const { id, ...data } = input;
      return ctx.db.product.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.product.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── View preferences (stored in PluginConfig.settings) ──

  getViewPrefs: protectedProcedure
    .input(z.object({ productSlug: z.string(), workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const config = await ctx.db.pluginConfig.findFirst({
        where: { pluginId: "product", workspaceId: input.workspaceId, userId: ctx.session.user.id },
        select: { settings: true },
      });
      const settings = (config?.settings as Record<string, unknown>) ?? {};
      const viewPrefs = (settings.viewPrefs as Record<string, unknown>) ?? {};
      return (viewPrefs[input.productSlug] as Record<string, unknown>) ?? {};
    }),

  saveViewPrefs: protectedProcedure
    .input(z.object({
      productSlug: z.string(),
      workspaceId: z.string(),
      prefs: z.object({
        view: z.string().optional(),
        groupBy: z.string().optional(),
        sortField: z.string().optional(),
        sortDir: z.string().optional(),
        visibleColumns: z.array(z.string()).optional(),
        entity: z.enum(["tickets", "epics"]).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.pluginConfig.findFirst({
        where: { pluginId: "product", workspaceId: input.workspaceId, userId: ctx.session.user.id },
      });

      const currentSettings = (existing?.settings as Record<string, unknown>) ?? {};
      const currentViewPrefs = (currentSettings.viewPrefs as Record<string, unknown>) ?? {};
      const currentProductPrefs = (currentViewPrefs[input.productSlug] as Record<string, unknown>) ?? {};

      // Merge: only override fields that are provided
      const merged = { ...currentProductPrefs, ...input.prefs };
      const newSettings = {
        ...currentSettings,
        viewPrefs: { ...currentViewPrefs, [input.productSlug]: merged },
      };

      if (existing) {
        return ctx.db.pluginConfig.update({
          where: { id: existing.id },
          data: { settings: newSettings },
        });
      }

      return ctx.db.pluginConfig.create({
        data: {
          pluginId: "product",
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
          enabled: true,
          settings: newSettings,
        },
      });
    }),
});
