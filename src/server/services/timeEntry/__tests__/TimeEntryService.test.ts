/**
 * TimeEntryService unit tests — mocked Prisma via vitest-mock-extended.
 *
 * Covers start (incl. auto-stop branch), stop, getActive, ownership rejection,
 * `endedAt > startedAt` validation, and `Action.timeSpentMins` resync arithmetic.
 *
 * Per CLAUDE.md "Test database safety", services tests stay mocked.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import {
  TimeEntryService,
  durationMinutes,
  safeEndedAt,
} from "../TimeEntryService";
import { recordActivity } from "~/server/services/activity/recordActivity";

// The service emits a `time_entry` activity event after each completed
// recording. Mock it so the unit tests can assert the payload without a DB.
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
}));

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(dbMock);
  vi.mocked(recordActivity).mockClear();
  // Default: $transaction immediately invokes the callback with the same mock,
  // so per-method mocks set on dbMock are visible inside the transaction body.
  // (Casting is necessary because $transaction is overloaded.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dbMock.$transaction as any).mockImplementation(async (fn: any) => fn(dbMock));
});

function buildEntry(overrides: Partial<{
  id: string;
  userId: string;
  actionId: string;
  workspaceId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  source: string;
}> = {}) {
  const startedAt = overrides.startedAt ?? new Date("2026-01-01T10:00:00Z");
  return {
    id: overrides.id ?? "entry-1",
    userId: overrides.userId ?? "user-1",
    actionId: overrides.actionId ?? "action-1",
    workspaceId: overrides.workspaceId ?? null,
    startedAt,
    endedAt: overrides.endedAt ?? null,
    source: overrides.source ?? "plugin",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

describe("TimeEntryService.start", () => {
  it("creates an Action with the typed title and a running TimeEntry", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null);
    dbMock.action.create.mockResolvedValueOnce({
      id: "action-new",
      workspaceId: "ws-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    dbMock.timeEntry.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-new", actionId: "action-new", workspaceId: "ws-1" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    const result = await svc.start({
      userId: "user-1",
      typedTitle: "  Review PR  ",
      workspaceId: "ws-1",
    });

    expect(result.id).toBe("entry-new");
    expect(dbMock.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Review PR",
          createdById: "user-1",
          workspaceId: "ws-1",
          status: "ACTIVE",
          source: "plugin",
        }),
      }),
    );
    expect(dbMock.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          actionId: "action-new",
          workspaceId: "ws-1",
          source: "plugin",
        }),
      }),
    );
  });

  it("falls back to 'Untitled' when typedTitle is empty/blank", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null);
    dbMock.action.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "action-x", workspaceId: null } as any,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.create.mockResolvedValueOnce(buildEntry() as any);

    const svc = new TimeEntryService(dbMock);
    await svc.start({ userId: "user-1", typedTitle: "   " });

    expect(dbMock.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Untitled" }),
      }),
    );
  });

  it("attaches to an existing action when actionId is provided (no new Action created)", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null); // nothing running
    dbMock.action.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "action-existing", workspaceId: "ws-99" } as any,
    );
    dbMock.timeEntry.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-attached", actionId: "action-existing", workspaceId: "ws-99" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.start({ userId: "user-1", actionId: "action-existing" });

    expect(dbMock.action.create).not.toHaveBeenCalled();
    expect(dbMock.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionId: "action-existing",
          workspaceId: "ws-99",
        }),
      }),
    );
  });

  it("throws NOT_FOUND when actionId does not resolve", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null);
    dbMock.action.findUnique.mockResolvedValueOnce(null);

    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.start({ userId: "user-1", actionId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("passes projectId through to the new Action when creating from typedTitle", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null);
    dbMock.action.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "action-new", workspaceId: "ws-1" } as any,
    );
    dbMock.timeEntry.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-new" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.start({
      userId: "user-1",
      typedTitle: "Inbox sweep",
      projectId: "proj-7",
      workspaceId: "ws-1",
    });

    expect(dbMock.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Inbox sweep",
          projectId: "proj-7",
          workspaceId: "ws-1",
        }),
      }),
    );
  });

  it("auto-stops a previously running entry and increments its action's timeSpentMins", async () => {
    const startedAt = new Date(Date.now() - 5 * 60_000); // 5 min ago
    const running = {
      ...buildEntry({
        id: "entry-running",
        actionId: "action-old",
        startedAt,
      }),
      action: { name: "old task" },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(running as any);
    dbMock.action.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "action-new", workspaceId: null } as any,
    );
    dbMock.timeEntry.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-new", actionId: "action-new" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.start({ userId: "user-1", typedTitle: "next thing" });

    // The old entry was stamped endedAt
    expect(dbMock.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-running" },
        data: expect.objectContaining({ endedAt: expect.any(Date) }),
      }),
    );
    // Its action's timeSpentMins was incremented (≈5 min)
    expect(dbMock.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-old" },
        data: { timeSpentMins: { increment: expect.any(Number) } },
      }),
    );
    const incCall = dbMock.action.update.mock.calls[0]![0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inc = (incCall.data as any).timeSpentMins.increment as number;
    expect(inc).toBeGreaterThanOrEqual(4);
    expect(inc).toBeLessThanOrEqual(6);
    // No workspace on the auto-stopped entry → no activity event (a workspace
    // feed can't show a no-workspace recording).
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("emits a time_entry activity event for the auto-stopped entry when it has a workspace", async () => {
    const startedAt = new Date(Date.now() - 5 * 60_000); // 5 min ago
    const running = {
      ...buildEntry({
        id: "entry-running",
        actionId: "action-old",
        workspaceId: "ws-7",
        startedAt,
      }),
      action: { name: "old task" },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(running as any);
    dbMock.action.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "action-new", workspaceId: "ws-7" } as any,
    );
    dbMock.timeEntry.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-new", actionId: "action-new", workspaceId: "ws-7" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.start({ userId: "user-1", typedTitle: "next thing", workspaceId: "ws-7" });

    expect(recordActivity).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        workspaceId: "ws-7",
        userId: "user-1",
        entityType: "time_entry",
        entityId: "action-old",
        action: "created",
        metadata: expect.objectContaining({
          title: "old task",
          durationMins: expect.any(Number),
        }),
      }),
    );
  });
});

describe("TimeEntryService.stop", () => {
  it("stamps endedAt on the running entry and increments timeSpentMins", async () => {
    const startedAt = new Date(Date.now() - 10 * 60_000); // 10 min ago
    const running = buildEntry({ startedAt, actionId: "action-x" });
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(running);
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ...running, endedAt: new Date(), action: { id: "action-x", name: "x", projectId: null, workspaceId: null } } as any,
    );

    const svc = new TimeEntryService(dbMock);
    const stopped = await svc.stop({ userId: "user-1" });

    expect(stopped.endedAt).not.toBeNull();
    expect(dbMock.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-x" },
        data: { timeSpentMins: { increment: expect.any(Number) } },
      }),
    );
  });

  it("emits a time_entry activity event after stopping a workspace-scoped timer", async () => {
    const startedAt = new Date(Date.now() - 10 * 60_000); // 10 min ago
    const running = buildEntry({
      startedAt,
      actionId: "action-x",
      workspaceId: "ws-3",
    });
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(running);
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        ...running,
        endedAt: new Date(),
        action: { id: "action-x", name: "Deep work", projectId: null, workspaceId: "ws-3" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.stop({ userId: "user-1" });

    expect(recordActivity).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        workspaceId: "ws-3",
        userId: "user-1",
        entityType: "time_entry",
        entityId: "action-x",
        action: "created",
        metadata: expect.objectContaining({
          title: "Deep work",
          durationMins: expect.any(Number),
        }),
      }),
    );
  });

  it("does not emit an activity event when the stopped timer has no workspace", async () => {
    const startedAt = new Date(Date.now() - 10 * 60_000);
    const running = buildEntry({ startedAt, actionId: "action-x" });
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(running);
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ...running, endedAt: new Date(), action: { id: "action-x", name: "x", projectId: null, workspaceId: null } } as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.stop({ userId: "user-1" });

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when nothing is running", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null);

    const svc = new TimeEntryService(dbMock);
    await expect(svc.stop({ userId: "user-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws FORBIDDEN when entryId belongs to another user", async () => {
    const someone = buildEntry({ id: "entry-7", userId: "user-other" });
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(someone);

    const svc = new TimeEntryService(dbMock);
    const err = await svc
      .stop({ userId: "user-1", entryId: "entry-7" })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });

  it("throws BAD_REQUEST when the entry is already stopped", async () => {
    const stopped = buildEntry({ endedAt: new Date() });
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(stopped);

    const svc = new TimeEntryService(dbMock);
    await expect(svc.stop({ userId: "user-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("TimeEntryService.getActive", () => {
  it("returns the running entry for the user", async () => {
    const running = buildEntry();
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ...running, action: { id: "action-1", name: "x", projectId: null, workspaceId: null } } as any,
    );

    const svc = new TimeEntryService(dbMock);
    const active = await svc.getActive({ userId: "user-1" });
    expect(active?.id).toBe("entry-1");
    expect(dbMock.timeEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", endedAt: null },
      }),
    );
  });

  it("returns null when no timer is running", async () => {
    dbMock.timeEntry.findFirst.mockResolvedValueOnce(null);
    const svc = new TimeEntryService(dbMock);
    expect(await svc.getActive({ userId: "user-1" })).toBeNull();
  });
});

describe("TimeEntryService.update", () => {
  it("range-edits a completed entry on the same action, applying signed timeSpentMins delta", async () => {
    const oldStarted = new Date("2026-01-01T10:00:00Z");
    const oldEnded = new Date("2026-01-01T10:30:00Z"); // 30 min old
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({ startedAt: oldStarted, endedAt: oldEnded, actionId: "action-1" }),
    );
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-1", actionId: "action-1" }) as any,
    );

    const newEnded = new Date("2026-01-01T10:45:00Z"); // 45 min new (delta +15)
    const svc = new TimeEntryService(dbMock);
    await svc.update({
      userId: "user-1",
      entryId: "entry-1",
      endedAt: newEnded,
    });

    expect(dbMock.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-1" },
        data: { timeSpentMins: { increment: 15 } },
      }),
    );
  });

  it("reassigns a completed entry: decrement old action, increment new action", async () => {
    const started = new Date("2026-01-01T10:00:00Z");
    const ended = new Date("2026-01-01T10:25:00Z"); // 25 min
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({
        startedAt: started,
        endedAt: ended,
        actionId: "action-old",
      }),
    );
    dbMock.action.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "action-new", workspaceId: "ws-x" } as any,
    );
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-1", actionId: "action-new" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.update({
      userId: "user-1",
      entryId: "entry-1",
      actionId: "action-new",
    });

    const calls = dbMock.action.update.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { id: "action-old" },
          data: { timeSpentMins: { decrement: 25 } },
        }),
        expect.objectContaining({
          where: { id: "action-new" },
          data: { timeSpentMins: { increment: 25 } },
        }),
      ]),
    );
  });

  it("rejects endedAt <= startedAt", async () => {
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({
        startedAt: new Date("2026-01-01T10:00:00Z"),
        endedAt: new Date("2026-01-01T10:30:00Z"),
      }),
    );
    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.update({
        userId: "user-1",
        entryId: "entry-1",
        endedAt: new Date("2026-01-01T09:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("FORBIDDEN when entry belongs to another user", async () => {
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({ userId: "someone-else" }),
    );
    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.update({
        userId: "user-1",
        entryId: "entry-1",
        endedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("running → ended transitions increment the action by the new duration", async () => {
    const started = new Date(Date.now() - 10 * 60_000);
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({ startedAt: started, endedAt: null, actionId: "action-1" }),
    );
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "entry-1", actionId: "action-1" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.update({
      userId: "user-1",
      entryId: "entry-1",
      endedAt: new Date(started.getTime() + 10 * 60_000),
    });

    expect(dbMock.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-1" },
        data: { timeSpentMins: { increment: 10 } },
      }),
    );
  });
});

describe("TimeEntryService.delete", () => {
  it("deletes a completed entry and decrements timeSpentMins", async () => {
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({
        startedAt: new Date("2026-01-01T10:00:00Z"),
        endedAt: new Date("2026-01-01T10:20:00Z"),
        actionId: "action-1",
      }),
    );
    const svc = new TimeEntryService(dbMock);
    const out = await svc.delete({ userId: "user-1", entryId: "entry-1" });

    expect(out).toEqual({ id: "entry-1" });
    expect(dbMock.timeEntry.delete).toHaveBeenCalledWith({
      where: { id: "entry-1" },
    });
    expect(dbMock.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-1" },
        data: { timeSpentMins: { decrement: 20 } },
      }),
    );
  });

  it("running entries have no decrement (they never contributed)", async () => {
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({ endedAt: null, actionId: "action-1" }),
    );
    const svc = new TimeEntryService(dbMock);
    await svc.delete({ userId: "user-1", entryId: "entry-1" });
    expect(dbMock.timeEntry.delete).toHaveBeenCalled();
    expect(dbMock.action.update).not.toHaveBeenCalled();
  });

  it("FORBIDDEN when the entry belongs to another user", async () => {
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      buildEntry({ userId: "someone-else" }),
    );
    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.delete({ userId: "user-1", entryId: "entry-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("TimeEntryService.listByDateRange", () => {
  it("builds an overlap-style where with userId, start<end, ended>start OR null", async () => {
    dbMock.timeEntry.findMany.mockResolvedValueOnce([]);
    const svc = new TimeEntryService(dbMock);
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-02T00:00:00Z");
    await svc.listByDateRange({ userId: "u-1", startDate: start, endDate: end });

    expect(dbMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u-1",
          startedAt: { lt: end },
          OR: [{ endedAt: null }, { endedAt: { gt: start } }],
        }),
        orderBy: { startedAt: "asc" },
      }),
    );
  });

  it("adds workspaceId filter when provided", async () => {
    dbMock.timeEntry.findMany.mockResolvedValueOnce([]);
    const svc = new TimeEntryService(dbMock);
    await svc.listByDateRange({
      userId: "u-1",
      startDate: new Date(),
      endDate: new Date(),
      workspaceId: "ws-42",
    });
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws-42" }),
      }),
    );
  });
});

describe("TimeEntryService.listRecent", () => {
  it("queries completed entries newest-first with default limit", async () => {
    dbMock.timeEntry.findMany.mockResolvedValueOnce([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "e1", endedAt: new Date() }) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildEntry({ id: "e2", endedAt: new Date() }) as any,
    ]);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.listRecent({ userId: "user-1" });

    expect(result.map((r) => r.id)).toEqual(["e1", "e2"]);
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", endedAt: { not: null } },
        orderBy: { endedAt: "desc" },
        take: 20,
      }),
    );
  });

  it("clamps limit to [1, 100]", async () => {
    dbMock.timeEntry.findMany.mockResolvedValueOnce([]);
    const svc = new TimeEntryService(dbMock);
    await svc.listRecent({ userId: "user-1", limit: 500 });
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

describe("durationMinutes", () => {
  it("rounds to the nearest minute", () => {
    const s = new Date("2026-01-01T10:00:00Z");
    expect(durationMinutes(s, new Date(s.getTime() + 30_000))).toBe(1);
    expect(durationMinutes(s, new Date(s.getTime() + 29_000))).toBe(0);
    expect(durationMinutes(s, new Date(s.getTime() + 90_000))).toBe(2);
    expect(durationMinutes(s, new Date(s.getTime() + 7 * 60_000 + 14_000))).toBe(7);
  });

  it("returns 0 for negative / zero durations (clamps invalid input)", () => {
    const s = new Date("2026-01-01T10:00:00Z");
    expect(durationMinutes(s, s)).toBe(0);
    expect(durationMinutes(s, new Date(s.getTime() - 1000))).toBe(0);
  });
});

describe("safeEndedAt", () => {
  it("returns now when now is after startedAt", () => {
    const startedAt = new Date(Date.now() - 60_000);
    const result = safeEndedAt(startedAt);
    expect(result.getTime()).toBeGreaterThan(startedAt.getTime());
  });

  it("clamps to startedAt + 1ms when startedAt is in the future (clock skew)", () => {
    // A startedAt ahead of the app clock simulates DB-vs-app skew. The result
    // must still be strictly after startedAt to satisfy the DB CHECK constraint.
    const startedAt = new Date(Date.now() + 60_000);
    const result = safeEndedAt(startedAt);
    expect(result.getTime()).toBe(startedAt.getTime() + 1);
    expect(result.getTime()).toBeGreaterThan(startedAt.getTime());
  });
});
