import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { assertCanEditPosition, hasRemitGap, POSITION_SUMMARY_SELECT } from "~/server/services/positions";
import { blankToNull } from "~/server/utils/blankToNull";

/**
 * Positions (ADR-0068): who does what in a workspace, for humans and agents
 * alike. Routing data only — a Position never grants or restricts anything;
 * `WorkspaceUser.role` stays the only input to access control.
 *
 * Every write is `humanOnlyProcedure` (ADR-0049 denylist): no agent principal
 * can give itself or another agent a Position, however it authenticated.
 * Owners and admins (`manage_members`) create, rename, delete and set holders;
 * a holder who is at least a `member` may edit the Remit of a Position they
 * hold (`update`); a viewer is read-only even as a holder.
 *
 * Every procedure takes `workspaceId` so `requireWorkspaceMembership` gates
 * it, and a `positionId` from another workspace answers NOT_FOUND — no
 * cross-workspace oracle.
 */

const titleSchema = z.string().trim().min(1).max(80);
const remitSchema = z.string().trim().min(1).max(2000);
const notAccountableForSchema = z.string().trim().max(2000);
/** A sanity bound on the `IN` clause, not a product limit. */
const holderUserIdsSchema = z.array(z.string()).max(50);

const POSITION_WITH_HOLDERS_SELECT = {
  ...POSITION_SUMMARY_SELECT,
  holders: {
    select: {
      workspaceUser: {
        select: {
          user: { select: { id: true, name: true, image: true, isAgent: true } },
        },
      },
    },
  },
} as const satisfies Prisma.PositionSelect;

type PositionWithHolders = Prisma.PositionGetPayload<{ select: typeof POSITION_WITH_HOLDERS_SELECT }>;

function presentPosition(position: PositionWithHolders) {
  const { holders, ...summary } = position;
  return {
    ...summary,
    holders: holders.map(({ workspaceUser: { user } }) => ({
      userId: user.id,
      name: user.name,
      image: user.image,
      isAgent: user.isAgent,
    })),
  };
}

function prismaErrorCode(error: unknown): string | null {
  return !!error && typeof error === "object" && "code" in error
    ? ((error as { code?: unknown }).code as string | null) ?? null
    : null;
}

/** P2002 on the `(workspaceId, title)` unique, and no other unique. */
function isDuplicateTitle(error: unknown): boolean {
  if (prismaErrorCode(error) !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.includes("title") : typeof target === "string" && target.includes("title");
}

/**
 * P2003: a holder's `WorkspaceUser` row vanished between the membership check
 * and the write (the member was removed concurrently). The write rolled back;
 * answer as the check would have.
 */
function isMissingHolderMembership(error: unknown): boolean {
  return prismaErrorCode(error) === "P2003";
}

const DUPLICATE_TITLE = () =>
  new TRPCError({ code: "CONFLICT", message: "A Position with this title already exists" });
const HOLDER_NOT_MEMBER = () =>
  new TRPCError({ code: "NOT_FOUND", message: "Member not found in this workspace" });

/** Map a failed Position write to its tRPC error, or rethrow. */
function rethrowPositionWrite(error: unknown): never {
  if (isDuplicateTitle(error)) throw DUPLICATE_TITLE();
  if (isMissingHolderMembership(error)) throw HOLDER_NOT_MEMBER();
  throw error;
}

/** The Position, or NOT_FOUND when it is missing or belongs to another workspace. */
async function requirePositionInWorkspace(
  db: PrismaClient,
  positionId: string,
  workspaceId: string,
) {
  const position = await db.position.findUnique({
    where: { id: positionId },
    select: { id: true, workspaceId: true },
  });
  if (!position || position.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
  }
  return position;
}

/**
 * Map holder userIds to their `WorkspaceUser` rows in `workspaceId`. Every
 * holder must be a member; a miss is NOT_FOUND and never names the id (the
 * same rule as `assignability.ts`, so this cannot confirm foreign CUIDs).
 */
async function resolveHolderMemberships(
  db: PrismaClient,
  workspaceId: string,
  userIds: string[],
): Promise<string[]> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return [];
  const memberships = await db.workspaceUser.findMany({
    where: { workspaceId, userId: { in: unique } },
    select: { id: true },
  });
  if (memberships.length !== unique.length) {
    throw HOLDER_NOT_MEMBER();
  }
  return memberships.map((membership) => membership.id);
}

