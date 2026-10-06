/**
 * Tests for how pull_request webhooks dedup into GitHubActivity rows.
 *
 * A PR can be closed and reopened more than once (opened → closed → reopened
 * → closed-as-merged). Each of those lifecycle deliveries must be stored, or
 * readers that fold PR state from the rows end on "reopened" and show a merged
 * PR as open forever. A GitHub redelivery (same X-GitHub-Delivery GUID) must
 * still collapse, including against rows written under the legacy
 * `node_id:action` key.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/db", () => ({ db: {} }));

import {
  GitHubActivityService,
  pullRequestActivityKey,
  pullRequestEventTimestamp,
} from "../GitHubActivityService";

const NODE_ID = "PR_kwDOabc123";
const REPO = "acme/widgets";

interface StoredRow {
  externalId: string;
  eventType: string;
  eventAction: string | null;
  deliveryId: string | null;
  prState: string | null;
  prMergedAt: Date | null;
}

function prEvent(
  action: string,
  opts: { state?: string; mergedAt?: string | null } = {},
) {
  return {
    action,
    pull_request: {
      number: 42,
      title: "Add widgets",
      state: opts.state ?? (action === "closed" ? "closed" : "open"),
      html_url: `https://github.com/${REPO}/pull/42`,
      created_at: "2026-10-01T09:00:00Z",
      merged_at: opts.mergedAt ?? null,
      user: { login: "octocat" },
      head: { ref: "add-widgets" },
      node_id: NODE_ID,
    },
    repository: {
      full_name: REPO,
      html_url: `https://github.com/${REPO}`,
    },
  };
}

/**
 * Prisma mock backed by an in-memory GitHubActivity table, so the service's
 * own dedup lookup sees the rows it wrote earlier in the test.
 */
