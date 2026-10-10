import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import {
  assertCanEditPosition,
  hasRemitGap,
  loadPositionCoverage,
  planPositionImport,
  POSITION_SUMMARY_SELECT,
  positionTitleKey,
  shouldOfferPositionImport,
} from "~/server/services/positions";

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
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in this workspace" });
  }
  return memberships.map((membership) => membership.id);
}

/**
 * Like `resolveHolderMemberships`, keyed by userId so an import can map each
 * row's holders. Same NOT_FOUND rule: a miss never names the id.
 */
async function mapHolderMemberships(
  db: PrismaClient,
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const memberships = await db.workspaceUser.findMany({
    where: { workspaceId, userId: { in: unique } },
    select: { id: true, userId: true },
  });
  if (memberships.length !== unique.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in this workspace" });
  }
  return new Map(memberships.map((membership) => [membership.userId, membership.id]));
}

/** The workspace's Positions with their holders' userIds, for an import to match against. */
async function loadPositionsForImport(db: PrismaClient | Prisma.TransactionClient, workspaceId: string) {
  const positions = await db.position.findMany({
    where: { workspaceId },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      holders: { select: { workspaceUser: { select: { userId: true } } } },
    },
  });
  return positions.map((position) => ({
    id: position.id,
    title: position.title,
    holderUserIds: position.holders.map((holder) => holder.workspaceUser.userId),
  }));
}

const importRowSchema = z.object({
  title: titleSchema,
  remit: remitSchema,
  notAccountableFor: notAccountableForSchema.optional(),
  holderUserIds: holderUserIdsSchema,
});

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

  /**
   * Should the chat offer "Import roles & responsibilities" here? A read for
   * any member — the pill shows to everyone (Agent PRD D12), and the import
   * itself is what needs owner/admin.
   */
  coverage: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const coverage = await loadPositionCoverage(ctx.db, input.workspaceId);
      return {
        offerImport: shouldOfferPositionImport(coverage),
        memberCount: coverage.memberCount,
        eligibleCount: coverage.eligibleCount,
        coveredCount: coverage.coveredCount,
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

  /**
   * Title and "not accountable for" need owner/admin; the Remit needs
   * owner/admin or that the caller holds this Position. The decision is
   * `assertCanEditPosition` in services/positions — one place, not per router.
   */
  update: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        positionId: z.string(),
        title: titleSchema.optional(),
        remit: remitSchema.optional(),
        notAccountableFor: notAccountableForSchema.nullable().optional(),
      })
      // An update that edits nothing would pass neither gate below and still
      // run a mutation as any viewer; refuse it before authorization.
      .refine(
        (input) => input.title !== undefined || input.remit !== undefined || input.notAccountableFor !== undefined,
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
          titleOrScope: input.title !== undefined || input.notAccountableFor !== undefined,
          remit: input.remit !== undefined,
        },
      });

      try {
        const updated = await ctx.db.position.update({
          where: { id: input.positionId },
          data: {
            ...(input.title !== undefined && { title: input.title }),
            ...(input.remit !== undefined && { remit: input.remit }),
            ...(input.notAccountableFor !== undefined && {
              notAccountableFor: input.notAccountableFor?.length ? input.notAccountableFor : null,
            }),
          },
          select: POSITION_WITH_HOLDERS_SELECT,
        });
        return presentPosition(updated);
      } catch (error) {
        if (isUniqueViolation(error)) throw DUPLICATE_TITLE();
        throw error;
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

  /**
   * Bring in a set of Positions at once — Zoe's import of a roles &
   * responsibilities document (Agent PRD D3/D10). Owner/admin, human-only.
   *
   * Upsert by title, matched case-insensitively on the trimmed title within
   * the workspace (`planPositionImport`). Every holder must be a member,
   * checked before anything is planned. `dryRun: true` validates and returns
   * the plan without writing, so Zoe can show a draft and ask first.
   *
   * Returns `{ written, results }`, results in input order, each with the
   * Position's holders as they stand after the import.
   */
  importMany: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dryRun: z.boolean(),
        positions: z.array(importRowSchema).min(1).max(50),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const seen = new Set<string>();
      for (const row of input.positions) {
        const key = positionTitleKey(row.title);
        if (seen.has(key)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${row.title}" appears more than once in this import`,
          });
        }
        seen.add(key);
      }

      await mapHolderMemberships(
        ctx.db,
        input.workspaceId,
        input.positions.flatMap((row) => row.holderUserIds),
      );

      const present = (plan: ReturnType<typeof planPositionImport>) =>
        plan.map(({ title, outcome, holderUserIds }) => ({ title, outcome, holderUserIds }));

      if (input.dryRun) {
        const plan = planPositionImport(await loadPositionsForImport(ctx.db, input.workspaceId), input.positions);
        return { written: false, results: present(plan) };
      }

      throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Only a dry run is supported yet" });
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
    }),
});
