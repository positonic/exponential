/**
 * Tests for `getDeliveryFlow`: the queries it issues (workspace-scoped,
 * completed-only, trailing window, member filter) and that it feeds the
 * shared `computeDeliveryFlow` with status moves from the event log.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

import type { PrismaClient } from "@prisma/client";
import { SprintAnalyticsService } from "../SprintAnalyticsService";

const d = (iso: string) => new Date(iso);

function makeService(opts: {
  tickets: { id: string; status: string; completedAt: Date | null; updatedAt: Date }[];
  events: { entityId: string; metadata: unknown; createdAt: Date }[];
}) {
  const prisma = {
    ticket: { findMany: vi.fn().mockResolvedValue(opts.tickets) },
    workspaceActivityEvent: { findMany: vi.fn().mockResolvedValue(opts.events) },
  };
  return {
    service: new SprintAnalyticsService(prisma as unknown as PrismaClient),
    prisma,
  };
}

describe("SprintAnalyticsService.getDeliveryFlow", () => {
  it("scopes to the workspace's completed tickets edited inside the window, and reads their status events", async () => {
    const now = Date.now();
    const { service, prisma } = makeService({
      tickets: [
        { id: "a", status: "DONE", completedAt: null, updatedAt: new Date(now - 3_600_000) },
      ],
      events: [
        { entityId: "a", metadata: { to: "IN_PROGRESS" }, createdAt: new Date(now - 48 * 3_600_000) },
        { entityId: "a", metadata: { to: "DONE" }, createdAt: new Date(now - 24 * 3_600_000) },
      ],
    });

    const result = await service.getDeliveryFlow("ws-1", { weeks: 8, memberIds: ["u1", "u2"] });

    const ticketQuery = prisma.ticket.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(ticketQuery.where).toMatchObject({
      product: { workspaceId: "ws-1" },
      status: { in: ["DONE", "DEPLOYED"] },
      assigneeId: { in: ["u1", "u2"] },
    });
    const gte = (ticketQuery.where.updatedAt as { gte: Date }).gte;
    // 8 weeks back from the end of today: between 56 and 57 days ago.
    const daysAgo = (now - gte.getTime()) / 86_400_000;
    expect(daysAgo).toBeGreaterThan(55);
    expect(daysAgo).toBeLessThan(57);

    const eventQuery = prisma.workspaceActivityEvent.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(eventQuery.where).toEqual({
      workspaceId: "ws-1",
      entityType: "ticket",
      entityId: { in: ["a"] },
      action: "status_changed",
    });
    expect(eventQuery.orderBy).toEqual({ createdAt: "asc" });

    expect(result.weeks).toBe(8);
    expect(result.throughput).toHaveLength(8);
    expect(result.completedInWindow).toBe(1);
    expect(result.datedByEvents).toBe(1);
    expect(result.cycleTime.sampleSize).toBe(1);
    expect(result.cycleTime.p50Hours).toBeNull();
  });

  it("omits the assignee clause when the member filter is off, and skips the event query with no tickets", async () => {
    const { service, prisma } = makeService({ tickets: [], events: [] });

    const result = await service.getDeliveryFlow("ws-1");

    const ticketQuery = prisma.ticket.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(ticketQuery.where).not.toHaveProperty("assigneeId");
    expect(prisma.workspaceActivityEvent.findMany).not.toHaveBeenCalled();
    expect(result.weeks).toBe(12);
    expect(result.throughput).toHaveLength(12);
    expect(result.completedInWindow).toBe(0);
    expect(result.recentWeeklyAverage).toBe(0);
  });

  it("dates a completed ticket with no status event by completedAt, not by the window-start query", async () => {
    const { service } = makeService({
      tickets: [
        { id: "old", status: "DONE", completedAt: d("2020-01-01T00:00:00Z"), updatedAt: new Date() },
      ],
      events: [],
    });
    const result = await service.getDeliveryFlow("ws-1", { weeks: 4 });
    expect(result.completedInWindow).toBe(0);
  });
});
