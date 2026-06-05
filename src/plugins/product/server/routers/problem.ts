import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";

const problemStageEnum = z.enum(["IDEA", "QUALIFIED", "PRIORITISED"]);

// impact/confidence are the two prioritisation axes, scored 1–5.
const scoreSchema = z.number().int().min(1).max(5);

/**
 * Load a problem and verify the caller is a member of its product's workspace.
 * Mirrors `loadInsightWithAccess`.
 */
async function loadProblemWithAccess(
  db: PrismaClient,
  userId: string,
  problemId: string,
) {
  const problem = await db.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      productId: true,
      product: { select: { workspaceId: true } },
    },
  });
  if (!problem) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found" });
  }
  await assertWorkspaceMember(db, userId, problem.product.workspaceId);
  return problem;
}

export const problemRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        stage: problemStageEnum.optional(),
        category: z.string().optional(),
        // Parked items are hidden by default — parked-ness is independent of
        // stage (a Problem keeps its stage while parked). Pass true to include
        // them (the table's "Show parked" toggle and the board's Parked lane).
        includeParked: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.problem.findMany({
        where: {
          productId: input.productId,
          ...(input.stage ? { stage: input.stage } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.includeParked ? {} : { parkedAt: null }),
        },
        orderBy: [{ createdAt: "desc" }],
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
          approaches: {
            include: {
              project: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });
    }),

  /**
   * The product's own Projects, used to populate the Approach picker. Scoped to
   * the product (and therefore its workspace, ADR-0003) — a bounded list.
   */
  productProjects: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);
      return ctx.db.project.findMany({
        where: { productId: input.productId },
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: "asc" }],
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const problem = await ctx.db.problem.findUnique({
        where: { id: input.id },
        include: {
          product: {
            select: { id: true, slug: true, workspaceId: true, name: true },
          },
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });
      if (!problem) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        problem.product.workspaceId,
      );
      return problem;
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        title: boundedText("Title", 500, { min: 1 }),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        evidence: boundedText("Evidence", TEXT_LIMITS.LARGE).optional(),
        category: boundedText("Category", TEXT_LIMITS.LABEL).optional(),
        impact: scoreSchema.optional(),
        confidence: scoreSchema.optional(),
        stage: problemStageEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.problem.create({
        data: {
          productId: input.productId,
          title: input.title,
          description: input.description,
          evidence: input.evidence,
          category: input.category,
          impact: input.impact,
          confidence: input.confidence,
          stage: input.stage ?? "IDEA",
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: boundedText("Title", 500, { min: 1 }).optional(),
        description: boundedText("Description", TEXT_LIMITS.LARGE)
          .nullable()
          .optional(),
        evidence: boundedText("Evidence", TEXT_LIMITS.LARGE)
          .nullable()
          .optional(),
        category: boundedText("Category", TEXT_LIMITS.LABEL)
          .nullable()
          .optional(),
        impact: scoreSchema.nullable().optional(),
        confidence: scoreSchema.nullable().optional(),
        stage: problemStageEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProblemWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.problem.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadProblemWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.problem.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── Parking ───────────────────────────────────────────────────────────
  // An item that didn't pass its gate is set aside WITH A REASON, never
  // deleted — and can be revived later at the stage it left. Parked-ness is
  // independent of `stage` (it is NOT a status value).

  park: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        reason: boundedText("Reason", TEXT_LIMITS.MEDIUM, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProblemWithAccess(ctx.db, ctx.session.user.id, input.id);
      return ctx.db.problem.update({
        where: { id: input.id },
        data: { parkedAt: new Date(), parkReason: input.reason },
      });
    }),

  unpark: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadProblemWithAccess(ctx.db, ctx.session.user.id, input.id);
      // Clearing parkedAt/parkReason restores the item at its prior stage,
      // which was never touched while parked.
      return ctx.db.problem.update({
        where: { id: input.id },
        data: { parkedAt: null, parkReason: null },
      });
    }),

  // ── Approaches (Problem ↔ Project links) ──────────────────────────────
  // Forward direction only in v1: on a Problem, pick the Projects (Approaches)
  // that tackle it. Links existing Projects only — never creates a Project.

  linkProject: protectedProcedure
    .input(z.object({ problemId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const problem = await loadProblemWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.problemId,
      );
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, productId: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      if (project.productId !== problem.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project does not belong to this problem's product",
        });
      }
      await ctx.db.problemApproach.upsert({
        where: {
          problemId_projectId: {
            problemId: input.problemId,
            projectId: input.projectId,
          },
        },
        create: { problemId: input.problemId, projectId: input.projectId },
        update: {},
      });
      return { success: true };
    }),

  unlinkProject: protectedProcedure
    .input(z.object({ problemId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadProblemWithAccess(ctx.db, ctx.session.user.id, input.problemId);
      await ctx.db.problemApproach.deleteMany({
        where: { problemId: input.problemId, projectId: input.projectId },
      });
      return { success: true };
    }),

  /** Replace the full set of Projects (Approaches) linked to a Problem. */
  setProjects: protectedProcedure
    .input(z.object({ problemId: z.string(), projectIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const problem = await loadProblemWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.problemId,
      );
      const uniqueProjectIds = [...new Set(input.projectIds)];
      await ctx.db.$transaction(async (tx) => {
        if (uniqueProjectIds.length > 0) {
          const validProjects = await tx.project.findMany({
            where: { id: { in: uniqueProjectIds }, productId: problem.productId },
            select: { id: true },
          });
          if (validProjects.length !== uniqueProjectIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "One or more projects do not belong to this problem's product",
            });
          }
        }
        await tx.problemApproach.deleteMany({
          where: { problemId: input.problemId },
        });
        await tx.problemApproach.createMany({
          data: uniqueProjectIds.map((projectId) => ({
            problemId: input.problemId,
            projectId,
          })),
          skipDuplicates: true,
        });
      });
      return { success: true };
    }),
});
