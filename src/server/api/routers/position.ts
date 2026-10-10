import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { hasRemitGap, POSITION_SUMMARY_SELECT } from "~/server/services/positions";

/**
 * Positions (ADR-0068): who does what in a workspace, for humans and agents
 * alike. Routing data only — a Position never grants or restricts anything;
 * `WorkspaceUser.role` stays the only input to access control.
 *
 * Every write is `humanOnlyProcedure` (ADR-0049 denylist): no agent principal
 * can give itself or another agent a Position, however it authenticated.
 * Owners and admins (`manage_members`) create, rename, delete and set holders;
 * a holder may edit the Remit of a Position they hold (`update`).
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
  return { ...summary, holders: holders.map((holder) => holder.workspaceUser.user) };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

const DUPLICATE_TITLE = () =>
  new TRPCError({ code: "CONFLICT", message: "A Position with this title already exists" });

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
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in this workspace" });
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
            notAccountableFor: input.notAccountableFor?.length ? input.notAccountableFor : null,
            holders: {
              create: workspaceUserIds.map((workspaceUserId) => ({ workspaceUserId })),
            },
          },
          select: POSITION_WITH_HOLDERS_SELECT,
        });
        return presentPosition(created);
      } catch (error) {
        if (isUniqueViolation(error)) throw DUPLICATE_TITLE();
        throw error;
      }
    }),
});
