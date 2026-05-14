import type { PrismaClient, Tag } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { canEditAction, getActionAccess } from "~/server/services/access";

export type TagEntityType = "action" | "ticket" | "feature" | "epic";

interface EntityResolution {
  workspaceId: string;
  /** Existing tag IDs on the entity (in stable order). */
  currentTagIds: string[];
}

interface SetEntityTagsInput {
  db: PrismaClient;
  userId: string;
  entityType: TagEntityType;
  entityId: string;
  tagIds: string[];
}

interface ListForEntityInput {
  db: PrismaClient;
  userId: string;
  entityType: TagEntityType;
  entityId: string;
}

interface SetEntityTagsResult {
  entityType: TagEntityType;
  entityId: string;
  tags: Tag[];
}

async function resolveEntity(
  db: PrismaClient,
  userId: string,
  entityType: TagEntityType,
  entityId: string,
): Promise<EntityResolution> {
  switch (entityType) {
    case "action": {
      const action = await db.action.findUnique({
        where: { id: entityId },
        select: {
          workspaceId: true,
          project: { select: { workspaceId: true } },
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!action) throwNotFound("Action");
      const access = await getActionAccess(db, userId, entityId);
      if (!access || !canEditAction(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to tag this action",
        });
      }
      const workspaceId = action.workspaceId ?? action.project?.workspaceId ?? null;
      if (!workspaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Action has no workspace; cannot validate tag scope",
        });
      }
      return {
        workspaceId,
        currentTagIds: action.tags.map((t) => t.tagId),
      };
    }
    case "ticket": {
      const ticket = await db.ticket.findUnique({
        where: { id: entityId },
        select: {
          product: { select: { workspaceId: true } },
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!ticket) throwNotFound("Ticket");
      await requireWorkspaceMember(db, userId, ticket.product.workspaceId);
      return {
        workspaceId: ticket.product.workspaceId,
        currentTagIds: ticket.tags.map((t) => t.tagId),
      };
    }
    case "feature": {
      const feature = await db.feature.findUnique({
        where: { id: entityId },
        select: {
          product: { select: { workspaceId: true } },
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!feature) throwNotFound("Feature");
      await requireWorkspaceMember(db, userId, feature.product.workspaceId);
      return {
        workspaceId: feature.product.workspaceId,
        currentTagIds: feature.tags.map((t) => t.tagId),
      };
    }
    case "epic": {
      const epic = await db.epic.findUnique({
        where: { id: entityId },
        select: {
          workspaceId: true,
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!epic) throwNotFound("Epic");
      await requireWorkspaceMember(db, userId, epic.workspaceId);
      return {
        workspaceId: epic.workspaceId,
        currentTagIds: epic.tags.map((t) => t.tagId),
      };
    }
  }
}

function throwNotFound(label: string): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: `${label} not found`,
  });
}

async function requireWorkspaceMember(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await db.workspaceUser.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a workspace member",
    });
  }
}

async function validateTagsForWorkspace(
  db: PrismaClient,
  workspaceId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const validTags = await db.tag.findMany({
    where: {
      id: { in: tagIds },
      OR: [{ workspaceId: null }, { workspaceId }],
    },
    select: { id: true },
  });
  if (validTags.length !== tagIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more tags are not available in this workspace",
    });
  }
}

async function applyTagSet(
  db: PrismaClient,
  entityType: TagEntityType,
  entityId: string,
  desiredTagIds: string[],
  currentTagIds: string[],
): Promise<void> {
  const desired = new Set(desiredTagIds);
  const current = new Set(currentTagIds);
  const toAdd = desiredTagIds.filter((id) => !current.has(id));
  const toRemove = currentTagIds.filter((id) => !desired.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await db.$transaction(async (tx) => {
    switch (entityType) {
      case "action":
        if (toRemove.length > 0) {
          await tx.actionTag.deleteMany({
            where: { actionId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.actionTag.createMany({
            data: toAdd.map((tagId) => ({ actionId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "ticket":
        if (toRemove.length > 0) {
          await tx.ticketTag.deleteMany({
            where: { ticketId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.ticketTag.createMany({
            data: toAdd.map((tagId) => ({ ticketId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "feature":
        if (toRemove.length > 0) {
          await tx.featureTag.deleteMany({
            where: { featureId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.featureTag.createMany({
            data: toAdd.map((tagId) => ({ featureId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "epic":
        if (toRemove.length > 0) {
          await tx.epicTag.deleteMany({
            where: { epicId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.epicTag.createMany({
            data: toAdd.map((tagId) => ({ epicId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
    }
  });
}

async function loadTagsForEntity(
  db: PrismaClient,
  entityType: TagEntityType,
  entityId: string,
): Promise<Tag[]> {
  switch (entityType) {
    case "action": {
      const rows = await db.actionTag.findMany({
        where: { actionId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "ticket": {
      const rows = await db.ticketTag.findMany({
        where: { ticketId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "feature": {
      const rows = await db.featureTag.findMany({
        where: { featureId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "epic": {
      const rows = await db.epicTag.findMany({
        where: { epicId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
  }
}

export async function setEntityTags({
  db,
  userId,
  entityType,
  entityId,
  tagIds,
}: SetEntityTagsInput): Promise<SetEntityTagsResult> {
  const uniqueTagIds = [...new Set(tagIds)];

  const { workspaceId, currentTagIds } = await resolveEntity(
    db,
    userId,
    entityType,
    entityId,
  );

  await validateTagsForWorkspace(db, workspaceId, uniqueTagIds);
  await applyTagSet(db, entityType, entityId, uniqueTagIds, currentTagIds);

  const tags = await loadTagsForEntity(db, entityType, entityId);
  return { entityType, entityId, tags };
}

export async function listForEntity({
  db,
  userId,
  entityType,
  entityId,
}: ListForEntityInput): Promise<Tag[]> {
  await resolveEntity(db, userId, entityType, entityId);
  return loadTagsForEntity(db, entityType, entityId);
}
