/**
 * The Delegated tab's aggregation (ADR-0067, Agent PRD D10): WHERE builders
 * shared by count and list, badge arithmetic that never counts live runs.
 * Mocked Prisma — no DB.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { buildActionAccessWhere } from "~/server/services/access";
import {
  TERMINAL_RUN_STATUSES,
  countDelegated,
  delegatedRunsWhere,
  liveDelegatedWhere,
  listDelegated,
  reviewDelegatedRun,
  reviewedDelegatedWhere,
  unreviewedDelegatedWhere,
  waitingDelegatedWhere,
} from "../delegated";

const USER = "u1";
const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

describe("delegated WHERE builders", () => {
  it("scopes to runs I requested or my own Assistant performed — on actions I can still read", () => {
    expect(delegatedRunsWhere(USER)).toEqual({
      AND: [
        { OR: [{ requestedById: USER }, { agent: { ownerId: USER } }] },
        { action: buildActionAccessWhere(USER) },
      ],
    });
  });

  it("the terminal set is derived: every status that is neither live nor waiting", () => {
    expect([...TERMINAL_RUN_STATUSES].sort()).toEqual(["CANCELLED", "FAILED", "SUCCEEDED", "TIMED_OUT"]);
  });

  it("live = the live set; waiting = WAITING_ON_OWNER; unreviewed = terminal and not reviewed", () => {
    expect(liveDelegatedWhere(USER)).toEqual({
      AND: [delegatedRunsWhere(USER), { status: { in: ["QUEUED", "RUNNING"] } }],
    });
    expect(waitingDelegatedWhere(USER)).toEqual({
      AND: [delegatedRunsWhere(USER), { status: "WAITING_ON_OWNER" }],
    });
    expect(unreviewedDelegatedWhere(USER)).toEqual({
      AND: [
        delegatedRunsWhere(USER),
        { status: { in: [...TERMINAL_RUN_STATUSES] } },
        { reviewedAt: null },
      ],
    });
  });
});

describe("countDelegated", () => {
  beforeEach(() => mockReset(db));

  it("attention = waiting + unreviewed, never live; reviewed is a real count", async () => {
    db.agentRun.count
      .mockResolvedValueOnce(3 as never) // live
      .mockResolvedValueOnce(1 as never) // waiting
      .mockResolvedValueOnce(2 as never) // unreviewed
      .mockResolvedValueOnce(25 as never); // reviewed this week
    const now = new Date("2026-10-10T12:00:00Z");
    expect(await countDelegated(db, USER, now)).toEqual({ live: 3, waiting: 1, unreviewed: 2, reviewed: 25, attention: 3 });
    expect(db.agentRun.count.mock.calls.map((c) => c[0]?.where)).toEqual([
      liveDelegatedWhere(USER),
      waitingDelegatedWhere(USER),
      unreviewedDelegatedWhere(USER),
      reviewedDelegatedWhere(USER, now),
    ]);
  });
});

describe("listDelegated", () => {
  beforeEach(() => mockReset(db));

  it("uses the same WHERE builders as the counts and shapes rows with owner/requester flags", async () => {
    db.agentRun.count.mockResolvedValue(0 as never);
    const row = {
      id: "run-1", status: "SUCCEEDED", executor: "MASTRA", createdAt: new Date(), startedAt: null, finishedAt: null,
      lastEventAt: null, toolCallCount: 2, summary: "Done.", readyToClose: true, reviewedAt: null, requestedById: USER,
      agent: { id: "agent-1", name: "Aria", ownerId: "owner-2", assistant: { emoji: "✨" } },
      action: { id: "a1", name: "Find a venue", status: "ACTIVE", workspace: null, project: { name: "Offsite", workspace: { slug: "acme", name: "Acme" } } },
    };
    db.agentRun.findMany.mockResolvedValue([] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([row] as never);

    const result = await listDelegated(db, USER, new Date("2026-10-10T12:00:00Z"));

    const wheres = db.agentRun.findMany.mock.calls.map((c) => c[0]?.where);
    expect(wheres[0]).toEqual(liveDelegatedWhere(USER));
    expect(wheres[1]).toEqual(waitingDelegatedWhere(USER));
    expect(wheres[2]).toEqual(unreviewedDelegatedWhere(USER));
    expect(result.unreviewed[0]).toMatchObject({
      id: "run-1",
      isOwner: false,
      isRequester: true,
      agent: { name: "Aria", emoji: "✨" },
      action: { name: "Find a venue", projectName: "Offsite", workspace: { slug: "acme", name: "Acme" } },
    });
  });
});

describe("reviewDelegatedRun", () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    mockReset(db);
    complete.mockClear();
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("stamps reviewedAt for a finished run the viewer may see, and completes the action only on markDone", async () => {
    db.agentRun.findFirst.mockResolvedValue({
      id: "run-1", status: "SUCCEEDED", reviewedAt: null, actionId: "a1", action: { kanbanStatus: "IN_PROGRESS", status: "ACTIVE" },
    } as never);

    const dismissed = await reviewDelegatedRun(db, { userId: USER, runId: "run-1", markDone: false, completeAction: complete });
    expect(dismissed).toEqual({ reviewed: true, markedDone: false });
    expect(complete).not.toHaveBeenCalled();
    expect(db.agentRun.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { AND: [{ id: "run-1" }, delegatedRunsWhere(USER)] },
    });
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "run-1", reviewedAt: null },
      data: { reviewedById: USER },
    });

    const done = await reviewDelegatedRun(db, { userId: USER, runId: "run-1", markDone: true, completeAction: complete });
    expect(done).toEqual({ reviewed: true, markedDone: true });
    expect(complete).toHaveBeenCalledWith("a1", "IN_PROGRESS");
  });

  it("does not re-complete an already completed action, but still clears the row", async () => {
    db.agentRun.findFirst.mockResolvedValue({
      id: "run-1", status: "SUCCEEDED", reviewedAt: null, actionId: "a1", action: { kanbanStatus: null, status: "COMPLETED" },
    } as never);
    const r = await reviewDelegatedRun(db, { userId: USER, runId: "run-1", markDone: true, completeAction: complete });
    expect(r).toEqual({ reviewed: true, markedDone: false });
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses a live or waiting run (not a result yet) and ignores a stranger's run", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER", reviewedAt: null, actionId: "a1", action: { kanbanStatus: null, status: "ACTIVE" } } as never);
    await expect(reviewDelegatedRun(db, { userId: USER, runId: "run-1", markDone: true, completeAction: complete })).rejects.toThrow("Run is not finished");

    db.agentRun.findFirst.mockResolvedValue(null as never);
    expect(await reviewDelegatedRun(db, { userId: "stranger", runId: "run-1", markDone: true, completeAction: complete })).toEqual({ reviewed: false, markedDone: false });
    expect(complete).not.toHaveBeenCalled();
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });
});
