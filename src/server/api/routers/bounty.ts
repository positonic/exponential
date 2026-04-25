import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

/**
 * Bounty board endpoints.
 * Public queries are unauthenticated — only expose data from
 * public projects and never leak private user details.
 * Protected mutations require authentication for claim lifecycle.
 */
export const bountyRouter = createTRPCRouter({
  /**
   * List open bounties from public projects.
   * Supports pagination, filtering by difficulty/skills/project.
   */
  listPublic: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
          cursor: z.string().nullish(),
          difficulty: z.string().optional(),
          skills: z.array(z.string()).optional(),
          projectId: z.string().optional(),
          status: z
            .enum(["OPEN", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "CANCELLED"])
            .optional()
            .default("OPEN"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const cursor = input?.cursor;
      const status = input?.status ?? "OPEN";

      const bounties = await ctx.db.action.findMany({
        where: {
          isBounty: true,
          bountyStatus: status,
          project: { isPublic: true },
          ...(input?.difficulty ? { bountyDifficulty: input.difficulty } : {}),
          ...(input?.projectId ? { projectId: input.projectId } : {}),
          ...(input?.skills?.length
            ? { bountySkills: { hasSome: input.skills } }
            : {}),
        },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          bountyAmount: true,
          bountyToken: true,
          bountyStatus: true,
          bountyDifficulty: true,
          bountySkills: true,
          bountyDeadline: true,
          bountyMaxClaimants: true,
          bountyExternalUrl: true,
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: { bountyClaims: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (bounties.length > limit) {
        const nextItem = bounties.pop();
        nextCursor = nextItem?.id;
      }

      return { bounties, nextCursor };
    }),

  /**
   * Get a single bounty by ID (must be on a public project).
   */
  getPublic: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const bounty = await ctx.db.action.findFirst({
        where: {
          id: input.id,
          isBounty: true,
          project: { isPublic: true },
        },
        select: {
          id: true,
          name: true,
          description: true,
          bountyAmount: true,
          bountyToken: true,
          bountyStatus: true,
          bountyDifficulty: true,
          bountySkills: true,
          bountyDeadline: true,
          bountyMaxClaimants: true,
          bountyExternalUrl: true,
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
          bountyClaims: {
            where: {
              status: { in: ["ACTIVE", "SUBMITTED"] },
            },
            select: {
              id: true,
              status: true,
              claimedAt: true,
              claimant: {
                select: {
                  id: true,
                  displayName: true,
                  image: true,
                },
              },
            },
          },
          _count: {
            select: { bountyClaims: true },
          },
        },
      });

      return bounty;
    }),

  /**
   * List public projects that have open bounties.
   */
  listPublicProjects: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(20),
          cursor: z.string().nullish(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const cursor = input?.cursor;

      const projects = await ctx.db.project.findMany({
        where: {
          isPublic: true,
          actions: {
            some: {
              isBounty: true,
              bountyStatus: "OPEN",
            },
          },
        },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              actions: {
                where: {
                  isBounty: true,
                  bountyStatus: "OPEN",
                },
              },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (projects.length > limit) {
        const nextItem = projects.pop();
        nextCursor = nextItem?.id;
      }

      return { projects, nextCursor };
    }),

  /**
   * Get a public project with its bounties.
   */
  getPublicProject: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: {
          slug: input.slug,
          isPublic: true,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          progress: true,
          createdAt: true,
          actions: {
            where: { isBounty: true },
            orderBy: { id: "desc" },
            select: {
              id: true,
              name: true,
              description: true,
              bountyAmount: true,
              bountyToken: true,
              bountyStatus: true,
              bountyDifficulty: true,
              bountySkills: true,
              bountyDeadline: true,
              bountyMaxClaimants: true,
              _count: {
                select: { bountyClaims: true },
              },
            },
          },
        },
      });

      return project;
    }),

  // ─── Protected Procedures (Claim Lifecycle) ──────────────────────

  /**
   * Claim a bounty. Creates a BountyClaim for the authenticated user.
   */
  claim: protectedProcedure
    .input(z.object({ bountyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const bounty = await ctx.db.action.findFirst({
        where: {
          id: input.bountyId,
          isBounty: true,
          project: { isPublic: true },
        },
        select: {
          id: true,
          bountyStatus: true,
          bountyDeadline: true,
          bountyMaxClaimants: true,
        },
      });

      if (!bounty) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bounty not found" });
      }
      if (bounty.bountyStatus !== "OPEN" && bounty.bountyStatus !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bounty is not open for claims" });
      }
      if (bounty.bountyDeadline && new Date() > bounty.bountyDeadline) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bounty deadline has passed" });
      }

      // Check max claimants (only count non-terminal claims)
      const activeClaimCount = await ctx.db.bountyClaim.count({
        where: { actionId: input.bountyId, status: { in: ["ACTIVE", "SUBMITTED"] } },
      });
      if (activeClaimCount >= bounty.bountyMaxClaimants) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum claimants reached" });
      }

      // Check for existing claim
      const existingClaim = await ctx.db.bountyClaim.findUnique({
        where: { actionId_claimantId: { actionId: input.bountyId, claimantId: userId } },
      });

      if (existingClaim && existingClaim.status !== "WITHDRAWN" && existingClaim.status !== "REJECTED") {
        throw new TRPCError({ code: "CONFLICT", message: "You have already claimed this bounty" });
      }

      // Create or re-activate claim
      const claim = existingClaim
        ? await ctx.db.bountyClaim.update({
            where: { id: existingClaim.id },
            data: {
              status: "ACTIVE",
              claimedAt: new Date(),
              submissionUrl: null,
              submissionNotes: null,
              reviewNotes: null,
              submittedAt: null,
              reviewedAt: null,
            },
          })
        : await ctx.db.bountyClaim.create({
            data: { actionId: input.bountyId, claimantId: userId },
          });

      // Update bounty status to IN_PROGRESS
      if (bounty.bountyStatus === "OPEN") {
        await ctx.db.action.update({
          where: { id: input.bountyId },
          data: { bountyStatus: "IN_PROGRESS" },
        });
      }

      return claim;
    }),

  /**
   * Submit work for a claim.
   */
  submit: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        submissionUrl: z.string().url().optional(),
        submissionNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.bountyClaim.findFirst({
        where: { id: input.claimId, claimantId: ctx.session.user.id },
      });
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (claim.status !== "ACTIVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only active claims can be submitted" });
      }

      const updated = await ctx.db.bountyClaim.update({
        where: { id: input.claimId },
        data: {
          status: "SUBMITTED",
          submissionUrl: input.submissionUrl,
          submissionNotes: input.submissionNotes,
          submittedAt: new Date(),
        },
      });

      // Update bounty status to IN_REVIEW
      await ctx.db.action.update({
        where: { id: claim.actionId },
        data: { bountyStatus: "IN_REVIEW" },
      });

      return updated;
    }),

  /**
   * Approve a submitted claim. Only the project owner can approve.
   */
  approve: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.bountyClaim.findFirst({
        where: { id: input.claimId },
        include: { action: { include: { project: true } } },
      });
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (claim.status !== "SUBMITTED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted claims can be approved" });
      }
      if (claim.action.project?.createdById !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the project owner can approve claims" });
      }

      const updated = await ctx.db.bountyClaim.update({
        where: { id: input.claimId },
        data: {
          status: "APPROVED",
          reviewNotes: input.reviewNotes,
          reviewedAt: new Date(),
        },
      });

      // Check if bounty should be completed
      const approvedCount = await ctx.db.bountyClaim.count({
        where: { actionId: claim.actionId, status: "APPROVED" },
      });
      if (approvedCount >= claim.action.bountyMaxClaimants) {
        await ctx.db.action.update({
          where: { id: claim.actionId },
          data: { bountyStatus: "COMPLETED" },
        });
      }

      return updated;
    }),

  /**
   * Reject a submitted claim. Only the project owner can reject.
   */
  reject: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.bountyClaim.findFirst({
        where: { id: input.claimId },
        include: { action: { include: { project: true } } },
      });
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (claim.status !== "SUBMITTED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted claims can be rejected" });
      }
      if (claim.action.project?.createdById !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the project owner can reject claims" });
      }

      return ctx.db.bountyClaim.update({
        where: { id: input.claimId },
        data: {
          status: "REJECTED",
          reviewNotes: input.reviewNotes,
          reviewedAt: new Date(),
        },
      });
    }),

  /**
   * Withdraw a claim. Only the claimant can withdraw.
   */
  withdraw: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.bountyClaim.findFirst({
        where: { id: input.claimId, claimantId: ctx.session.user.id },
      });
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (claim.status !== "ACTIVE" && claim.status !== "SUBMITTED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only active or submitted claims can be withdrawn" });
      }

      return ctx.db.bountyClaim.update({
        where: { id: input.claimId },
        data: { status: "WITHDRAWN" },
      });
    }),

  /**
   * Get the authenticated user's claim for a specific bounty.
   */
  getMyClaimForBounty: protectedProcedure
    .input(z.object({ bountyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.bountyClaim.findUnique({
        where: {
          actionId_claimantId: {
            actionId: input.bountyId,
            claimantId: ctx.session.user.id,
          },
        },
      });
    }),
});
