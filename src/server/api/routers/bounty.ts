import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

/**
 * Public bounty board endpoints.
 * All queries are unauthenticated — only expose data from
 * public projects and never leak private user details.
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
});
