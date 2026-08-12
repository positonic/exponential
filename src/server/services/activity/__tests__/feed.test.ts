/**
 * Unit tests for the activity feed read-side source filter + channel-summary
 * mapping (ADR-0023). Mocked Prisma — no real DB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { getActivityFeed } from "../feed";

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
