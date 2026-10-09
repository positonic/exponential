/**
 * Tests for the PR counts in the daily sprint snapshot.
 *
 * Each close of a PR is its own GitHubActivity row, so a PR closed, reopened
 * and then merged on the same day has two "closed" rows. The snapshot must
 * count PRs, not rows, and only a close with merged_at is a merge.
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

const REPO = "acme/widgets";
const MERGED_AT = new Date("2026-10-05T12:00:00Z");

function prRow(eventAction: string, prNumber: number, prMergedAt: Date | null = null) {
  return { eventAction, prNumber, repoFullName: REPO, prMergedAt };
}

describe("SprintAnalyticsService.captureDailySnapshot PR counts", () => {
  it("counts a PR closed, reopened and merged today as one merge", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.gitHubActivity.count.mockResolvedValue(0);
    prisma.gitHubActivity.findMany.mockResolvedValue([
      prRow("opened", 42),
      prRow("closed", 42),
      prRow("closed", 42, MERGED_AT),
      // Closed without merging: not a merge.
      prRow("opened", 7),
      prRow("closed", 7),
    ] as never);
    prisma.sprintSnapshot.upsert.mockResolvedValue({
      id: "snap-1",
      snapshotDate: new Date("2026-10-05"),
    } as never);

    const service = new SprintAnalyticsService(prisma);
    vi.spyOn(service, "getSprintMetrics").mockResolvedValue({
      kanbanCounts: {},
      plannedEffort: 0,
      completedEffort: 0,
      completedActions: 0,
    } as never);

    await service.captureDailySnapshot("list-1");

    const { create } = prisma.sprintSnapshot.upsert.mock.calls[0]![0];
    expect(create).toMatchObject({ prsOpened: 2, prsMerged: 1 });
    // Commit count is pushes only, not every activity row.
    expect(prisma.gitHubActivity.count.mock.calls[0]![0]).toMatchObject({
      where: { eventType: "push" },
    });
  });
});
