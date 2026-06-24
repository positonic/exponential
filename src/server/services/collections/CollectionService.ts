import { type PrismaClient } from "@prisma/client";

import {
  type MemberTypeRegistry,
  type ResolvedMember,
} from "./memberTypeRegistry";

/**
 * Service for the generic **List** (`Collection`) primitive
 * ([ADR-0030](../../../../docs/adr/0030-generic-collection-list-primitive.md)).
 *
 * CRUD + membership over `Collection`/`CollectionMember`, plus `resolveMembers`,
 * which delegates id→member expansion to the `MemberTypeRegistry`. The service
 * itself knows nothing about contacts/projects — only the registered resolver
 * does.
 */
export interface CreateCollectionInput {
  workspaceId: string;
  name: string;
  memberType: string;
  createdById?: string;
}

export class CollectionService {
  constructor(
    private db: PrismaClient,
    private registry: MemberTypeRegistry,
  ) {}

  create(input: CreateCollectionInput) {
    return this.db.collection.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        memberType: input.memberType,
        createdById: input.createdById ?? null,
      },
    });
  }

  rename(id: string, name: string) {
    return this.db.collection.update({ where: { id }, data: { name } });
  }

  delete(id: string) {
    // CollectionMember rows cascade on the FK.
    return this.db.collection.delete({ where: { id } });
  }

  list(workspaceId: string) {
    return this.db.collection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  get(id: string) {
    return this.db.collection.findUnique({ where: { id } });
  }

  /**
   * Add members. The `memberType` is taken from the parent collection (members
   * are homogeneous), so callers pass only ids. Duplicate (collectionId,
   * memberId) pairs are ignored.
   *
   * Returns the ids that were *genuinely* inserted (`addedMemberIds`) — already-
   * present members are excluded. Callers that fire side effects on add (e.g.
   * the `list_member_added` Automation trigger, ADR-0031) must key off this, not
   * the input list, so re-adding an existing member never re-triggers.
   */
  async addMembers(
    collectionId: string,
    memberIds: string[],
  ): Promise<{ count: number; addedMemberIds: string[] }> {
    if (memberIds.length === 0) return { count: 0, addedMemberIds: [] };
    const collection = await this.db.collection.findUniqueOrThrow({
      where: { id: collectionId },
      select: { memberType: true },
    });

    const uniqueIds = [...new Set(memberIds)];
    const existing = await this.db.collectionMember.findMany({
      where: { collectionId, memberId: { in: uniqueIds } },
      select: { memberId: true },
    });
    const existingIds = new Set(existing.map((m) => m.memberId));
    const addedMemberIds = uniqueIds.filter((id) => !existingIds.has(id));

    if (addedMemberIds.length === 0) return { count: 0, addedMemberIds };

    await this.db.collectionMember.createMany({
      data: addedMemberIds.map((memberId) => ({
        collectionId,
        memberType: collection.memberType,
        memberId,
      })),
      skipDuplicates: true,
    });
    return { count: addedMemberIds.length, addedMemberIds };
  }

  removeMember(collectionId: string, memberId: string) {
    return this.db.collectionMember.deleteMany({
      where: { collectionId, memberId },
    });
  }

  /**
   * Resolve a collection's members into usable form via the registered resolver
   * for its `memberType`. Returns `[]` for an empty collection.
   */
  async resolveMembers(collectionId: string): Promise<ResolvedMember[]> {
    const collection = await this.db.collection.findUniqueOrThrow({
      where: { id: collectionId },
      select: { memberType: true, workspaceId: true },
    });
    const members = await this.db.collectionMember.findMany({
      where: { collectionId },
      select: { memberId: true },
    });
    if (members.length === 0) return [];

    const resolver = this.registry.get(collection.memberType);
    return resolver.resolve(
      members.map((m) => m.memberId),
      { workspaceId: collection.workspaceId },
    );
  }
}
