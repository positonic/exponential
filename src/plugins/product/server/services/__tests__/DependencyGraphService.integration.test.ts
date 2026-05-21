import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import {
  createUser,
  createWorkspace,
  createProduct,
  createFeature,
  createTicket,
  createGoal,
} from "~/test/factories";
import { buildGraph } from "../DependencyGraphService";

describe("DependencyGraphService.buildGraph", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("returns empty arrays for a product with no tickets", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });

    const result = await buildGraph(db, { productId: product.id });

    expect(result.tickets).toEqual([]);
    expect(result.features).toEqual([]);
    expect(result.objectives).toEqual([]);
    expect(result.blockingEdges).toEqual([]);
    expect(result.foreignTickets).toEqual([]);
  });

  it("hides completed tickets by default", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const active = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
      title: "Active",
    });
    await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DONE",
      title: "Done",
    });
    await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DEPLOYED",
      title: "Deployed",
    });
    await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "ARCHIVED",
      title: "Archived",
    });

    const result = await buildGraph(db, { productId: product.id });

    expect(result.tickets.map((t) => t.id)).toEqual([active.id]);
  });

  it("reveals completed tickets when includeCompleted is true", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DONE",
    });
    await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DEPLOYED",
    });

    const result = await buildGraph(db, {
      productId: product.id,
      includeCompleted: true,
    });

    expect(result.tickets).toHaveLength(3);
  });

  it("returns the openBlockerCount and isBlocked flags on ticket rows", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const blocker = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
      title: "blocker",
    });
    const dependent = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
      title: "dependent",
    });
    await db.ticketDependency.create({
      data: { ticketId: dependent.id, dependsOnId: blocker.id },
    });

    const result = await buildGraph(db, { productId: product.id });

    const blockerRow = result.tickets.find((t) => t.id === blocker.id)!;
    const dependentRow = result.tickets.find((t) => t.id === dependent.id)!;
    expect(blockerRow.openBlockerCount).toBe(0);
    expect(blockerRow.isBlocked).toBe(false);
    expect(dependentRow.openBlockerCount).toBe(1);
    expect(dependentRow.isBlocked).toBe(true);
  });

  it("does not leak tickets from other products in the workspace", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const p1 = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const p2 = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const t1 = await createTicket(db, {
      productId: p1.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    await createTicket(db, {
      productId: p2.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });

    const result = await buildGraph(db, { productId: p1.id });
    expect(result.tickets.map((t) => t.id)).toEqual([t1.id]);
  });

  it("returns blocking edges between visible tickets only", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const a = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
      title: "A",
    });
    const b = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
      title: "B",
    });
    // hidden by default filter
    const c = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DONE",
      title: "C",
    });
    // A depends on B (B is the blocker → A); both visible
    await db.ticketDependency.create({
      data: { ticketId: a.id, dependsOnId: b.id },
    });
    // A depends on C (C is hidden); edge should be dropped
    await db.ticketDependency.create({
      data: { ticketId: a.id, dependsOnId: c.id },
    });

    const result = await buildGraph(db, { productId: product.id });

    expect(result.blockingEdges).toEqual([
      { fromTicketId: b.id, toTicketId: a.id },
    ]);
  });

  it("returns blocking edges in deterministic order", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const a = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    const b = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    const c = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    await db.ticketDependency.create({
      data: { ticketId: c.id, dependsOnId: a.id },
    });
    await db.ticketDependency.create({
      data: { ticketId: b.id, dependsOnId: a.id },
    });
    await db.ticketDependency.create({
      data: { ticketId: c.id, dependsOnId: b.id },
    });

    const first = await buildGraph(db, { productId: product.id });
    const second = await buildGraph(db, { productId: product.id });

    expect(first.blockingEdges).toEqual(second.blockingEdges);
    expect(first.blockingEdges).toHaveLength(3);
  });

  it("reveals previously-hidden blocking edges when includeCompleted is true", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const active = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    const done = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DONE",
    });
    await db.ticketDependency.create({
      data: { ticketId: active.id, dependsOnId: done.id },
    });

    const hidden = await buildGraph(db, { productId: product.id });
    expect(hidden.blockingEdges).toEqual([]);

    const shown = await buildGraph(db, {
      productId: product.id,
      includeCompleted: true,
    });
    expect(shown.blockingEdges).toEqual([
      { fromTicketId: done.id, toTicketId: active.id },
    ]);
  });

  it("excludes a feature whose only tickets are all completed", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const feature = await createFeature(db, {
      productId: product.id,
      createdById: user.id,
    });
    const completed = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DONE",
    });
    await db.ticket.update({
      where: { id: completed.id },
      data: { featureId: feature.id },
    });

    const result = await buildGraph(db, { productId: product.id });
    expect(result.features).toEqual([]);

    const withCompleted = await buildGraph(db, {
      productId: product.id,
      includeCompleted: true,
    });
    expect(withCompleted.features.map((f) => f.id)).toEqual([feature.id]);
  });

  it("returns orphan tickets with featureId null", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const ticket = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });

    const result = await buildGraph(db, { productId: product.id });
    expect(result.tickets.map((t) => t.id)).toEqual([ticket.id]);
    expect(result.tickets[0]?.featureId).toBeNull();
    expect(result.features).toEqual([]);
  });

  it("excludes objectives whose features have no visible tickets", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const goal = await createGoal(db, {
      userId: user.id,
      workspaceId: ws.id,
      title: "Strategic objective",
      period: "Q3-2026",
    });
    const feature = await createFeature(db, {
      productId: product.id,
      createdById: user.id,
    });
    await db.feature.update({
      where: { id: feature.id },
      data: { goalId: goal.id },
    });
    const completed = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "DONE",
    });
    await db.ticket.update({
      where: { id: completed.id },
      data: { featureId: feature.id },
    });

    const result = await buildGraph(db, { productId: product.id });
    expect(result.objectives).toEqual([]);

    const withCompleted = await buildGraph(db, {
      productId: product.id,
      includeCompleted: true,
    });
    expect(withCompleted.objectives.map((o) => o.id)).toEqual([goal.id]);
  });

  it("orphan features (goalId null) are returned but contribute no objectives", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const feature = await createFeature(db, {
      productId: product.id,
      createdById: user.id,
    });
    const ticket = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    await db.ticket.update({
      where: { id: ticket.id },
      data: { featureId: feature.id },
    });

    const result = await buildGraph(db, { productId: product.id });
    expect(result.features.map((f) => f.id)).toEqual([feature.id]);
    expect(result.features[0]?.goalId).toBeNull();
    expect(result.objectives).toEqual([]);
  });

  it("returns features and objectives reachable from visible tickets", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const goal = await createGoal(db, {
      userId: user.id,
      workspaceId: ws.id,
      title: "Ship V1",
      period: "Q2-2026",
    });
    const feature = await createFeature(db, {
      productId: product.id,
      createdById: user.id,
      name: "Onboarding",
    });
    await db.feature.update({
      where: { id: feature.id },
      data: { goalId: goal.id },
    });
    const ticket = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      status: "IN_PROGRESS",
    });
    await db.ticket.update({
      where: { id: ticket.id },
      data: { featureId: feature.id },
    });

    const result = await buildGraph(db, { productId: product.id });

    expect(result.features.map((f) => f.id)).toEqual([feature.id]);
    expect(result.objectives.map((o) => o.id)).toEqual([goal.id]);
    expect(result.objectives[0]?.period).toBe("Q2-2026");
  });
});