export const positionRouter = createTRPCRouter({
  /**
   * Every Position in the workspace with its holders, plus one row per
   * `WorkspaceUser` saying which Positions they hold and whether their row
   * needs the "no stated remit" warning. The settings page's one read.
   */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const [positions, members] = await Promise.all([
        ctx.db.position.findMany({
          where: { workspaceId: input.workspaceId },
          orderBy: { title: "asc" },
          select: POSITION_WITH_HOLDERS_SELECT,
        }),
        ctx.db.workspaceUser.findMany({
          where: { workspaceId: input.workspaceId },
          select: {
            userId: true,
            user: {
              select: {
                isAgent: true,
                // An agent's own description is its fallback Remit (ADR-0068 §3).
                externalAgentShadow: { select: { description: true } },
              },
            },
            positionHolders: { select: { positionId: true } },
          },
        }),
      ]);

      return {
        positions: positions.map(presentPosition),
        members: members.map((member) => ({
          userId: member.userId,
          positionIds: member.positionHolders.map((holder) => holder.positionId),
          remitGap: hasRemitGap({
            isAgent: member.user.isAgent,
            positionCount: member.positionHolders.length,
            agentDescription: member.user.externalAgentShadow?.description ?? null,
          }),
        })),
      };
    }),

  create: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: titleSchema,
        remit: remitSchema,
        notAccountableFor: notAccountableForSchema.optional(),
        holderUserIds: holderUserIdsSchema.optional(),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const workspaceUserIds = await resolveHolderMemberships(
        ctx.db,
        input.workspaceId,
        input.holderUserIds ?? [],
      );
      try {
        // Row and holders in one nested write, so a Position never exists
        // half-made.
        const created = await ctx.db.position.create({
          data: {
            workspaceId: input.workspaceId,
            title: input.title,
            remit: input.remit,
            notAccountableFor: blankToNull(input.notAccountableFor),
            holders: {
              create: workspaceUserIds.map((workspaceUserId) => ({ workspaceUserId })),
            },
          },
          select: POSITION_WITH_HOLDERS_SELECT,
        });
        return presentPosition(created);
      } catch (error) {
        rethrowPositionWrite(error);
      }
    }),

  /**
   * Title, "not accountable for" and the holder set need owner/admin; the
   * Remit needs owner/admin or that the caller holds this Position. The
   * decision is `assertCanEditPosition` in services/positions — one place,
   * not per router. Row and holders are written in one transaction, so an
   * admin's edit never lands half-way (the same guarantee `create` gives).
   */
  update: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        positionId: z.string(),
        title: titleSchema.optional(),
        remit: remitSchema.optional(),
        notAccountableFor: notAccountableForSchema.nullable().optional(),
        /** When present, replaces the holder set (owner/admin only). */
        holderUserIds: holderUserIdsSchema.optional(),
      })
      // An update that edits nothing would pass neither gate below and still
      // run a mutation as any viewer; refuse it before authorization.
      .refine(
        (input) =>
          input.title !== undefined ||
          input.remit !== undefined ||
          input.notAccountableFor !== undefined ||
          input.holderUserIds !== undefined,
        { message: "Nothing to update" },
      ),
    )
    .use(requireWorkspaceMembership("view"))
    .mutation(async ({ ctx, input }) => {
      await requirePositionInWorkspace(ctx.db, input.positionId, input.workspaceId);
      await assertCanEditPosition(ctx.db, {
        userId: ctx.session.user.id,
        workspaceId: input.workspaceId,
        positionId: input.positionId,
        edits: {
          titleOrScope:
            input.title !== undefined ||
            input.notAccountableFor !== undefined ||
            input.holderUserIds !== undefined,
          remit: input.remit !== undefined,
        },
      });
      const workspaceUserIds =
        input.holderUserIds !== undefined
          ? await resolveHolderMemberships(ctx.db, input.workspaceId, input.holderUserIds)
          : null;

      const data: Prisma.PositionUpdateInput = {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.remit !== undefined && { remit: input.remit }),
        ...(input.notAccountableFor !== undefined && {
          notAccountableFor: blankToNull(input.notAccountableFor),
        }),
      };

      try {
        if (workspaceUserIds === null) {
          const updated = await ctx.db.position.update({
            where: { id: input.positionId },
            data,
            select: POSITION_WITH_HOLDERS_SELECT,
          });
          return presentPosition(updated);
        }
        const updated = await ctx.db.$transaction(async (tx) => {
          await tx.positionHolder.deleteMany({ where: { positionId: input.positionId } });
          if (workspaceUserIds.length > 0) {
            await tx.positionHolder.createMany({
              data: workspaceUserIds.map((workspaceUserId) => ({ positionId: input.positionId, workspaceUserId })),
            });
          }
          return tx.position.update({
            where: { id: input.positionId },
            data,
            select: POSITION_WITH_HOLDERS_SELECT,
          });
        });
        return presentPosition(updated);
      } catch (error) {
        rethrowPositionWrite(error);
      }
    }),

  delete: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), positionId: z.string() }))
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      await requirePositionInWorkspace(ctx.db, input.positionId, input.workspaceId);
      // Holders cascade (FK).
      await ctx.db.position.delete({ where: { id: input.positionId } });
      return { id: input.positionId };
    }),

  /** Replace the holder set. Same member check and NOT_FOUND rule as `create`. */
  setHolders: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        positionId: z.string(),
        userIds: holderUserIdsSchema,
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      await requirePositionInWorkspace(ctx.db, input.positionId, input.workspaceId);
      const workspaceUserIds = await resolveHolderMemberships(ctx.db, input.workspaceId, input.userIds);

      try {
        const updated = await ctx.db.$transaction(async (tx) => {
          await tx.positionHolder.deleteMany({ where: { positionId: input.positionId } });
          if (workspaceUserIds.length > 0) {
            await tx.positionHolder.createMany({
              data: workspaceUserIds.map((workspaceUserId) => ({ positionId: input.positionId, workspaceUserId })),
            });
          }
          return tx.position.findUniqueOrThrow({
            where: { id: input.positionId },
            select: POSITION_WITH_HOLDERS_SELECT,
          });
        });
        return presentPosition(updated);
      } catch (error) {
        rethrowPositionWrite(error);
      }
    }),
});
