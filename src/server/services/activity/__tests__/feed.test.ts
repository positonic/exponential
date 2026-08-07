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

  // The regression this guards: "internal" used to mean "not a channel
  // summary", which quietly filed every merged PR under the Exponential chip
  // once GitHub started writing feed rows.
  it("excludes GitHub rows from internal, not just channel summaries", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);

    await getActivityFeed(db, { workspaceId: WORKSPACE_ID, source: "internal" });

    expect(db.workspaceActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: { not: "channel_summary" },
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
