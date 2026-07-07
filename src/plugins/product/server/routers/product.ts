import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import { buildProjectAccessWhere } from "~/server/services/access";
import type { PrismaClient, Prisma } from "@prisma/client";
import { buildGraph } from "../services/DependencyGraphService";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import {
  COMPLETED_TICKET_STATUSES,
  STATUS_ORDER,
} from "~/lib/ticket-statuses";

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

  /**
   * Single-round-trip aggregate for the product Overview tab: open-ticket
   * counts by status, the current cycle (resolved read-only — never
   * auto-creates or reconciles, unlike cycle.list) with this product's
   * in-cycle points/status rollup and the caller's own tickets, the
   * needs-attention lists (blocked / needs refinement / QA), demoted nav
   * counts, and the last few ticket activity events for this product.
   */
  getOverview: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const product = await loadProductWithAccess(
        ctx.db,
        userId,
        input.productId,
      );
      const now = new Date();

      const attentionStatuses = [
        "BLOCKED",
        "NEEDS_REFINEMENT",
        "QA",
      ] as const;

      const [statusGroups, navCounts, currentCycle, attentionTickets, rawEvents] =
        await Promise.all([
          ctx.db.ticket.groupBy({
            by: ["status"],
            where: { productId: input.productId },
            _count: { _all: true },
          }),
          ctx.db.product.findUnique({
            where: { id: input.productId },
            select: {
              _count: {
                select: {
                  features: true,
                  researches: true,
                  retrospectives: true,
                },
              },
            },
          }),
          // Read-only "current cycle": an ACTIVE sprint that hasn't ended, or
          // a PLANNED one whose window contains today (covers workspaces where
          // the lazy reconcile in cycle.list hasn't run yet).
          ctx.db.list.findFirst({
            where: {
              workspaceId: product.workspaceId,
              listType: "SPRINT",
              OR: [
                {
                  status: "ACTIVE",
                  OR: [{ endDate: null }, { endDate: { gt: now } }],
                },
                {
                  status: "PLANNED",
                  startDate: { lte: now },
                  endDate: { gt: now },
                },
                // Ended but never reconciled to COMPLETED — still the most
                // recent "current" cycle the team was burning down.
                { status: "ACTIVE", endDate: { lte: now } },
              ],
            },
            orderBy: { startDate: "desc" },
            select: {
              id: true,
              name: true,
              status: true,
              startDate: true,
              endDate: true,
            },
          }),
          ctx.db.ticket.findMany({
            where: {
              productId: input.productId,
              status: { in: [...attentionStatuses] },
            },
            select: {
              id: true,
              shortId: true,
              number: true,
              title: true,
              status: true,
              updatedAt: true,
            },
            // Oldest first — the longest-rotting work is the most urgent.
            orderBy: { updatedAt: "asc" },
          }),
          // Recent ticket events for the workspace; filtered to this product
          // below (events carry no productId, so we resolve via the ticket).
          ctx.db.workspaceActivityEvent.findMany({
            where: { workspaceId: product.workspaceId, entityType: "ticket" },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              entityId: true,
              action: true,
              metadata: true,
              createdAt: true,
              user: { select: { id: true, name: true, image: true } },
            },
          }),
        ]);

      // ---- current cycle rollup (scoped to this product's tickets) ----
      let cycle: {
        id: string;
        name: string;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        usesPoints: boolean;
        committed: number;
        completed: number;
        inProgress: number;
        statusCounts: { status: string; count: number }[];
        myTickets: {
          id: string;
          shortId: string | null;
          number: number;
          title: string;
          status: string;
        }[];
      } | null = null;

      if (currentCycle) {
        const cycleTickets = await ctx.db.ticket.findMany({
          where: { productId: input.productId, cycleId: currentCycle.id },
          select: {
            id: true,
            shortId: true,
            number: true,
            title: true,
            status: true,
            points: true,
            assigneeId: true,
          },
        });

        const completedSet = new Set<string>(COMPLETED_TICKET_STATUSES);
        const usesPoints = cycleTickets.some((t) => (t.points ?? 0) > 0);
        const weight = (t: { points: number | null }) =>
          usesPoints ? (t.points ?? 0) : 1;

        const committed = cycleTickets.reduce((s, t) => s + weight(t), 0);
        const completed = cycleTickets
          .filter((t) => completedSet.has(t.status))
          .reduce((s, t) => s + weight(t), 0);
        const inProgress = cycleTickets
          .filter((t) => t.status === "IN_PROGRESS")
          .reduce((s, t) => s + weight(t), 0);

        const cycleStatusCounts = new Map<string, number>();
        for (const t of cycleTickets) {
          cycleStatusCounts.set(
            t.status,
            (cycleStatusCounts.get(t.status) ?? 0) + 1,
          );
        }

        const statusRank = (s: string) => STATUS_ORDER[s] ?? 99;
        const myTickets = cycleTickets
          .filter((t) => t.assigneeId === userId)
          .sort((a, b) => statusRank(a.status) - statusRank(b.status))
          .slice(0, 4)
          .map(({ id, shortId, number, title, status }) => ({
            id,
            shortId,
            number,
            title,
            status,
          }));

        cycle = {
          id: currentCycle.id,
          name: currentCycle.name,
          status: currentCycle.status,
          startDate: currentCycle.startDate,
          endDate: currentCycle.endDate,
          usesPoints,
          committed,
          completed,
          inProgress,
          statusCounts: Array.from(cycleStatusCounts.entries())
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => statusRank(a.status) - statusRank(b.status)),
          myTickets,
        };
      }

      // ---- needs-attention groups (top items + full counts) ----
      const pickGroup = (status: (typeof attentionStatuses)[number]) => {
        const items = attentionTickets.filter((t) => t.status === status);
        return { count: items.length, items: items.slice(0, 5) };
      };

      // ---- recent activity, resolved to this product's tickets ----
      const eventTicketIds = [...new Set(rawEvents.map((e) => e.entityId))];
      const eventTickets = eventTicketIds.length
        ? await ctx.db.ticket.findMany({
            where: {
              id: { in: eventTicketIds },
              productId: input.productId,
            },
            select: { id: true, shortId: true, number: true, title: true },
          })
        : [];
      const ticketById = new Map(eventTickets.map((t) => [t.id, t]));
      const activity = rawEvents
        .filter((e) => ticketById.has(e.entityId))
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          action: e.action,
          metadata: e.metadata,
          createdAt: e.createdAt,
          actor: e.user,
          ticket: ticketById.get(e.entityId)!,
        }));

      return {
        statusCounts: statusGroups.map((g) => ({
          status: g.status,
          count: g._count._all,
        })),
        counts: {
          features: navCounts?._count.features ?? 0,
          researches: navCounts?._count.researches ?? 0,
          retrospectives: navCounts?._count.retrospectives ?? 0,
        },
        cycle,
        attention: {
          blocked: pickGroup("BLOCKED"),
          needsRefinement: pickGroup("NEEDS_REFINEMENT"),
          qa: pickGroup("QA"),
        },
        activity,
      };
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
        slug: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Slug must be kebab-case")
          .optional(),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        icon: boundedText("Icon", 60).optional(),
        color: boundedText("Color", 60).optional(),
        funTicketIds: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const product = await loadProductWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.id,
      );

      const { id, ...data } = input;

      // If the slug is changing, ensure it stays unique within the workspace
      // (Product has @@unique([workspaceId, slug])).
      if (data.slug && data.slug !== product.slug) {
        const clash = await ctx.db.product.findUnique({
          where: {
            workspaceId_slug: {
              workspaceId: product.workspaceId,
              slug: data.slug,
            },
          },
          select: { id: true },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Another product in this workspace already uses that slug",
          });
        }
      }

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
