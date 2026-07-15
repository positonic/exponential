/**
 * Engine-seam tests for the Sync revert service (ADR-0042): deep-mocked
 * Prisma, module-mocked activity writer, assertions on external behavior —
 * which tickets get deleted, which the guardrail protects and why, what the
 * revert run manifest reports, what gets tombstoned, and what event fires.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { recordActivityMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn(),
}));

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: recordActivityMock,
}));

import {
  executeTicketSyncRevert,
  planTicketSyncRevert,
  REVERT_TOMBSTONE_KEY,
} from "../revert";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const CONFIG = {
  id: "cfg1",
  productId: "prod1",
  provider: "notion",
  product: { id: "prod1", workspaceId: "ws1" },
};

function pullRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "runA",
    direction: "pull",
    dryRun: false,
    revertedAt: null,
    items: [
      { externalId: "page-1", ticketId: "t1", title: "Clean one", action: "created" },
      { externalId: "page-2", ticketId: "t2", title: "Touched one", action: "created" },
      { externalId: "page-3", ticketId: "t3", title: "Adopted one", action: "adopted" },
      { externalId: "page-4", ticketId: "t4", title: "Updated one", action: "updated" },
    ],
    ...overrides,
  };
}

function cleanTicket(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    status: "BACKLOG",
    type: "FEATURE",
    priority: null,
    points: null,
    prUrl: null,
    branchName: null,
    assigneeId: null,
    featureId: null,
    epicId: null,
    scopeId: null,
    cycleId: null,
    _count: { comments: 0, actions: 0, depsOut: 0, depsIn: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  recordActivityMock.mockReset();
  recordActivityMock.mockResolvedValue(true);

  db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue(CONFIG as never);
  db.ticketSyncRun.findMany.mockResolvedValue([pullRun()] as never);
  db.ticket.findMany.mockResolvedValue([
    cleanTicket("t1", "Clean one"),
    cleanTicket("t2", "Touched one"),
  ] as never);
  db.ticketSync.findMany.mockResolvedValue([] as never);
  db.ticketSyncRun.create.mockResolvedValue({ id: "revert1" } as never);
  db.ticketSyncRun.update.mockResolvedValue({} as never);
  db.ticketSyncRun.updateMany.mockResolvedValue({ count: 1 } as never);
  db.ticket.deleteMany.mockResolvedValue({ count: 2 } as never);
  db.ticketSync.findUnique.mockResolvedValue({
    id: "link2",
    snapshot: { title: "Touched one", status: "BACKLOG" },
  } as never);
  db.ticketSync.update.mockResolvedValue({} as never);
  // Interactive transaction: run the callback against the same mock.
  db.$transaction.mockImplementation(
    (async (fn: (tx: unknown) => Promise<unknown>) => fn(db)) as never,
  );
});

describe("planTicketSyncRevert — eligibility", () => {
  it("rejects a run that was already reverted", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([
      pullRun({ revertedAt: new Date() }),
    ] as never);

    await expect(
      planTicketSyncRevert(db, { configId: "cfg1", runIds: ["runA"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects dry runs and non-pull directions", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([pullRun({ dryRun: true })] as never);
    await expect(
      planTicketSyncRevert(db, { configId: "cfg1", runIds: ["runA"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    db.ticketSyncRun.findMany.mockResolvedValue([
      pullRun({ direction: "revert" }),
    ] as never);
    await expect(
      planTicketSyncRevert(db, { configId: "cfg1", runIds: ["runA"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects runs that belong to another connection (scoped by configId)", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([] as never);

    await expect(
      planTicketSyncRevert(db, { configId: "cfg1", runIds: ["foreign-run"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.ticketSyncRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ configId: "cfg1" }),
      }),
    );
  });

  it("rejects runs with no created items (nothing to revert)", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([
      pullRun({
        items: [
          { externalId: "p", ticketId: "t3", title: "x", action: "adopted" },
        ],
      }),
    ] as never);

    await expect(
      planTicketSyncRevert(db, { configId: "cfg1", runIds: ["runA"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("plans only created items — adopted and updated are never candidates", async () => {
    const plan = await planTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
    });

    const planned = [...plan.deletable, ...plan.skipped, ...plan.missing].map(
      (e) => e.ticketId,
    );
    expect(planned).toEqual(expect.arrayContaining(["t1", "t2"]));
    expect(planned).not.toContain("t3");
    expect(planned).not.toContain("t4");
  });

  it("reports already-deleted tickets as missing", async () => {
    db.ticket.findMany.mockResolvedValue([cleanTicket("t1", "Clean one")] as never);

    const plan = await planTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
    });

    expect(plan.deletable.map((e) => e.ticketId)).toEqual(["t1"]);
    expect(plan.missing.map((e) => e.ticketId)).toEqual(["t2"]);
  });
});

describe("planTicketSyncRevert — local-work guardrail", () => {
  const signals: Array<[string, Record<string, unknown>, string]> = [
    ["comments", { _count: { comments: 2, actions: 0, depsOut: 0, depsIn: 0 } }, "has comments"],
    ["linked actions", { _count: { comments: 0, actions: 1, depsOut: 0, depsIn: 0 } }, "has linked actions"],
    ["dependencies", { _count: { comments: 0, actions: 0, depsOut: 1, depsIn: 0 } }, "has ticket dependencies"],
    ["PR url", { prUrl: "https://github.com/x/y/pull/1" }, "has a PR linked"],
    ["branch name", { branchName: "feat/x" }, "has a branch name"],
    ["assignee", { assigneeId: "user-9" }, "has an assignee"],
    ["feature link", { featureId: "feat-1" }, "linked to a feature"],
    ["epic link", { epicId: "epic-1" }, "linked to an epic"],
    ["scope link", { scopeId: "scope-1" }, "linked to a scope"],
    ["cycle link", { cycleId: "cycle-1" }, "linked to a cycle"],
  ];

  it.each(signals)("skips a ticket with %s", async (_label, overrides, reason) => {
    db.ticket.findMany.mockResolvedValue([
      cleanTicket("t1", "Clean one"),
      cleanTicket("t2", "Touched one", overrides),
    ] as never);

    const plan = await planTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
    });

    expect(plan.deletable.map((e) => e.ticketId)).toEqual(["t1"]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toMatchObject({ ticketId: "t2" });
    expect(plan.skipped[0]!.reasons).toContain(reason);
  });

  it("skips on synced-field drift vs the link snapshot", async () => {
    db.ticket.findMany.mockResolvedValue([
      cleanTicket("t2", "Renamed by a human", { status: "IN_PROGRESS" }),
    ] as never);
    db.ticketSync.findMany.mockResolvedValue([
      {
        ticketId: "t2",
        snapshot: {
          title: "Touched one",
          status: "BACKLOG",
          priority: null,
          type: "FEATURE",
          points: null,
        },
      },
    ] as never);
    db.ticketSyncRun.findMany.mockResolvedValue([
      pullRun({
        items: [
          { externalId: "page-2", ticketId: "t2", title: "Touched one", action: "created" },
        ],
      }),
    ] as never);

    const plan = await planTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
    });

    expect(plan.deletable).toHaveLength(0);
    expect(plan.skipped[0]!.reasons.join()).toContain("local edits since last sync");
    expect(plan.skipped[0]!.reasons.join()).toContain("title");
    expect(plan.skipped[0]!.reasons.join()).toContain("status");
  });

  it("does not treat an unchanged snapshot as drift", async () => {
    db.ticketSync.findMany.mockResolvedValue([
      {
        ticketId: "t1",
        snapshot: {
          title: "Clean one",
          status: "BACKLOG",
          priority: null,
          type: "FEATURE",
          points: null,
        },
      },
    ] as never);

    const plan = await planTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
    });

    expect(plan.deletable.map((e) => e.ticketId)).toContain("t1");
  });
});

describe("connection-wide revert — multiple runs in one selection", () => {
  const runB = pullRun({
    id: "runB",
    items: [
      { externalId: "page-9", ticketId: "t9", title: "From run B", action: "created" },
    ],
  });

  beforeEach(() => {
    db.ticketSyncRun.findMany.mockResolvedValue([pullRun(), runB] as never);
    db.ticket.findMany.mockResolvedValue([
      cleanTicket("t1", "Clean one"),
      cleanTicket("t2", "Touched one"),
      cleanTicket("t9", "From run B"),
    ] as never);
    db.ticketSyncRun.updateMany.mockResolvedValue({ count: 2 } as never);
  });

  it("aggregates created items across all selected runs into one plan", async () => {
    const plan = await planTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA", "runB"],
    });

    expect(plan.deletable.map((e) => e.ticketId).sort()).toEqual(["t1", "t2", "t9"]);
  });

  it("stamps every selected run against the one revert run", async () => {
    await executeTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA", "runB"],
      triggeredById: "user-7",
    });

    expect(db.ticketSyncRun.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["runA", "runB"] }, configId: "cfg1", revertedAt: null },
      data: expect.objectContaining({ revertedByRunId: "revert1" }),
    });
    expect(db.ticket.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2", "t9"] } },
    });
  });
});

describe("executeTicketSyncRevert", () => {
  it("hard-deletes exactly the deletable tickets", async () => {
    await executeTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
      triggeredById: "user-7",
    });

    expect(db.ticket.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
    });
  });

  it("stamps the reverted runs with a null-guard in the same transaction", async () => {
    await executeTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
      triggeredById: "user-7",
    });

    expect(db.ticketSyncRun.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["runA"] }, configId: "cfg1", revertedAt: null },
      data: expect.objectContaining({
        revertedAt: expect.any(Date),
        revertedByRunId: "revert1",
      }),
    });
  });

  it("rejects when a run was reverted concurrently (stamp count mismatch) and marks the revert run errored", async () => {
    db.ticketSyncRun.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      executeTicketSyncRevert(db, { configId: "cfg1", runIds: ["runA"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(db.ticket.deleteMany).not.toHaveBeenCalled();
    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "revert1" },
        data: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("tombstones skipped survivors' links with the revert sentinel, preserving the snapshot", async () => {
    db.ticket.findMany.mockResolvedValue([
      cleanTicket("t1", "Clean one"),
      cleanTicket("t2", "Touched one", { assigneeId: "user-9" }),
    ] as never);

    await executeTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
      triggeredById: "user-7",
    });

    expect(db.ticketSync.update).toHaveBeenCalledWith({
      where: { id: "link2" },
      data: {
        tombstonedAt: expect.any(Date),
        snapshot: {
          title: "Touched one",
          status: "BACKLOG",
          [REVERT_TOMBSTONE_KEY]: true,
        },
      },
    });
    // Only the survivor is deleted from the deletable set.
    expect(db.ticket.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1"] } },
    });
  });

  it("writes the revert as its own run with per-item outcomes", async () => {
    db.ticket.findMany.mockResolvedValue([
      cleanTicket("t1", "Clean one"),
      cleanTicket("t2", "Touched one", { assigneeId: "user-9" }),
    ] as never);

    const result = await executeTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
      triggeredById: "user-7",
    });

    expect(db.ticketSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        configId: "cfg1",
        direction: "revert",
        trigger: "manual",
        triggeredById: "user-7",
      }),
    });
    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "revert1" },
        data: expect.objectContaining({
          status: "success",
          skipped: 1,
          items: expect.arrayContaining([
            expect.objectContaining({ ticketId: "t1", action: "deleted" }),
            expect.objectContaining({
              ticketId: "t2",
              action: "skipped",
              reason: expect.stringContaining("assignee"),
            }),
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({ revertRunId: "revert1", deleted: 1, skipped: 1 });
  });

  it("posts exactly one reverted activity event with counts in metadata", async () => {
    await executeTicketSyncRevert(db, {
      configId: "cfg1",
      runIds: ["runA"],
      triggeredById: "user-7",
    });

    expect(recordActivityMock).toHaveBeenCalledTimes(1);
    expect(recordActivityMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspaceId: "ws1",
        userId: "user-7",
        entityType: "ticket_sync_run",
        entityId: "revert1",
        action: "reverted",
        metadata: expect.objectContaining({ deleted: 2, skipped: 0 }),
      }),
    );
  });
});
