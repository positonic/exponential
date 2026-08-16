import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createCycle,
  createTicket,
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

  it("scopes the update overlap check per product", async () => {
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

    const caller = createTestCaller(user.id);
    const a1 = await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: productA.id,
      name: "A1",
      startDate: new Date("2030-03-04"),
      endDate: new Date("2030-03-18"),
    });
    await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: productA.id,
      name: "A2",
      startDate: new Date("2030-04-01"),
      endDate: new Date("2030-04-15"),
    });
    await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: productB.id,
      name: "B1",
      startDate: new Date("2030-05-06"),
      endDate: new Date("2030-05-20"),
    });

    // Moving A1 onto B1's dates is fine — different product
    const moved = await caller.product.cycle.update({
      id: a1.id,
      startDate: new Date("2030-05-06"),
      endDate: new Date("2030-05-20"),
    });
    expect(moved.startDate).toEqual(new Date("2030-05-06"));

    // Moving A1 onto sibling A2's dates still conflicts
    await expect(
      caller.product.cycle.update({
        id: a1.id,
        startDate: new Date("2030-04-08"),
        endDate: new Date("2030-04-22"),
      }),
    ).rejects.toThrow(/overlap/i);

    // A legacy shared cycle (productId null) may move onto a product cycle's
    // dates — null is its own scope
    const legacy = await createCycle(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const legacyMoved = await caller.product.cycle.update({
      id: legacy.id,
      startDate: new Date("2030-04-01"),
      endDate: new Date("2030-04-15"),
    });
    expect(legacyMoved.startDate).toEqual(new Date("2030-04-01"));
  });

  it("auto-generates cycles per product, suppressed by legacy shared coverage", async () => {
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

    const caller = createTestCaller(user.id);

    // Each product's Cycles tab generates its own upcoming cycles
    const aCycles = await caller.product.cycle.list({
      workspaceId: ws.id,
      productId: productA.id,
      autoCreate: true,
    });
    expect(aCycles.length).toBeGreaterThan(0);
    expect(aCycles.every((c) => c.productId === productA.id)).toBe(true);

    const bCycles = await caller.product.cycle.list({
      workspaceId: ws.id,
      productId: productB.id,
      autoCreate: true,
    });
    const bOwned = bCycles.filter((c) => c.productId === productB.id);
    expect(bOwned.length).toBeGreaterThan(0);
    // B's listing never contains A's cycles (only its own + shared)
    expect(bCycles.some((c) => c.productId === productA.id)).toBe(false);

    // A workspace with legacy shared coverage generates nothing new
    const ws2 = await createWorkspace(db, { ownerId: user.id });
    const productC = await createProduct(db, {
      workspaceId: ws2.id,
      createdById: user.id,
    });
    const now = new Date();
    const legacyEnd = new Date(now);
    legacyEnd.setDate(legacyEnd.getDate() + 60); // beyond the lookahead horizon
    await createCycle(db, {
      workspaceId: ws2.id,
      createdById: user.id,
      startDate: now,
      endDate: legacyEnd,
    });
    const cCycles = await caller.product.cycle.list({
      workspaceId: ws2.id,
      productId: productC.id,
      autoCreate: true,
    });
    expect(cCycles.filter((c) => c.productId === productC.id)).toHaveLength(0);
    expect(cCycles.filter((c) => c.productId === null)).toHaveLength(1);
  });

  it("rejects linking a ticket to another product's cycle, allows shared cycles", async () => {
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

    const caller = createTestCaller(user.id);
    const bCycle = await caller.product.cycle.create({
      workspaceId: ws.id,
      productId: productB.id,
      name: "B only",
    });
    const ticket = await createTicket(db, {
      productId: productA.id,
      createdById: user.id,
    });

    // Product A's ticket may not join product B's cycle
    await expect(
      caller.product.ticket.update({ id: ticket.id, cycleId: bCycle.id }),
    ).rejects.toThrow(TRPCError);

    // A legacy shared cycle (productId null) is joinable from any product
    const shared = await createCycle(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const updated = await caller.product.ticket.update({
      id: ticket.id,
      cycleId: shared.id,
    });
    expect(updated.cycleId).toBe(shared.id);
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
