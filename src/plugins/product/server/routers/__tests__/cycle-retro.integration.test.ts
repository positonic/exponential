import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createCycle,
} from "~/test/factories";

describe("cycle router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates a cycle as a SPRINT list", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });

    const caller = createTestCaller(user.id);
    const cycle = await caller.product.cycle.create({
      workspaceId: ws.id,
      name: "Sprint 1",
      cycleGoal: "Ship notifications v1",
    });

    expect(cycle.listType).toBe("SPRINT");
    expect(cycle.name).toBe("Sprint 1");
    expect(cycle.cycleGoal).toBe("Ship notifications v1");
  });

  it("updates cycle status and achievements", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const cycle = await createCycle(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });

    const caller = createTestCaller(user.id);
    const updated = await caller.product.cycle.update({
      id: cycle.id,
      status: "ACTIVE",
      achievements: "Shipped email",
    });

    expect(updated.status).toBe("ACTIVE");
    expect(updated.achievements).toBe("Shipped email");
  });

  it("rejects getById when the list isn't a SPRINT", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const nonCycle = await db.list.create({
      data: {
        workspaceId: ws.id,
        createdById: user.id,
        name: "Not a cycle",
        slug: "not-a-cycle",
        listType: "BACKLOG",
      },
    });

    const caller = createTestCaller(user.id);
    await expect(
      caller.product.cycle.getById({ id: nonCycle.id }),
    ).rejects.toThrow(TRPCError);
  });
});

describe("retrospective router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates a standalone retrospective", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });

    const caller = createTestCaller(user.id);
    const retro = await caller.product.retrospective.create({
      workspaceId: ws.id,
      title: "Q1 retro",
      wentWell: "Shipped the thing",
      wentPoorly: "Too many rushes at the end",
    });

    expect(retro.title).toBe("Q1 retro");
    expect(retro.cycleId).toBeNull();
    expect(retro.productId).toBeNull();
  });

  it("creates a retrospective linked to a cycle and product", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const cycle = await createCycle(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });

    const caller = createTestCaller(user.id);
    const retro = await caller.product.retrospective.create({
      workspaceId: ws.id,
      productId: product.id,
      cycleId: cycle.id,
      title: "Cycle retro",
    });

    expect(retro.cycleId).toBe(cycle.id);
    expect(retro.productId).toBe(product.id);
  });

  it("rejects cycle from a different workspace", async () => {
    const user = await createUser(db);
    const otherUser = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const otherWs = await createWorkspace(db, { ownerId: otherUser.id });
    const foreignCycle = await createCycle(db, {
      workspaceId: otherWs.id,
      createdById: otherUser.id,
    });

    const caller = createTestCaller(user.id);
    await expect(
      caller.product.retrospective.create({
        workspaceId: ws.id,
        cycleId: foreignCycle.id,
        title: "Bad link",
      }),
    ).rejects.toThrow(TRPCError);
  });
});
