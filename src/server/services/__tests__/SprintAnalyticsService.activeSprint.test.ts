/**
 * Tests for which cycle `getActiveSprint` returns.
 *
 * A workspace routinely has several ACTIVE cycles (one per product, plus
 * legacy workspace-shared ones), so the query must carry an explicit order:
 * without one, Postgres returns whichever row the plan reaches first, and
 * turning on Prisma `relationJoins` flipped the Metrics page's cycle. The
 * order — most recent `startDate`, undated cycles last — must also match
 * `getWorkspaceCycles`, whose first ACTIVE entry is the Metrics page's default.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

import { SprintAnalyticsService } from "../SprintAnalyticsService";

const WORKSPACE_ID = "ws-1";

describe("SprintAnalyticsService.getActiveSprint", () => {
  it("orders by most recent startDate with undated cycles last, then createdAt and id", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.list.findFirst.mockResolvedValue(null);

    await new SprintAnalyticsService(prisma).getActiveSprint(WORKSPACE_ID);

    const args = prisma.list.findFirst.mock.calls[0]![0]!;
    expect(args.where).toEqual({
      workspaceId: WORKSPACE_ID,
      listType: "SPRINT",
      status: "ACTIVE",
    });
    expect(args.orderBy).toEqual([
      { startDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("uses the same order as getWorkspaceCycles, so the Metrics default matches", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.list.findFirst.mockResolvedValue(null);
    prisma.list.findMany.mockResolvedValue([]);
    const service = new SprintAnalyticsService(prisma);

    await service.getActiveSprint(WORKSPACE_ID);
    await service.getWorkspaceCycles(WORKSPACE_ID);

    expect(prisma.list.findFirst.mock.calls[0]![0]!.orderBy).toEqual(
      prisma.list.findMany.mock.calls[0]![0]!.orderBy,
    );
  });

  it("maps the chosen cycle and its action count", async () => {
    const prisma = mockDeep<PrismaClient>();
    const startDate = new Date("2026-10-20T00:00:00Z");
    const endDate = new Date("2026-11-03T00:00:00Z");
    prisma.list.findFirst.mockResolvedValue({
      id: "cycle-13",
      name: "Cycle 13",
      startDate,
      endDate,
      _count: { actions: 4 },
    } as never);

    const result = await new SprintAnalyticsService(prisma).getActiveSprint(
      WORKSPACE_ID,
    );

    expect(result).toEqual({
      id: "cycle-13",
      name: "Cycle 13",
      startDate,
      endDate,
      actionCount: 4,
    });
  });

  it("returns null when the workspace has no active cycle", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.list.findFirst.mockResolvedValue(null);

    await expect(
      new SprintAnalyticsService(prisma).getActiveSprint(WORKSPACE_ID),
    ).resolves.toBeNull();
  });
});
