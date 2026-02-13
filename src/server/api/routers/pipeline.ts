import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { slugify } from "~/utils/slugify";

const DEFAULT_STAGES = [
  { name: "Lead", color: "gray", order: 0, type: "active" },
  { name: "Qualified", color: "blue", order: 1, type: "active" },
  { name: "Proposal", color: "violet", order: 2, type: "active" },
  { name: "Negotiation", color: "orange", order: 3, type: "active" },
  { name: "Won", color: "green", order: 4, type: "won" },
  { name: "Lost", color: "red", order: 5, type: "lost" },
] as const;

export const pipelineRouter = createTRPCRouter({
  // ─── Pipeline (Project) management ──────────────────────────

  getOrCreate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Look for existing pipeline project in this workspace
      const existing = await ctx.db.project.findFirst({
        where: {
          workspaceId: input.workspaceId,
          type: "pipeline",
        },
        include: {
          pipelineStages: {
            orderBy: { order: "asc" },
          },
        },
      });

      if (existing) return existing;

      // Create a new pipeline project with default stages
      const baseSlug = slugify("Pipeline");
      let slug = baseSlug;
      let counter = 1;
      while (await ctx.db.project.findFirst({ where: { slug } })) {
        slug = `${baseSlug}_${counter}`;
        counter++;
      }

      const pipeline = await ctx.db.project.create({
        data: {
          name: "Pipeline",
          slug,
          type: "pipeline",
          status: "ACTIVE",
          priority: "NONE",
          createdById: ctx.session.user.id,
          workspaceId: input.workspaceId,
          pipelineStages: {
            create: DEFAULT_STAGES.map((stage) => ({
              name: stage.name,
              color: stage.color,
              order: stage.order,
              type: stage.type,
            })),
          },
        },
        include: {
          pipelineStages: {
            orderBy: { order: "asc" },
          },
        },
      });

      return pipeline;
    }),

  update: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.update({
        where: { id: input.projectId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
        },
      });
    }),

  // ─── Stage management ──────────────────────────────────────

  getStages: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.pipelineStage.findMany({
        where: { projectId: input.projectId },
        orderBy: { order: "asc" },
        include: {
          _count: { select: { deals: true } },
        },
      });
    }),

  createStage: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        color: z.string().default("blue"),
        type: z.enum(["active", "won", "lost"]).default("active"),
        order: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Shift existing stages at or after the target order
      await ctx.db.pipelineStage.updateMany({
        where: {
          projectId: input.projectId,
          order: { gte: input.order },
        },
        data: {
          order: { increment: 1 },
        },
      });

      return ctx.db.pipelineStage.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          color: input.color,
          type: input.type,
          order: input.order,
        },
      });
    }),

  updateStage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        type: z.enum(["active", "won", "lost"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.pipelineStage.update({
        where: { id },
        data,
      });
    }),

  reorderStages: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        stages: z.array(
          z.object({
            id: z.string(),
            order: z.number().int().min(0),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Use a transaction to update all stage orders atomically
      // First set all to negative to avoid unique constraint conflicts
      await ctx.db.$transaction([
        // Temporarily set all orders to negative (avoid unique constraint)
        ...input.stages.map((stage, i) =>
          ctx.db.pipelineStage.update({
            where: { id: stage.id },
            data: { order: -(i + 1) },
          }),
        ),
        // Then set to actual target orders
        ...input.stages.map((stage) =>
          ctx.db.pipelineStage.update({
            where: { id: stage.id },
            data: { order: stage.order },
          }),
        ),
      ]);

      return ctx.db.pipelineStage.findMany({
        where: { projectId: input.projectId },
        orderBy: { order: "asc" },
      });
    }),

  deleteStage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        moveDealsToStageId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const stage = await ctx.db.pipelineStage.findUniqueOrThrow({
        where: { id: input.id },
        include: { _count: { select: { deals: true } } },
      });

      if (stage._count.deals > 0 && !input.moveDealsToStageId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stage has deals. Provide moveDealsToStageId to move them first.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        // Move deals if needed
        if (input.moveDealsToStageId && stage._count.deals > 0) {
          await tx.deal.updateMany({
            where: { stageId: input.id },
            data: { stageId: input.moveDealsToStageId },
          });
        }

        // Delete the stage
        await tx.pipelineStage.delete({ where: { id: input.id } });

        // Reorder remaining stages to close the gap
        const remaining = await tx.pipelineStage.findMany({
          where: { projectId: stage.projectId },
          orderBy: { order: "asc" },
        });

        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i]!.order !== i) {
            await tx.pipelineStage.update({
              where: { id: remaining[i]!.id },
              data: { order: i },
            });
          }
        }
      });
    }),

  // ─── Deal CRUD ─────────────────────────────────────────────

  getDeals: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.deal.findMany({
        where: { projectId: input.projectId },
        orderBy: [{ stageOrder: "asc" }, { createdAt: "asc" }],
        include: {
          stage: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });
    }),

  getDeal: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.deal.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          stage: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              organizationId: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
          activities: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              user: {
                select: { id: true, name: true, image: true },
              },
            },
          },
        },
      });
    }),

  createDeal: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        stageId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        value: z.number().min(0).optional(),
        currency: z.string().default("USD"),
        probability: z.number().int().min(0).max(100).optional(),
        expectedCloseDate: z.date().optional(),
        contactId: z.string().optional(),
        organizationId: z.string().optional(),
        assignedToId: z.string().optional(),
        workspaceId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the max stageOrder for positioning at the end
      const lastDeal = await ctx.db.deal.findFirst({
        where: { projectId: input.projectId, stageId: input.stageId },
        orderBy: { stageOrder: "desc" },
        select: { stageOrder: true },
      });
      const stageOrder = (lastDeal?.stageOrder ?? -1) + 1;

      const deal = await ctx.db.deal.create({
        data: {
          projectId: input.projectId,
          stageId: input.stageId,
          title: input.title,
          description: input.description,
          value: input.value,
          currency: input.currency,
          probability: input.probability,
          expectedCloseDate: input.expectedCloseDate,
          contactId: input.contactId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          assignedToId: input.assignedToId,
          stageOrder,
        },
        include: {
          stage: true,
          contact: {
            select: { id: true, firstName: true, lastName: true },
          },
          organization: {
            select: { id: true, name: true },
          },
        },
      });

      // Create activity log
      await ctx.db.dealActivity.create({
        data: {
          dealId: deal.id,
          userId: ctx.session.user.id,
          type: "CREATED",
          content: `Deal "${deal.title}" created in ${deal.stage.name}`,
          metadata: { stageId: deal.stageId, stageName: deal.stage.name },
        },
      });

      return deal;
    }),

  updateDeal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        value: z.number().min(0).nullable().optional(),
        currency: z.string().optional(),
        probability: z.number().int().min(0).max(100).nullable().optional(),
        expectedCloseDate: z.date().nullable().optional(),
        contactId: z.string().nullable().optional(),
        organizationId: z.string().nullable().optional(),
        assignedToId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const oldDeal = await ctx.db.deal.findUniqueOrThrow({
        where: { id },
        select: { value: true },
      });

      const deal = await ctx.db.deal.update({
        where: { id },
        data,
        include: {
          stage: true,
          contact: {
            select: { id: true, firstName: true, lastName: true },
          },
          organization: {
            select: { id: true, name: true },
          },
        },
      });

      // Log value changes
      if (input.value !== undefined && oldDeal.value !== input.value) {
        await ctx.db.dealActivity.create({
          data: {
            dealId: deal.id,
            userId: ctx.session.user.id,
            type: "VALUE_CHANGE",
            content: `Value changed from ${oldDeal.value ?? 0} to ${input.value ?? 0}`,
            metadata: {
              oldValue: oldDeal.value,
              newValue: input.value,
            },
          },
        });
      }

      return deal;
    }),

  moveDeal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        stageId: z.string(),
        stageOrder: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const oldDeal = await ctx.db.deal.findUniqueOrThrow({
        where: { id: input.id },
        include: { stage: true },
      });

      const newStage = await ctx.db.pipelineStage.findUniqueOrThrow({
        where: { id: input.stageId },
      });

      const isStageChange = oldDeal.stageId !== input.stageId;
      const isTerminal = newStage.type === "won" || newStage.type === "lost";

      const deal = await ctx.db.deal.update({
        where: { id: input.id },
        data: {
          stageId: input.stageId,
          stageOrder: input.stageOrder,
          ...(isTerminal && !oldDeal.closedAt ? { closedAt: new Date() } : {}),
          // Clear closedAt if moving back to an active stage
          ...(!isTerminal && oldDeal.closedAt ? { closedAt: null } : {}),
        },
        include: {
          stage: true,
        },
      });

      // Log stage change
      if (isStageChange) {
        await ctx.db.dealActivity.create({
          data: {
            dealId: deal.id,
            userId: ctx.session.user.id,
            type: isTerminal ? "CLOSED" : "STAGE_CHANGE",
            content: `Moved from ${oldDeal.stage.name} to ${newStage.name}`,
            metadata: {
              fromStageId: oldDeal.stageId,
              fromStageName: oldDeal.stage.name,
              toStageId: input.stageId,
              toStageName: newStage.name,
            },
          },
        });
      }

      return deal;
    }),

  reorderDeal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        stageOrder: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.deal.update({
        where: { id: input.id },
        data: { stageOrder: input.stageOrder },
      });
    }),

  deleteDeal: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.deal.delete({ where: { id: input.id } });
    }),

  // ─── Activity ──────────────────────────────────────────────

  getDealActivities: protectedProcedure
    .input(
      z.object({
        dealId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const activities = await ctx.db.dealActivity.findMany({
        where: { dealId: input.dealId },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (activities.length > input.limit) {
        const next = activities.pop();
        nextCursor = next?.id;
      }

      return { activities, nextCursor };
    }),

  addNote: protectedProcedure
    .input(
      z.object({
        dealId: z.string(),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.dealActivity.create({
        data: {
          dealId: input.dealId,
          userId: ctx.session.user.id,
          type: "NOTE",
          content: input.content,
        },
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      });
    }),

  // ─── Stats ─────────────────────────────────────────────────

  getStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const deals = await ctx.db.deal.findMany({
        where: { projectId: input.projectId },
        select: {
          value: true,
          probability: true,
          stageId: true,
          closedAt: true,
          stage: {
            select: { type: true, name: true },
          },
        },
      });

      const totalDeals = deals.length;
      const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
      const weightedValue = deals.reduce(
        (sum, d) => sum + (d.value ?? 0) * ((d.probability ?? 0) / 100),
        0,
      );

      const openDeals = deals.filter((d) => d.stage.type === "active");
      const wonDeals = deals.filter((d) => d.stage.type === "won");
      const lostDeals = deals.filter((d) => d.stage.type === "lost");

      const wonValue = wonDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
      const closedDeals = wonDeals.length + lostDeals.length;
      const conversionRate = closedDeals > 0 ? wonDeals.length / closedDeals : 0;

      // Group by stage
      const byStage = new Map<string, { count: number; value: number; name: string }>();
      for (const deal of deals) {
        const existing = byStage.get(deal.stageId) ?? { count: 0, value: 0, name: deal.stage.name };
        existing.count++;
        existing.value += deal.value ?? 0;
        byStage.set(deal.stageId, existing);
      }

      return {
        totalDeals,
        totalValue,
        weightedValue,
        openDeals: openDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
        wonValue,
        conversionRate,
        byStage: Object.fromEntries(byStage),
      };
    }),
});
