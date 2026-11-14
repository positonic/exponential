/**
 * Unit tests for the activity feed read-side source filter + channel-summary
 * mapping (ADR-0023). Mocked Prisma — no real DB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { getActivityFeed, getAggregatedActivityFeed } from "../feed";

const WORKSPACE_ID = "ws-1";

function channelRow() {
  return {
    id: "evt-1",
    createdAt: new Date("2026-06-17T00:00:00.000Z"),
    entityType: "channel_summary",
    entityId: "whatsapp:123@g.us:2026-06-16T00:00:00.000Z",
    action: "summarized",
    metadata: {
      provider: "whatsapp",
      displayName: "Senior Staff Updates",
      summary: "Alice shipped the release; Bob is blocked on the API key.",
      projectId: "proj-1",
    },
    user: null,
  };
}

describe("getActivityFeed — channel summaries + source filter", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("maps a channel_summary row to a channel ref with the routed project", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([channelRow()] as never);
    db.project.findMany.mockResolvedValue([
      { id: "proj-1", slug: "release", name: "Release" },
    ] as never);

    const { events } = await getActivityFeed(db, { workspaceId: WORKSPACE_ID });

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.source).toBe("whatsapp");
    expect(event.actor).toBeNull(); // never a human avatar
    expect(event.channel).toEqual({
      provider: "whatsapp",
      displayName: "Senior Staff Updates",
      summary: "Alice shipped the release; Bob is blocked on the API key.",
      projectId: "proj-1",
      projectSlug: "release",
      projectName: "Release",
    });
  });

  it("filters to a provider's channel_summary rows when source is a provider", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "whatsapp" });

    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          entityType: "channel_summary",
          metadata: { path: ["provider"], equals: "whatsapp" },
        }),
      }),
    );
  });

  it("excludes channel summaries and hidden types when source is internal", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "internal" });

    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          entityType: { notIn: ["channel_summary", "ticket_sync_run"] },
        }),
      }),
    );
  });

  it("excludes only hidden types for 'all' (default)", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "all" });

    const call = db.workspaceActivityEvent.findMany.mock.calls[0]![0]!;
    expect(call.where).toMatchObject({
      entityType: { notIn: ["ticket_sync_run"] },
    });
    expect(call.where).not.toHaveProperty("metadata");
  });

  // The regression this guards: "internal" used to mean "not a channel
  // summary", which quietly filed every merged PR under the Exponential chip
  // once GitHub started writing feed rows.
  it("excludes GitHub rows from internal, not just channel summaries", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "internal" });

    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: { notIn: ["channel_summary", "ticket_sync_run"] },
          NOT: { entityType: { startsWith: "github" } },
        }),
      }),
    );
  });

  it("selects only GitHub rows when source is github", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "github" });

    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          entityType: { startsWith: "github" },
        }),
      }),
    );
  });

  it("resolves a github row into a GitHubRef the row component can render", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      {
        id: "evt-gh",
        createdAt: new Date("2026-08-04T19:54:42.000Z"),
        entityType: "github_pull_request",
        // Two-digit PR number on purpose: the repo's hardcoded-colour
        // pre-commit check reads a hash followed by 3-8 hex digits as a colour
        // literal, so a three-digit PR ref here would fail the commit.
        entityId: "positonic/exponential#64",
        action: "completed",
        metadata: {
          title: "feat: grant agents access to multiple workspaces at once",
          repoFullName: "positonic/exponential",
          repoUrl: "https://github.com/positonic/exponential",
          branchName: "feat/agent-workspaces",
          prNumber: 497,
          prUrl: "https://github.com/positonic/exponential/pull/497",
          author: "positonic",
          merged: true,
        },
        user: null,
      },
    ] as never);

    const { events } = await getActivityFeed(db, { workspaceId: WORKSPACE_ID });

    expect(events[0]!.source).toBe("github");
    expect(events[0]!.channel).toBeNull();
    expect(events[0]!.github).toEqual(
      expect.objectContaining({
        kind: "pull_request",
        repoFullName: "positonic/exponential",
        prNumber: 497,
        author: "positonic",
        merged: true,
      }),
    );
    // The PR title, not the raw entity id, is what the sentence renders.
    expect(events[0]!.entityRef).toBe(
      "feat: grant agents access to multiple workspaces at once",
    );
  });
});

describe("activity feeds — the \"Mine\" actor filter", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);
  });

  it("narrows the workspace feed to the actor's own events", async () => {
    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, actorUserId: "user-1" });

    const call = db.workspaceActivityEvent.findMany.mock.calls[0]![0]!;
    expect(call.where).toMatchObject({ workspaceId: WORKSPACE_ID, userId: "user-1" });
  });

  it("narrows the cross-workspace feed to the actor's own events", async () => {
    await getAggregatedActivityFeed(db, {
      workspaceIds: [WORKSPACE_ID, "ws-2"],
      actorUserId: "user-1",
    });

    const call = db.workspaceActivityEvent.findMany.mock.calls[0]![0]!;
    expect(call.where).toMatchObject({
      workspaceId: { in: [WORKSPACE_ID, "ws-2"] },
      userId: "user-1",
    });
  });

  it("leaves the actor unfiltered without actorUserId", async () => {
    await getActivityFeed(db, { workspaceId: WORKSPACE_ID });

    const call = db.workspaceActivityEvent.findMany.mock.calls[0]![0]!;
    expect(call.where).not.toHaveProperty("userId");
  });
});

function okrRow(
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> | null = null,
  action = "created",
) {
  return {
    id: `evt-${entityType}-${entityId}`,
    createdAt: new Date("2026-06-17T00:00:00.000Z"),
    entityType,
    entityId,
    action,
    metadata,
    user: null,
  };
}

describe("getActivityFeed — OKR drawer deep-links (drawerParam)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  async function drawerParamOf(row: ReturnType<typeof okrRow>) {
    db.workspaceActivityEvent.findMany.mockResolvedValue([row] as never);
    const { events } = await getActivityFeed(db, { workspaceId: WORKSPACE_ID });
    return events[0]!.drawerParam;
  }

  it("targets the objective drawer from a goal row's entityId", async () => {
    expect(await drawerParamOf(okrRow("goal", "42", { title: "Grow" }))).toBe(
      "objective:42",
    );
  });

  it("targets the parent objective from metadata.goalId on child rows (number or string)", async () => {
    expect(
      await drawerParamOf(okrRow("goal_update", "upd-1", { goalId: 42 })),
    ).toBe("objective:42");
    expect(
      await drawerParamOf(okrRow("goal_comment", "cmt-1", { goalId: "42" })),
    ).toBe("objective:42");
  });

  it("targets the KR drawer from entityId on create/delete rows", async () => {
    expect(await drawerParamOf(okrRow("key_result", "kr-1", { title: "KR" }))).toBe(
      "keyResult:kr-1",
    );
  });

  it("prefers metadata.keyResultId on check-in rows (entityId is the check-in)", async () => {
    expect(
      await drawerParamOf(
        okrRow("key_result", "ci-1", { keyResultId: "kr-9" }, "checked_in"),
      ),
    ).toBe("keyResult:kr-9");
  });

  it("targets the parent KR from metadata on KR comment rows, null when absent", async () => {
    expect(
      await drawerParamOf(
        okrRow("key_result_comment", "cmt-2", { keyResultId: "kr-9" }),
      ),
    ).toBe("keyResult:kr-9");
    expect(
      await drawerParamOf(okrRow("key_result_comment", "cmt-3", {})),
    ).toBeNull();
  });

  it("is null for deleted rows — the target is gone, never link it", async () => {
    expect(
      await drawerParamOf(okrRow("goal", "42", { title: "Gone" }, "deleted")),
    ).toBeNull();
    expect(
      await drawerParamOf(okrRow("key_result", "kr-1", { title: "Gone" }, "deleted")),
    ).toBeNull();
  });

  it("is null for non-OKR rows", async () => {
    expect(await drawerParamOf(okrRow("action", "act-1", { name: "Task" }))).toBeNull();
    expect(
      await drawerParamOf(okrRow("ticket", "tkt-1", { title: "T" })),
    ).toBeNull();
  });
});

describe("agent-run rows", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  function agentRunRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "evt-run",
      createdAt: new Date("2026-11-14T10:00:00.000Z"),
      entityType: "agent_run",
      entityId: "run-a1b2c3d4e5",
      action: "completed",
      metadata: {
        title: "Fix sharing bug",
        actionId: "action-1",
        status: "SUCCEEDED",
        summary: "Found the missing grant check and added a test.",
      },
      user: { id: "shadow-1", name: "Aria", image: null, isAgent: true },
      ...overrides,
    };
  }

  it("names the action the run worked on and carries the run's summary", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([agentRunRow()] as never);

    const { events } = await getActivityFeed(db, { workspaceId: WORKSPACE_ID });

    const event = events[0]!;
    expect(event.entityRef).toBe("Fix sharing bug");
    expect(event.hint.template).toBe("{actor} completed a run on {entityRef}");
    expect(event.agentRun).toEqual({
      actionId: "action-1",
      summary: "Found the missing grant check and added a test.",
    });
  });

  it("renders a run that did not succeed as failed, with no summary when it left none", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      agentRunRow({
        action: "failed",
        metadata: { title: "Fix sharing bug", actionId: "action-1", status: "TIMED_OUT", summary: null },
      }),
    ] as never);

    const { events } = await getActivityFeed(db, { workspaceId: WORKSPACE_ID });

    expect(events[0]!.hint).toEqual({
      template: "{actor}'s run failed on {entityRef}",
      iconKind: "failed",
    });
    expect(events[0]!.agentRun).toEqual({ actionId: "action-1", summary: null });
  });

  it("falls back to the id slice for a run recorded before titles were stored", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      agentRunRow({ metadata: { actionId: "action-1", status: "SUCCEEDED", summary: null } }),
    ] as never);

    const { events } = await getActivityFeed(db, { workspaceId: WORKSPACE_ID });

    expect(events[0]!.entityRef).toBe("run-a1b2");
    expect(events[0]!.hint.template).toBe("{actor} completed a run on {entityRef}");
  });

  it("leaves agentRun null on every other kind of row", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      agentRunRow({ entityType: "action", action: "created", metadata: { title: "Write docs" } }),
    ] as never);

    const { events } = await getAggregatedActivityFeed(db, { workspaceIds: [WORKSPACE_ID] });

    expect(events[0]!.agentRun).toBeNull();
  });
});
