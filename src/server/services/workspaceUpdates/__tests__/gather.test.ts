import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { gatherShippedWork, SOURCE_WEIGHT } from "../gather";

const db = mockDeep<PrismaClient>();
const input = {
  workspaceId: "ws-1",
  workspaceSlug: "acme",
  windowStart: new Date("2026-09-25T07:00:00.000Z"),
  windowEnd: new Date("2026-10-02T07:00:00.000Z"),
  baseUrl: "https://app.test",
};

function stubNothing() {
  db.featureScope.findMany.mockResolvedValue([]);
  db.ticket.findMany.mockResolvedValue([]);
  db.workspaceActivityEvent.findMany.mockResolvedValue([]);
  db.list.findMany.mockResolvedValue([]);
  db.goalUpdate.findMany.mockResolvedValue([]);
  db.feature.findMany.mockResolvedValue([]);
  db.gitHubActivity.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  mockReset(db);
  stubNothing();
});

describe("gatherShippedWork", () => {
  it("normalises every source with absolute links and weights", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      { entityId: "feat-1", createdAt: new Date("2026-09-30T12:00:00.000Z") },
    ] as never);
    db.feature.findMany.mockResolvedValue([
      { id: "feat-1", name: "Dark mode", description: "Easier on the eyes", product: { slug: "core" } },
    ] as never);
    db.list.findMany.mockResolvedValue([
      { id: "cyc-1", name: "Cycle 12", achievements: "Shipped bulk edit", endDate: new Date("2026-10-01T00:00:00.000Z"), product: { slug: "core" } },
      { id: "cyc-2", name: "Cycle 13", achievements: "   ", endDate: new Date("2026-10-01T00:00:00.000Z"), product: null },
    ] as never);
    db.goalUpdate.findMany.mockResolvedValue([
      { id: "gu-1", content: "Signups up 20%", createdAt: new Date("2026-09-28T00:00:00.000Z"), goal: { id: 7, title: "Grow signups" } },
    ] as never);

    const items = await gatherShippedWork(db, input);

    expect(items).toEqual([
      expect.objectContaining({
        id: "feature:feat-1",
        source: "feature",
        url: "https://app.test/w/acme/products/core/features/feat-1",
        weight: SOURCE_WEIGHT.feature,
        at: "2026-09-30T12:00:00.000Z",
      }),
      expect.objectContaining({ id: "cycle:cyc-1", title: "Cycle 12 wrapped up", detail: "Shipped bulk edit" }),
      expect.objectContaining({ id: "goal_update:gu-1", url: "https://app.test/w/acme/goals/7" }),
    ]);
    // Going Live is read from status-change events into SHIPPED.
    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: "feature", metadata: { path: ["to"], equals: "SHIPPED" } }),
      }),
    );
    // Only on-track goal updates are ever considered.
    expect(db.goalUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ health: "on-track" }) }),
    );
    // Richer sources exist, so merged PRs are never consulted.
    expect(db.gitHubActivity.findMany).not.toHaveBeenCalled();
  });

  it("falls back to merged PRs only when nothing richer shipped, minus internal ones", async () => {
    db.ticket.findMany.mockResolvedValue([
      { id: "t-1", number: 1, title: "Bump deps", type: "CHORE", completedAt: new Date(), product: { slug: "core" } },
    ] as never);
    db.gitHubActivity.findMany.mockResolvedValue([
      { prNumber: 5, prTitle: "feat(search): instant results", prUrl: "https://gh/5", prMergedAt: new Date("2026-09-30T00:00:00.000Z"), repoFullName: "acme/app" },
      { prNumber: 5, prTitle: "feat(search): instant results", prUrl: "https://gh/5", prMergedAt: new Date("2026-09-30T00:00:00.000Z"), repoFullName: "acme/app" },
      { prNumber: 6, prTitle: "chore: bump deps", prUrl: "https://gh/6", prMergedAt: new Date("2026-09-30T00:00:00.000Z"), repoFullName: "acme/app" },
      { prNumber: 7, prTitle: "Improve onboarding copy", prUrl: "https://gh/7", prMergedAt: new Date("2026-09-30T00:00:00.000Z"), repoFullName: "acme/app" },
    ] as never);

    const items = await gatherShippedWork(db, input);
    const prs = items.filter((i) => i.source === "pull_request");

    expect(prs.map((p) => p.title)).toEqual(["instant results", "Improve onboarding copy"]);
    expect(prs.every((p) => p.weight === SOURCE_WEIGHT.pull_request)).toBe(true);
  });

  it("attaches each ticket and milestone to its feature, with a short summary", async () => {
    const feature = {
      id: "feat-9",
      name: "Workspace updates",
      description: "## What it is\n\nA weekly update, written for you.",
      product: { slug: "core" },
    };
    db.ticket.findMany.mockResolvedValue([
      {
        id: "t-9",
        number: 9,
        title: "V2: Publish & distribute on approval",
        type: "FEATURE",
        body: "## Parent\n\nx\n\n## What to build\n\nApproving an update **sends** it.\n\n## Actions\n\n1. y",
        completedAt: new Date("2026-09-30T00:00:00.000Z"),
        product: { slug: "core" },
        feature,
      },
    ] as never);
    db.featureScope.findMany.mockResolvedValue([
      {
        id: "s-9",
        version: "V1",
        description: "Weekly draft and owner approval.",
        shippedAt: new Date("2026-09-29T00:00:00.000Z"),
        feature,
      },
    ] as never);

    const items = await gatherShippedWork(db, input);

    const expectedFeature = {
      id: "feat-9",
      name: "Workspace updates",
      description: "A weekly update, written for you.",
      url: "https://app.test/w/acme/products/core/features/feat-9",
    };
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ticket:t-9",
          title: "V2: Publish & distribute on approval",
          detail: "Approving an update sends it.",
          feature: expectedFeature,
        }),
        expect.objectContaining({
          id: "feature_scope:s-9",
          title: "Weekly draft and owner approval.",
          feature: expectedFeature,
        }),
      ]),
    );
  });
});
