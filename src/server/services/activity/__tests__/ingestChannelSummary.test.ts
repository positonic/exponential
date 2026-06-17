/**
 * Unit tests for `ingestChannelSummary` (ADR-0023) — the routing + idempotency
 * logic behind the `recordChannelSummary` endpoint.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Asserts external behavior: a routed
 * event, a dropped summary, a deduped (updated) row — never internal call order.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { ingestChannelSummary } from "../ingestChannelSummary";

const PROVIDER = "whatsapp";
const EXTERNAL_ID = "12345@g.us";
const WORKSPACE_ID = "ws-1";
const PROJECT_ID = "proj-1";
const CREATOR_ID = "user-1";
const WINDOW_START = "2026-06-16T00:00:00.000Z";
const WINDOW_END = "2026-06-17T00:00:00.000Z";
const ENTITY_ID = `${PROVIDER}:${EXTERNAL_ID}:${WINDOW_START}`;

function baseInput() {
  return {
    provider: PROVIDER,
    externalId: EXTERNAL_ID,
    summary: "3 messages about the Friday release; Alice is blocked on the API key.",
    displayName: "Finance Team",
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    messageCount: 3,
  };
}

function mockLink(
  db: DeepMockProxy<PrismaClient>,
  overrides: Partial<{
    isActive: boolean;
    workspaceId: string;
    projectId: string | null;
    createdById: string | null;
  }> = {},
) {
  db.channelLink.findUnique.mockResolvedValue({
    id: "cl-1",
    provider: PROVIDER,
    externalId: EXTERNAL_ID,
    displayName: "Finance Team",
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID,
    projectId: "projectId" in overrides ? overrides.projectId : PROJECT_ID,
    isActive: overrides.isActive ?? true,
    createdById: "createdById" in overrides ? overrides.createdById : CREATOR_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
}

describe("ingestChannelSummary", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  describe("drop-if-unlinked", () => {
    it("drops when no link exists, writing nothing", async () => {
      db.channelLink.findUnique.mockResolvedValue(null as never);

      const result = await ingestChannelSummary(db, baseInput());

      expect(result).toEqual({ status: "dropped" });
      expect(db.workspaceActivityEvent.findFirst).not.toHaveBeenCalled();
      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
      expect(db.workspaceActivityEvent.update).not.toHaveBeenCalled();
    });

    it("drops when the link is inactive", async () => {
      mockLink(db, { isActive: false });

      const result = await ingestChannelSummary(db, baseInput());

      expect(result).toEqual({ status: "dropped" });
      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("record (new window)", () => {
    it("routes to the link's workspace and maps metadata, with userId = createdById", async () => {
      mockLink(db);
      db.workspaceActivityEvent.findFirst.mockResolvedValue(null as never);

      const result = await ingestChannelSummary(db, baseInput());

      expect(result).toMatchObject({ status: "recorded", deduped: false });
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
        data: {
          workspaceId: WORKSPACE_ID,
          userId: CREATOR_ID, // userId = ChannelLink.createdById
          entityType: "channel_summary",
          entityId: ENTITY_ID,
          action: "summarized",
          metadata: {
            provider: PROVIDER,
            externalId: EXTERNAL_ID,
            displayName: "Finance Team",
            projectId: PROJECT_ID,
            messageCount: 3,
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            summary: baseInput().summary,
          },
        },
      });
      expect(db.workspaceActivityEvent.update).not.toHaveBeenCalled();
    });

    it("carries a null projectId for a workspace-only link", async () => {
      mockLink(db, { projectId: null });
      db.workspaceActivityEvent.findFirst.mockResolvedValue(null as never);

      await ingestChannelSummary(db, baseInput());

      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({ projectId: null }),
          }),
        }),
      );
    });
  });

  describe("dedup (re-delivery)", () => {
    it("updates the existing event for the same window instead of inserting", async () => {
      mockLink(db);
      db.workspaceActivityEvent.findFirst.mockResolvedValue({
        id: "evt-existing",
      } as never);

      const result = await ingestChannelSummary(db, baseInput());

      expect(result).toEqual({
        status: "recorded",
        eventId: "evt-existing",
        deduped: true,
      });
      expect(db.workspaceActivityEvent.update).toHaveBeenCalledWith({
        where: { id: "evt-existing" },
        data: expect.objectContaining({
          userId: CREATOR_ID,
          action: "summarized",
        }),
      });
      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });

    it("looks up the dedup row by (workspace, channel_summary, window entityId)", async () => {
      mockLink(db);
      db.workspaceActivityEvent.findFirst.mockResolvedValue(null as never);

      await ingestChannelSummary(db, baseInput());

      expect(db.workspaceActivityEvent.findFirst).toHaveBeenCalledWith({
        where: {
          workspaceId: WORKSPACE_ID,
          entityType: "channel_summary",
          entityId: ENTITY_ID,
        },
        select: { id: true },
      });
    });
  });
});
