/**
 * Integration test for ticket sync provenance (ADR-0042): deleting an
 * Integration row must SetNull the sync config's link — a disconnect,
 * never a purge. This is real-FK behavior a mocked Prisma can't prove.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import {
  createUser,
  createWorkspace,
  createProduct,
  createTicket,
} from "~/test/factories";

describe("ticket sync provenance", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("deleting an Integration leaves the sync config, links, and runs intact with a nulled link", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const integration = await db.integration.create({
      data: {
        name: "Notion (test)",
        type: "API_KEY",
        provider: "notion",
        userId: user.id,
      },
    });
    const config = await db.ticketSyncConfig.create({
      data: {
        productId: product.id,
        provider: "notion",
        integrationId: integration.id,
        databaseId: "notion-db-1",
        databaseName: "Backlog",
        createdById: user.id,
      },
    });
    const ticket = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
    });
    await db.ticketSync.create({
      data: {
        configId: config.id,
        ticketId: ticket.id,
        provider: "notion",
        externalId: "page-1",
      },
    });
    await db.ticketSyncRun.create({
      data: {
        configId: config.id,
        trigger: "manual",
        direction: "pull",
        status: "success",
        created: 1,
        triggeredById: user.id,
      },
    });

    await db.integration.delete({ where: { id: integration.id } });

    const survivor = await db.ticketSyncConfig.findUnique({
      where: { id: config.id },
      include: { _count: { select: { syncs: true, runs: true } } },
    });
    expect(survivor).not.toBeNull();
    expect(survivor?.integrationId).toBeNull();
    expect(survivor?._count.syncs).toBe(1);
    expect(survivor?._count.runs).toBe(1);
  });
});