function setup(seed: StoredRow[] = []) {
  const prisma: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
  const rows: StoredRow[] = [...seed];

  prisma.workspaceRepository.findFirst.mockResolvedValue({
    workspaceId: "ws-1",
    integrationId: "int-1",
  } as never);
  // linkPrToTickets: no products → no ticket linking.
  prisma.product.findMany.mockResolvedValue([]);

  prisma.gitHubActivity.findMany.mockImplementation(((args: {
    where: { externalId: { in: string[] }; eventType: string };
  }) => {
    const ids = args.where.externalId.in;
    return Promise.resolve(
      rows.filter(
        (r) => ids.includes(r.externalId) && r.eventType === args.where.eventType,
      ),
    );
  }) as never);

  prisma.gitHubActivity.create.mockImplementation(((args: {
    data: StoredRow;
  }) => {
    const { data } = args;
    if (
      rows.some(
        (r) => r.externalId === data.externalId && r.eventType === data.eventType,
      )
    ) {
      return Promise.reject(new Error("Unique constraint failed"));
    }
    rows.push({
      externalId: data.externalId,
      eventType: data.eventType,
      eventAction: data.eventAction,
      deliveryId: data.deliveryId,
      prState: data.prState,
      prMergedAt: data.prMergedAt,
    });
    return Promise.resolve(data);
  }) as never);

  return { service: new GitHubActivityService(prisma), rows };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("pullRequestActivityKey", () => {
  it("includes the delivery GUID for repeatable lifecycle actions", () => {
    expect(pullRequestActivityKey(NODE_ID, "closed", "d-1")).toBe(
      `${NODE_ID}:closed:d-1`,
    );
    expect(pullRequestActivityKey(NODE_ID, "reopened", "d-1")).toBe(
      `${NODE_ID}:reopened:d-1`,
    );
  });

  it("keeps one key per PR and action for everything else", () => {
    expect(pullRequestActivityKey(NODE_ID, "opened", "d-1")).toBe(
      `${NODE_ID}:opened`,
    );
    expect(pullRequestActivityKey(NODE_ID, "synchronize", "d-1")).toBe(
      `${NODE_ID}:synchronize`,
    );
  });
});

describe("pullRequestEventTimestamp", () => {
  const received = new Date("2026-10-04T00:00:00Z");
  const pr = {
    ...prEvent("closed").pull_request,
    closed_at: "2026-10-02T10:00:00Z",
    updated_at: "2026-10-02T11:00:00Z",
  };

  it("stamps a close and a reopen by GitHub's clock, not receipt time", () => {
    // Delivered out of order, the close still sorts before the reopen.
    expect(pullRequestEventTimestamp("closed", pr, received)).toEqual(
      new Date("2026-10-02T10:00:00Z"),
    );
    expect(pullRequestEventTimestamp("reopened", pr, received)).toEqual(
      new Date("2026-10-02T11:00:00Z"),
    );
  });

  it("uses created_at for opened and merged_at once merged", () => {
    expect(pullRequestEventTimestamp("opened", pr, received)).toEqual(
      new Date("2026-10-01T09:00:00Z"),
    );
    expect(
      pullRequestEventTimestamp(
        "closed",
        { ...pr, merged_at: "2026-10-03T12:00:00Z" },
        received,
      ),
    ).toEqual(new Date("2026-10-03T12:00:00Z"));
  });

  it("falls back to receipt time when the payload has no timestamp", () => {
    expect(
      pullRequestEventTimestamp("closed", { ...pr, closed_at: null }, received),
    ).toEqual(received);
    expect(pullRequestEventTimestamp("synchronize", pr, received)).toEqual(
      received,
    );
  });
});

describe("GitHubActivityService.processPullRequestEvent dedup", () => {
  it("stores every close and reopen of a PR that is closed, reopened, then merged", async () => {
    const { service, rows } = setup();

    await service.processPullRequestEvent(prEvent("opened"), "d-open");
    await service.processPullRequestEvent(prEvent("closed"), "d-close-1");
    await service.processPullRequestEvent(prEvent("reopened"), "d-reopen-1");
    await service.processPullRequestEvent(prEvent("closed"), "d-close-2");
    await service.processPullRequestEvent(prEvent("reopened"), "d-reopen-2");
    await service.processPullRequestEvent(
      prEvent("closed", { mergedAt: "2026-10-03T12:00:00Z" }),
      "d-merge",
    );

    expect(rows.map((r) => r.eventAction)).toEqual([
      "opened",
      "closed",
      "reopened",
      "closed",
      "reopened",
      "closed",
    ]);
    // The final row is the merge, so a fold over the rows ends merged.
    expect(rows.at(-1)).toMatchObject({
      deliveryId: "d-merge",
      prState: "merged",
      prMergedAt: new Date("2026-10-03T12:00:00Z"),
    });
  });

  it("drops a redelivery of the same close", async () => {
    const { service, rows } = setup();

    await service.processPullRequestEvent(prEvent("closed"), "d-close");
    await service.processPullRequestEvent(prEvent("closed"), "d-close");

    expect(rows).toHaveLength(1);
  });

  it("drops a redelivery of a close stored under the legacy key", async () => {
    const { service, rows } = setup([
      {
        externalId: `${NODE_ID}:closed`,
        eventType: "pull_request",
        eventAction: "closed",
        deliveryId: "d-old-close",
        prState: "closed",
        prMergedAt: null,
      },
    ]);

    await service.processPullRequestEvent(prEvent("closed"), "d-old-close");

    expect(rows).toHaveLength(1);
  });

  it("stores a new close even when a legacy-keyed close already exists", async () => {
    const { service, rows } = setup([
      {
        externalId: `${NODE_ID}:closed`,
        eventType: "pull_request",
        eventAction: "closed",
        deliveryId: "d-old-close",
        prState: "closed",
        prMergedAt: null,
      },
      {
        externalId: `${NODE_ID}:reopened`,
        eventType: "pull_request",
        eventAction: "reopened",
        deliveryId: "d-old-reopen",
        prState: "open",
        prMergedAt: null,
      },
    ]);

    await service.processPullRequestEvent(
      prEvent("closed", { mergedAt: "2026-10-03T12:00:00Z" }),
      "d-merge",
    );

    expect(rows).toHaveLength(3);
    expect(rows.at(-1)).toMatchObject({
      externalId: `${NODE_ID}:closed:d-merge`,
      prState: "merged",
    });
  });

  it("keeps one row per non-lifecycle action across deliveries", async () => {
    const { service, rows } = setup();

    await service.processPullRequestEvent(prEvent("synchronize"), "d-push-1");
    await service.processPullRequestEvent(prEvent("synchronize"), "d-push-2");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.externalId).toBe(`${NODE_ID}:synchronize`);
  });
});

describe("GitHubActivityService.getActivitySummary", () => {
  it("counts a merged PR once however many rows carry prState merged", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.gitHubActivity.findMany.mockResolvedValue([
      { eventType: "pull_request", eventAction: "opened", prState: "open", prNumber: 42, repoFullName: REPO, actionId: null },
      { eventType: "pull_request", eventAction: "closed", prState: "merged", prNumber: 42, repoFullName: REPO, actionId: null },
      { eventType: "pull_request", eventAction: "labeled", prState: "merged", prNumber: 42, repoFullName: REPO, actionId: null },
      { eventType: "pull_request", eventAction: "closed", prState: "merged", prNumber: 7, repoFullName: REPO, actionId: null },
    ] as never);

    const summary = await new GitHubActivityService(prisma).getActivitySummary(
      "ws-1",
      new Date("2026-10-01"),
    );

    expect(summary.totalPRsOpened).toBe(1);
    expect(summary.totalPRsMerged).toBe(2);
  });
});
