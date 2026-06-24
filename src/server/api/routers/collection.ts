import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { CollectionService } from "~/server/services/collections/CollectionService";
import { createMemberTypeRegistry } from "~/server/services/collections/createMemberTypeRegistry";
import { CRM_CONTACT_MEMBER_TYPE } from "~/server/services/collections/memberTypeRegistry";
import { dispatchListMemberAddedAutomations } from "~/server/services/crm/automation/dispatchListMemberAddedAutomations";

function service(db: PrismaClient) {
  return new CollectionService(db, createMemberTypeRegistry(db));
}

/**
 * Verify a collection belongs to the workspace the caller passed (and was
 * membership-checked against) — guards id-based ops against cross-workspace use.
 */
async function assertInWorkspace(
  db: PrismaClient,
  collectionId: string,
  workspaceId: string,
) {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { workspaceId: true },
  });
  if (!collection || collection.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
  }
}

/**
 * `collection` router — the generic **List** primitive's API ([ADR-0030]).
 * Every procedure is workspace-scoped + membership-checked; id-based ops also
 * assert the collection belongs to that workspace.
 */
export const collectionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(({ ctx, input }) => service(ctx.db).list(input.workspaceId)),

  members: protectedProcedure
    .input(z.object({ workspaceId: z.string(), collectionId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.collectionId, input.workspaceId);
      return service(ctx.db).resolveMembers(input.collectionId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1),
        memberType: z.string().default(CRM_CONTACT_MEMBER_TYPE),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(({ ctx, input }) =>
      service(ctx.db).create({
        workspaceId: input.workspaceId,
        name: input.name,
        memberType: input.memberType,
        createdById: ctx.session.user.id,
      }),
    ),

  rename: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        collectionId: z.string(),
        name: z.string().min(1),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.collectionId, input.workspaceId);
      return service(ctx.db).rename(input.collectionId, input.name);
    }),

  delete: protectedProcedure
    .input(z.object({ workspaceId: z.string(), collectionId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.collectionId, input.workspaceId);
      return service(ctx.db).delete(input.collectionId);
    }),

  addMembers: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        collectionId: z.string(),
        memberIds: z.array(z.string()).min(1),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.collectionId, input.workspaceId);
      const result = await service(ctx.db).addMembers(
        input.collectionId,
        input.memberIds,
      );

      // Fire any `list_member_added` Automations subscribed to this List
      // (ADR-0031). Only when at least one member was genuinely added; the
      // dispatcher's per-(definition, contact) idempotency guards the rest.
      if (result.count > 0) {
        await dispatchListMemberAddedAutomations(ctx.db, {
          collectionId: input.collectionId,
          workspaceId: input.workspaceId,
          addedMemberIds: input.memberIds,
          triggeredById: ctx.session.user.id,
        });
      }

      return result;
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        collectionId: z.string(),
        memberId: z.string(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.collectionId, input.workspaceId);
      return service(ctx.db).removeMember(input.collectionId, input.memberId);
    }),
});
