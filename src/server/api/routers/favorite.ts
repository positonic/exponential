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

interface FavoriteListItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  workspaceId: string | null;
}

export const favoriteRouter = createTRPCRouter({
  // The current user's favourites, optionally scoped to a workspace (the
  // sidebar passes the active workspace). Titles are resolved per entity type;
  // favourites whose target no longer exists are skipped (stale rows).
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().nullish() }).optional())
    .query(async ({ ctx, input }): Promise<FavoriteListItem[]> => {
      const userId = ctx.session.user.id;
      const favorites = await ctx.db.favorite.findMany({
        where: {
          userId,
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      const objectiveIds = favorites
        .filter((f) => f.entityType === "objective")
        .map((f) => Number(f.entityId))
        .filter((n) => Number.isInteger(n));
      const keyResultIds = favorites
        .filter((f) => f.entityType === "keyResult")
        .map((f) => f.entityId);

      const [goals, keyResults] = await Promise.all([
        objectiveIds.length
          ? ctx.db.goal.findMany({
              where: { id: { in: objectiveIds } },
              select: { id: true, title: true },
            })
          : Promise.resolve([]),
        keyResultIds.length
          ? ctx.db.keyResult.findMany({
              where: { id: { in: keyResultIds } },
              select: { id: true, title: true },
            })
          : Promise.resolve([]),
      ]);

      const goalTitle = new Map(goals.map((g) => [String(g.id), g.title]));
      const krTitle = new Map(keyResults.map((k) => [k.id, k.title]));

      const items: FavoriteListItem[] = [];
      for (const f of favorites) {
        const entityType = f.entityType as EntityType;
        const title =
          entityType === "objective"
            ? goalTitle.get(f.entityId)
            : krTitle.get(f.entityId);
        if (!title) continue; // target deleted — skip stale favourite
        items.push({
          id: f.id,
          entityType,
          entityId: f.entityId,
          title,
          workspaceId: f.workspaceId,
        });
      }
      return items;
    }),

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
