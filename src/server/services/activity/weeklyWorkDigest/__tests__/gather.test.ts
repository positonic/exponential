/**
 * Unit tests for gatherWeeklyWorkBundle — the deterministic 3-source bundler.
 * Uses mockDeep<PrismaClient>() so it runs in ms and CANNOT touch a real DB
 * (CLAUDE.md test-db safety). Asserts the scoping (userId + workspaceIds +
 * week window) and the shaping of each source into the bundle.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { gatherWeeklyWorkBundle } from "../gather";

const db = mockDeep<PrismaClient>();

const weekStart = new Date("2026-06-08T00:00:00Z");
const weekEnd = new Date("2026-06-14T23:59:59Z");
const baseArgs = {
  userId: "user-1",
  workspaceIds: ["ws-1", "ws-2"],
  weekStart,
  weekEnd,
};

beforeEach(() => mockReset(db));

describe("gatherWeeklyWorkBundle", () => {
  it("short-circuits to an empty bundle with no DB calls when workspaceIds is empty", async () => {
    const out = await gatherWeeklyWorkBundle(db, { ...baseArgs, workspaceIds: [] });
    expect(out).toEqual({ events: [], tickets: [], meetings: [], totalSignals: 0 });
    expect(db.workspaceActivityEvent.findMany).not.toHaveBeenCalled();
    expect(db.ticket.findMany).not.toHaveBeenCalled();
    expect(db.transcriptionSessionParticipant.findMany).not.toHaveBeenCalled();
  });

  it("scopes every query to the user, the workspaces, and the week window", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([] as never);

    await gatherWeeklyWorkBundle(db, baseArgs);

    const eventWhere = (db.workspaceActivityEvent.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(eventWhere).toMatchObject({
      userId: "user-1",
      workspaceId: { in: ["ws-1", "ws-2"] },
      createdAt: { gte: weekStart, lte: weekEnd },
    });

    const ticketWhere = (db.ticket.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(ticketWhere).toMatchObject({
      assigneeId: "user-1",
      updatedAt: { gte: weekStart, lte: weekEnd },
      product: { workspaceId: { in: ["ws-1", "ws-2"] } },
    });

    const meetingWhere = (db.transcriptionSessionParticipant.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(meetingWhere).toMatchObject({
      userId: "user-1",
      workspaceId: { in: ["ws-1", "ws-2"] },
      transcriptionSession: { createdAt: { gte: weekStart, lte: weekEnd } },
    });
  });

  it("shapes the three sources and totals them", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      {
        action: "completed",
        entityType: "ticket",
        entityId: "t-cuid-123456",
        metadata: { title: "Ship the feed" },
        workspace: { name: "Syntrofi" },
      },
    ] as never);
    db.ticket.findMany.mockResolvedValue([
      { title: "Persist commits", status: "IN_PROGRESS", product: { workspace: { name: "Syntrofi" } } },
    ] as never);
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([
      { workspace: { name: "Syntrofi" }, transcriptionSession: { title: "Q3 planning", summary: "{...}" } },
    ] as never);

    const out = await gatherWeeklyWorkBundle(db, baseArgs);

    expect(out.events).toEqual([
      { action: "completed", entityType: "ticket", label: "Ship the feed", workspace: "Syntrofi" },
    ]);
    expect(out.tickets).toEqual([
      { title: "Persist commits", status: "IN_PROGRESS", workspace: "Syntrofi" },
    ]);
    expect(out.meetings).toEqual([
      { title: "Q3 planning", hasSummary: true, workspace: "Syntrofi" },
    ]);
    expect(out.totalSignals).toBe(3);
  });

  it("enriches event labels from metadata, falling back to a CUID slice", async () => {
    db.ticket.findMany.mockResolvedValue([] as never);
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([] as never);
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      // no title in metadata -> describeEntityRef falls back to entityId.slice(0,8)
      { action: "status_changed", entityType: "ticket", entityId: "cmqch782xxxx", metadata: {}, workspace: { name: "WS" } },
    ] as never);

    const out = await gatherWeeklyWorkBundle(db, baseArgs);
    expect(out.events[0]!.label).toBe("cmqch782");
  });

  it("marks a meeting without a summary as hasSummary=false and tolerates a null title", async () => {
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([
      { workspace: { name: "WS" }, transcriptionSession: { title: null, summary: null } },
    ] as never);

    const out = await gatherWeeklyWorkBundle(db, baseArgs);
    expect(out.meetings[0]).toEqual({ title: "", hasSummary: false, workspace: "WS" });
  });
});
