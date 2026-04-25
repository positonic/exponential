import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { verifyGoalAccess } from "~/server/services/goalService";

interface ActivityAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

export interface GoalActivityReply {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: ActivityAuthor;
}

export interface GoalActivityComment {
  type: "comment";
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: ActivityAuthor;
}

export interface GoalActivityUpdate {
  type: "update";
  id: string;
  content: string;
  health: string;
  createdAt: Date;
  updatedAt: Date;
  author: ActivityAuthor;
  replies: GoalActivityReply[];
}

export type GoalActivityItem = GoalActivityComment | GoalActivityUpdate;

export const goalActivityRouter = createTRPCRouter({
  getFeed: protectedProcedure
    .input(z.object({ goalId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.goalId });

      const [comments, updates] = await Promise.all([
        // Only fetch top-level comments (no parentUpdateId)
        ctx.db.goalComment.findMany({
          where: { goalId: input.goalId, parentUpdateId: null },
          include: {
            author: { select: { id: true, name: true, image: true } },
          },
        }),
        // Fetch updates WITH their replies
        ctx.db.goalUpdate.findMany({
          where: { goalId: input.goalId },
          include: {
            author: { select: { id: true, name: true, image: true } },
            replies: {
              include: {
                author: { select: { id: true, name: true, image: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        }),
      ]);

      const feed: GoalActivityItem[] = [
        ...comments.map(
          (c): GoalActivityComment => ({
            type: "comment",
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            author: c.author,
          }),
        ),
        ...updates.map(
          (u): GoalActivityUpdate => ({
            type: "update",
            id: u.id,
            content: u.content,
            health: u.health,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
            author: u.author,
            replies: u.replies.map((r) => ({
              id: r.id,
              content: r.content,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              author: r.author,
            })),
          }),
        ),
      ];

      // Sort newest first
      feed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return feed;
    }),

  getCount: protectedProcedure
    .input(z.object({ goalId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.goalId });

      const [commentCount, updateCount] = await Promise.all([
        ctx.db.goalComment.count({
          where: { goalId: input.goalId, parentUpdateId: null },
        }),
        ctx.db.goalUpdate.count({ where: { goalId: input.goalId } }),
      ]);

      return commentCount + updateCount;
    }),
});
