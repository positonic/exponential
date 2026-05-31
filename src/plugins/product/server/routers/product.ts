import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import { buildProjectAccessWhere } from "~/server/services/access";
import type { PrismaClient, Prisma } from "@prisma/client";
import { buildGraph } from "../services/DependencyGraphService";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";

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
              projects: true,
            },
          },
        },
      });
    }),

  listWithProjects: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      const projectInclude = {
        dri: {
          select: { id: true, name: true, email: true, image: true },
        },
        _count: { select: { actions: true } },
      } satisfies Prisma.ProjectInclude;

      const products = await ctx.db.product.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        include: {
          projects: {
            include: projectInclude,
            orderBy: [{ priority: "asc" }, { name: "asc" }],
          },
          _count: { select: { projects: true } },
        },
      });

      const unassignedProjects = await ctx.db.project.findMany({
        where: {
          workspaceId: input.workspaceId,
          productId: null,
          ...buildProjectAccessWhere(ctx.session.user.id),
        },
        include: projectInclude,
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      });

      return { products, unassignedProjects };
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
        name: boundedText("Name", 120, { min: 1 }),
        slug: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Slug must be kebab-case"),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        icon: boundedText("Icon", 60).optional(),
        color: boundedText("Color", 60).optional(),
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
        name: boundedText("Name", 120, { min: 1 }).optional(),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        icon: boundedText("Icon", 60).optional(),
        color: boundedText("Color", 60).optional(),
        funTicketIds: z.boolean().optional(),
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

  /**
   * Move a product (and its data) to another workspace.
   *
   * Tickets/features/research/insights follow automatically via productId.
   * TicketTemplates and Retrospectives carry their own workspaceId, so they're
   * re-parented here. Epics referenced by this product's tickets are brought
   * along only when used EXCLUSIVELY by this product (no other-product tickets,
   * no actions) — otherwise moving them would break the source workspace.
   * Cycles and tags are intentionally left in place with references preserved.
   */
  moveToWorkspace: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        targetWorkspaceId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Membership of the SOURCE workspace (also loads the product).
      const product = await loadProductWithAccess(ctx.db, userId, input.id);

      if (product.workspaceId === input.targetWorkspaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Product is already in this workspace",
        });
      }

      // Membership of the TARGET workspace (re-enforced server-side).
      await assertWorkspaceMember(ctx.db, userId, input.targetWorkspaceId);

      const targetWorkspace = await ctx.db.workspace.findUnique({
        where: { id: input.targetWorkspaceId },
        select: { slug: true },
      });
      if (!targetWorkspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target workspace not found",
        });
      }

      // Resolve a slug that's unique within the target workspace
      // (Product has @@unique([workspaceId, slug])).
      const existing = await ctx.db.product.findMany({
        where: {
          workspaceId: input.targetWorkspaceId,
          slug: { startsWith: product.slug },
        },
        select: { slug: true },
      });
      const taken = new Set(existing.map((p) => p.slug));
      let slug = product.slug;
      let suffix = 2;
      while (taken.has(slug)) {
        slug = `${product.slug}-${suffix}`;
        suffix += 1;
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { workspaceId: input.targetWorkspaceId, slug },
        });

        // Re-parent entities that have their own workspaceId but belong to the product.
        await tx.ticketTemplate.updateMany({
          where: { productId: product.id },
          data: { workspaceId: input.targetWorkspaceId },
        });
        await tx.retrospective.updateMany({
          where: { productId: product.id },
          data: { workspaceId: input.targetWorkspaceId },
        });

        // Bring along epics used exclusively by this product.
        const epicLinks = await tx.ticket.findMany({
          where: { productId: product.id, epicId: { not: null } },
          select: { epicId: true },
          distinct: ["epicId"],
        });
        const epicIds = epicLinks
          .map((t) => t.epicId)
          .filter((v): v is string => v !== null);

        if (epicIds.length > 0) {
          const [sharedByTickets, usedByActions] = await Promise.all([
            tx.ticket.findMany({
              where: { epicId: { in: epicIds }, productId: { not: product.id } },
              select: { epicId: true },
              distinct: ["epicId"],
            }),
            tx.action.findMany({
              where: { epicId: { in: epicIds } },
              select: { epicId: true },
              distinct: ["epicId"],
            }),
          ]);
          const shared = new Set<string>([
            ...sharedByTickets
              .map((t) => t.epicId)
              .filter((v): v is string => v !== null),
            ...usedByActions
              .map((a) => a.epicId)
              .filter((v): v is string => v !== null),
          ]);
          const exclusiveEpicIds = epicIds.filter((eid) => !shared.has(eid));

          if (exclusiveEpicIds.length > 0) {
            await tx.epic.updateMany({
              where: { id: { in: exclusiveEpicIds } },
              data: { workspaceId: input.targetWorkspaceId },
            });
          }
        }
      });

      return { slug, workspaceSlug: targetWorkspace.slug };
    }),

  // ── Dependency graph ──

  getDependencyGraph: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        includeCompleted: z.boolean().optional().default(false),
        includeForeign: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);
      return buildGraph(ctx.db, {
        productId: input.productId,
        includeCompleted: input.includeCompleted,
        includeForeign: input.includeForeign,
      });
    }),

  // ── View preferences (stored in PluginConfig.settings) ──

  getViewPrefs: protectedProcedure
    .input(z.object({ productSlug: z.string(), workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);
      const config = await ctx.db.pluginConfig.findUnique({
        where: {
          pluginId_workspaceId_userId: {
            pluginId: "product",
            workspaceId: input.workspaceId,
            userId: ctx.session.user.id,
          },
        },
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
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);
      const existing = await ctx.db.pluginConfig.findUnique({
        where: {
          pluginId_workspaceId_userId: {
            pluginId: "product",
            workspaceId: input.workspaceId,
            userId: ctx.session.user.id,
          },
        },
        select: { settings: true },
      });

      const currentSettings = (existing?.settings as Record<string, unknown>) ?? {};
      const currentViewPrefs = (currentSettings.viewPrefs as Record<string, unknown>) ?? {};
      const currentProductPrefs = (currentViewPrefs[input.productSlug] as Record<string, unknown>) ?? {};

      const merged = { ...currentProductPrefs, ...input.prefs };
      const newSettings = {
        ...currentSettings,
        viewPrefs: { ...currentViewPrefs, [input.productSlug]: merged },
      };

      return ctx.db.pluginConfig.upsert({
        where: {
          pluginId_workspaceId_userId: {
            pluginId: "product",
            workspaceId: input.workspaceId,
            userId: ctx.session.user.id,
          },
        },
        create: {
          pluginId: "product",
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
          enabled: true,
          settings: newSettings as Prisma.InputJsonValue,
        },
        update: {
          settings: newSettings as Prisma.InputJsonValue,
        },
      });
    }),
});
