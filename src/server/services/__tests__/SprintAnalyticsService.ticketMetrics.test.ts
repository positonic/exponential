/**
 * Regression tests for the Ticket-based cycle metrics (ADR-0047 amendment).
 *
 * These guard the entity the Metrics page counts: cycle **Tickets**
 * (`Ticket.cycleId`, status in DONE/DEPLOYED), NOT Actions. The original
 * feature shipped counting Actions and returned all-zeros for real
 * ticket-driven cycles (CLEAR workspace) — this pins the corrected behavior.
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

type TicketRow = { status: string; points: number | null };

/**
 * Minimal Prisma stub: a fixed cycle List and a canned ticket set. Only the
 * two methods getCycleTicketMetrics touches are implemented.
 */
function makeService(tickets: TicketRow[]) {
  const prisma = {
    list: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "cycle-1",
        name: "Cycle 8",
        startDate: null,
        endDate: null,
      }),
    },
    ticket: {
      findMany: vi.fn().mockResolvedValue(tickets),
    },
  } as unknown as PrismaClient;

  return new SprintAnalyticsService(prisma);
}

describe("SprintAnalyticsService.getCycleTicketMetrics", () => {
  it("counts DONE and DEPLOYED tickets as completed, others as not", async () => {
    const service = makeService([
      { status: "DONE", points: 3 },
      { status: "DEPLOYED", points: 2 },
      { status: "IN_PROGRESS", points: 5 },
      { status: "BACKLOG", points: null },
      { status: "QA", points: 1 },
    ]);

    const m = await service.getCycleTicketMetrics("cycle-1");

    expect(m.totalTickets).toBe(5);
    expect(m.completedTickets).toBe(2); // DONE + DEPLOYED only
    expect(m.completedPoints).toBe(5); // 3 + 2
    expect(m.totalPoints).toBe(11); // 3 + 2 + 5 + 0 + 1
    expect(m.completionRate).toBeCloseTo(40); // 2/5
    expect(m.statusCounts).toMatchObject({
      DONE: 1,
      DEPLOYED: 1,
      IN_PROGRESS: 1,
      BACKLOG: 1,
      QA: 1,
    });
    expect(m.cycleName).toBe("Cycle 8");
  });

  it("returns zeros (no NaN) for an empty cycle", async () => {
    const service = makeService([]);

    const m = await service.getCycleTicketMetrics("cycle-1");

    expect(m.totalTickets).toBe(0);
    expect(m.completedTickets).toBe(0);
    expect(m.completedPoints).toBe(0);
    expect(m.totalPoints).toBe(0);
    expect(m.completionRate).toBe(0);
    expect(Number.isNaN(m.completionRate)).toBe(false);
  });

  it("treats missing points as zero without dropping the ticket from counts", async () => {
    const service = makeService([
      { status: "DEPLOYED", points: null },
      { status: "DONE", points: null },
    ]);

    const m = await service.getCycleTicketMetrics("cycle-1");

    expect(m.completedTickets).toBe(2);
    expect(m.completedPoints).toBe(0);
    expect(m.completionRate).toBe(100);
  });
});
