import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Context } from "~/server/auth/types";
import { verifyGoalAccess } from "~/server/services/goalService";

// Polymorphic favourites. v1 wires "objective" and "keyResult"; the model is
// deliberately extensible to projects/meetings later.
const entityTypeEnum = z.enum(["objective", "keyResult"]);
type EntityType = z.infer<typeof entityTypeEnum>;

/**
 * Verify the user may favourite this entity and return the entity's
 * workspaceId (captured on the Favorite row for workspace-scoped surfaces).
 * Objectives use goal access (owner / DRI / workspace member); key results use
 * ownership, matching how the KR drawer already gates reads.
 */
async function resolveEntityWorkspace(
  ctx: Context,
  entityType: EntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === "objective") {
    const goalId = Number(entityId);
    if (!Number.isInteger(goalId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid objective id" });
    }
    const goal = await verifyGoalAccess({ ctx, goalId });
    return goal.workspaceId ?? null;
  }

  const kr = await ctx.db.keyResult.findFirst({
    where: { id: entityId, userId: ctx.session!.user.id },
    select: { workspaceId: true },
  });
  if (!kr) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Key result not found" });
  }
  return kr.workspaceId ?? null;
}

export const favoriteRouter = createTRPCRouter({
  // Whether the current user has favourited a given entity.
  isFavorite: protectedProcedure
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fav = await ctx.db.favorite.findUnique({
        where: {
          userId_entityType_entityId: {
            userId: ctx.session.user.id,
            entityType: input.entityType,
            entityId: input.entityId,
          },
        },
        select: { id: true },
      });
      return { favorited: fav !== null };
    }),

  // Toggle a favourite for the current user + entity. Captures the entity's
  // workspaceId on create so the sidebar can scope by workspace.
  toggle: protectedProcedure
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db.favorite.findUnique({
        where: {
          userId_entityType_entityId: {
            userId,
            entityType: input.entityType,
            entityId: input.entityId,
          },
        },
        select: { id: true },
      });

      if (existing) {
        await ctx.db.favorite.delete({ where: { id: existing.id } });
        return { favorited: false };
      }

      const workspaceId = await resolveEntityWorkspace(
        ctx,
        input.entityType,
        input.entityId,
      );
      await ctx.db.favorite.create({
        data: {
          userId,
          entityType: input.entityType,
          entityId: input.entityId,
          workspaceId,
        },
      });
      return { favorited: true };
    }),
});
