import { describe, it, expect, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { type PrismaClient } from "@prisma/client";

import { CollectionService } from "../CollectionService";
import {
  MemberTypeRegistry,
  type ResolvedMember,
} from "../memberTypeRegistry";

function makeRegistry(
  memberType: string,
  resolved: ResolvedMember[],
  spy = vi.fn(),
) {
  const registry = new MemberTypeRegistry();
  registry.register({
    memberType,
    resolve: async (ids, ctx) => {
      spy(ids, ctx);
      return resolved;
    },
  });
  return { registry, spy };
}

describe("CollectionService.addMembers", () => {
  it("stamps the collection's memberType onto new rows and skips duplicates", async () => {
    const db = mockDeep<PrismaClient>();
    db.collection.findUniqueOrThrow.mockResolvedValue({
      memberType: "crm_contact",
    } as never);
    db.collectionMember.createMany.mockResolvedValue({ count: 2 } as never);
    const { registry } = makeRegistry("crm_contact", []);

    const svc = new CollectionService(db, registry);
    await svc.addMembers("col1", ["c1", "c2"]);

    expect(db.collectionMember.createMany).toHaveBeenCalledWith({
      data: [
        { collectionId: "col1", memberType: "crm_contact", memberId: "c1" },
        { collectionId: "col1", memberType: "crm_contact", memberId: "c2" },
      ],
      skipDuplicates: true,
    });
  });

  it("no-ops on an empty id list (no DB write)", async () => {
    const db = mockDeep<PrismaClient>();
    const { registry } = makeRegistry("crm_contact", []);
    const svc = new CollectionService(db, registry);

    const res = await svc.addMembers("col1", []);
    expect(res).toEqual({ count: 0 });
    expect(db.collectionMember.createMany).not.toHaveBeenCalled();
  });
});

describe("CollectionService.resolveMembers", () => {
  it("delegates to the registered resolver with the member ids + workspace", async () => {
    const db = mockDeep<PrismaClient>();
    db.collection.findUniqueOrThrow.mockResolvedValue({
      memberType: "crm_contact",
      workspaceId: "w1",
    } as never);
    db.collectionMember.findMany.mockResolvedValue([
      { memberId: "c1" },
      { memberId: "c2" },
    ] as never);
    const resolved: ResolvedMember[] = [
      { memberId: "c1", label: "Ann", email: "a@x.io" },
    ];
    const { registry, spy } = makeRegistry("crm_contact", resolved);

    const svc = new CollectionService(db, registry);
    const out = await svc.resolveMembers("col1");

    expect(spy).toHaveBeenCalledWith(["c1", "c2"], { workspaceId: "w1" });
    expect(out).toEqual(resolved);
  });

  it("returns [] for an empty collection without calling the resolver", async () => {
    const db = mockDeep<PrismaClient>();
    db.collection.findUniqueOrThrow.mockResolvedValue({
      memberType: "crm_contact",
      workspaceId: "w1",
    } as never);
    db.collectionMember.findMany.mockResolvedValue([] as never);
    const { registry, spy } = makeRegistry("crm_contact", []);

    const svc = new CollectionService(db, registry);
    const out = await svc.resolveMembers("col1");

    expect(out).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws for an unregistered member type", async () => {
    const db = mockDeep<PrismaClient>();
    db.collection.findUniqueOrThrow.mockResolvedValue({
      memberType: "project",
      workspaceId: "w1",
    } as never);
    db.collectionMember.findMany.mockResolvedValue([
      { memberId: "p1" },
    ] as never);
    const { registry } = makeRegistry("crm_contact", []);

    const svc = new CollectionService(db, registry);
    await expect(svc.resolveMembers("col1")).rejects.toThrow(/no member-type/i);
  });
});
