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

  it("allows overlapping dates on cycles of different products", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const productA = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const productB = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });

    const start = new Date("2030-01-06");
    const end = new Date("2030-01-20");

    const caller = createTestCaller(user.id);
    await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: productA.id,
      name: "A Cycle 1",
      startDate: start,
      endDate: end,
    });

    // Same window on another product is fine — independent timelines
    const bCycle = await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: productB.id,
      name: "B Cycle 1",
      startDate: start,
      endDate: end,
    });
    expect(bCycle.productId).toBe(productB.id);

    // But the same window on the SAME product still conflicts
    await expect(
      caller.product.cycle.create({
        workspaceId: ws.id,
        productId: productB.id,
        name: "B Cycle 2",
        startDate: new Date("2030-01-13"),
        endDate: new Date("2030-01-27"),
      }),
    ).rejects.toThrow(/overlap/i);
  });

  it("does not let a legacy workspace-shared cycle block a product cycle", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    // Legacy cycle with no product (pre-migration shape)
    await createCycle(db, {
      workspaceId: ws.id,
      createdById: user.id,
      startDate: new Date("2030-02-03"),
      endDate: new Date("2030-02-17"),
    });

    const caller = createTestCaller(user.id);
    const cycle = await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: product.id,
      name: "Product Cycle 1",
      startDate: new Date("2030-02-03"),
      endDate: new Date("2030-02-17"),
    });
    expect(cycle.productId).toBe(product.id);
  });

  it("rejects a productId from another workspace", async () => {
    const user = await createUser(db);
    const otherUser = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const otherWs = await createWorkspace(db, { ownerId: otherUser.id });
    const foreignProduct = await createProduct(db, {
      workspaceId: otherWs.id,
      createdById: otherUser.id,
    });

    const caller = createTestCaller(user.id);
    await expect(
      caller.product.cycle.create({
        workspaceId: ws.id,
        productId: foreignProduct.id,
        name: "Bad cycle",
      }),
    ).rejects.toThrow(TRPCError);
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
