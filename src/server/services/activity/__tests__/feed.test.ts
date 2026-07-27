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

  it("excludes channel summaries when source is internal", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "internal" });

    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          entityType: { not: "channel_summary" },
        }),
      }),
    );
  });

  it("applies no source constraint for 'all' (default)", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "all" });

    const call = db.workspaceActivityEvent.findMany.mock.calls[0]![0]!;
    expect(call.where).not.toHaveProperty("entityType");
    expect(call.where).not.toHaveProperty("metadata");
  });
});
