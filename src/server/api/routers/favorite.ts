import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Context } from "~/server/auth/types";
import { verifyGoalAccess } from "~/server/services/goalService";
import { getWorkspaceMembership } from "~/server/services/access";

// Polymorphic favourites. Wires "objective" and "keyResult" (entity favourites,
// titles resolved live) plus "page" — a generic bookmark of any workspace page
// whose `entityId` is the workspace-relative path and whose label/icon are
// snapshotted at favourite time. The model stays deliberately extensible.
const entityTypeEnum = z.enum(["objective", "keyResult", "page"]);
type EntityType = z.infer<typeof entityTypeEnum>;

/**
 * Verify the user may favourite this entity and return the entity's
 * workspaceId (captured on the Favorite row for workspace-scoped surfaces).
 * Objectives use goal access (owner / DRI / workspace member); key results use
 * ownership, matching how the KR drawer already gates reads.
 *
 * NB: "page" favourites are NOT handled here — they carry their own workspaceId
 * input and are gated by workspace membership in `toggle`.
 */
async function resolveEntityWorkspace(
  ctx: Context,
  entityType: Exclude<EntityType, "page">,
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
  icon: string | null;
  workspaceId: string | null;
}

export const favoriteRouter = createTRPCRouter({
  // The current user's favourites, optionally scoped to a workspace (the
  // sidebar passes the active workspace). Entity titles are resolved per type;
  // page titles come from the snapshot label. Favourites whose target no longer
  // exists are skipped (stale rows) — pages, being plain paths, never go stale.
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
        let title: string | undefined;
        if (entityType === "objective") {
          title = goalTitle.get(f.entityId);
        } else if (entityType === "keyResult") {
          title = krTitle.get(f.entityId);
        } else {
          // page — snapshot label, falling back to the path if somehow unset
          title = f.label ?? f.entityId;
        }
        if (!title) continue; // entity target deleted — skip stale favourite
        items.push({
          id: f.id,
          entityType,
          entityId: f.entityId,
          title,
          icon: f.icon,
          workspaceId: f.workspaceId,
        });
      }
      return items;
    }),

  // Whether the current user has favourited a given entity (or page path).
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

  // Toggle a favourite for the current user + entity/page. For entity types the
  // workspaceId is resolved (and access gated) from the entity. For "page" the
  // caller supplies workspaceId + label (+ optional icon); access is gated by
  // workspace membership and the label/icon are snapshotted onto the row.
  toggle: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeEnum,
        entityId: z.string(),
        label: z.string().nullish(),
        icon: z.string().nullish(),
        workspaceId: z.string().nullish(),
      }),
    )
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

      if (input.entityType === "page") {
        if (!input.workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "workspaceId is required for page favourites",
          });
        }
        const membership = await getWorkspaceMembership(
          ctx.db,
          userId,
          input.workspaceId,
        );
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not a member of this workspace",
          });
        }
        await ctx.db.favorite.create({
          data: {
            userId,
            entityType: input.entityType,
            entityId: input.entityId,
            workspaceId: input.workspaceId,
            label: input.label ?? null,
            icon: input.icon ?? null,
          },
        });
        return { favorited: true };
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
