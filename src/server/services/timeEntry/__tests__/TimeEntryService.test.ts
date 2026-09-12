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

// ── Daily worklog (ADR-0061) ─────────────────────────────────────────

const WL_START = new Date("2026-09-11T09:22:00Z");
const WL_END = new Date("2026-09-11T10:30:00Z"); // 68 minutes

function buildProposed(overrides: Record<string, unknown> = {}) {
  return {
    ...buildEntry({ startedAt: WL_START, endedAt: WL_END, source: "claude-desktop", workspaceId: "ws-1" }),
    status: "PROPOSED",
    sourceRef: "claude-session:s1#0",
    note: null,
    createdByAgentId: "agent-1",
    action: { id: "action-1", name: "Review PR", projectId: null, workspaceId: "ws-1" },
    ...overrides,
  };
}

describe("TimeEntryService.create", () => {
  beforeEach(() => {
    dbMock.timeEntry.findFirst.mockResolvedValue(null); // no sourceRef holder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.action.findUnique.mockResolvedValue({ id: "action-1", workspaceId: "ws-1" } as any);
  });

  it("never touches the running Timer and never increments for a PROPOSED entry", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.create.mockResolvedValueOnce(buildProposed() as any);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.create({
      userId: "user-1",
      actionId: "action-1",
      startedAt: WL_START,
      endedAt: WL_END,
      source: "claude-desktop",
      status: "PROPOSED",
      sourceRef: "claude-session:s1#0",
      createdByAgentId: "agent-1",
    });

    expect(result.status).toBe("PROPOSED");
    // autoStopRunning would look for `endedAt: null` and update it — neither happens.
    expect(dbMock.timeEntry.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ endedAt: null }) }),
    );
    expect(dbMock.timeEntry.update).not.toHaveBeenCalled();
    expect(dbMock.action.update).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
    expect(dbMock.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          workspaceId: "ws-1", // inherited from the Action
          status: "PROPOSED",
          createdByAgentId: "agent-1",
          sourceRef: "claude-session:s1#0",
        }),
      }),
    );
  });

  it("increments timeSpentMins and emits the activity event only when CONFIRMED", async () => {
    dbMock.timeEntry.create.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildProposed({ status: "CONFIRMED", createdByAgentId: null, source: "manual", sourceRef: null }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.create({
      userId: "user-1",
      actionId: "action-1",
      startedAt: WL_START,
      endedAt: WL_END,
      source: "manual",
      status: "CONFIRMED",
    });

    expect(dbMock.action.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { timeSpentMins: { increment: 68 } },
    });
    expect(recordActivity).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: "user-1",
        entityType: "time_entry",
        entityId: "action-1",
        metadata: expect.objectContaining({ durationMins: 68 }),
      }),
    );
  });

  it("rejects endedAt <= startedAt with BAD_REQUEST before any write", async () => {
    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.create({
        userId: "user-1",
        actionId: "action-1",
        startedAt: WL_END,
        endedAt: WL_START,
        source: "manual",
        status: "CONFIRMED",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMock.timeEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a sourceRef another user holds with CONFLICT", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findFirst.mockResolvedValue({ userId: "user-2" } as any);
    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.create({
        userId: "user-1",
        actionId: "action-1",
        startedAt: WL_START,
        endedAt: WL_END,
        source: "claude-desktop",
        status: "PROPOSED",
        sourceRef: "claude-session:theirs#0",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(dbMock.timeEntry.create).not.toHaveBeenCalled();
  });

  it("NOT_FOUND for a missing Action", async () => {
    dbMock.action.findUnique.mockResolvedValue(null);
    const svc = new TimeEntryService(dbMock);
    await expect(
      svc.create({
        userId: "user-1",
        actionId: "nope",
        startedAt: WL_START,
        endedAt: WL_END,
        source: "manual",
        status: "CONFIRMED",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("TimeEntryService.upsertBySourceRef", () => {
  const input = {
    userId: "user-1",
    actionId: "action-1",
    startedAt: WL_START,
    endedAt: WL_END,
    source: "claude-desktop",
    status: "PROPOSED" as const,
    sourceRef: "claude-session:s1#0",
    createdByAgentId: "agent-1",
  };

  /** Mock order: foreign-ref check, then the ref family, then manual time. */
  function arrange(family: unknown[], manual: unknown[]) {
    dbMock.timeEntry.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findMany.mockResolvedValueOnce(family as any).mockResolvedValueOnce(manual as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.action.findUnique.mockResolvedValue({ id: "action-1", workspaceId: "ws-1" } as any);
  }

  it("creates when no row holds (userId, sourceRef) and no manual time overlaps", async () => {
    arrange([], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.create.mockResolvedValueOnce(buildProposed() as any);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.upsertBySourceRef(input);

    expect(result.outcome).toBe("created");
    expect(result.pieces).toHaveLength(1);
    expect(dbMock.timeEntry.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          userId: "user-1",
          OR: [{ sourceRef: "claude-session:s1#0" }, { sourceRef: { startsWith: "claude-session:s1#0#" } }],
        },
      }),
    );
    expect(dbMock.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceRef: "claude-session:s1#0", status: "PROPOSED" }),
      }),
    );
    expect(dbMock.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("updates a PROPOSED match in place (bounds, action, note) with no spent-time arithmetic", async () => {
    arrange([buildProposed()], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.action.findUnique.mockResolvedValue({ id: "action-2", workspaceId: "ws-2" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.update.mockResolvedValueOnce(buildProposed({ actionId: "action-2", note: "run 2" }) as any);

    const svc = new TimeEntryService(dbMock);
    const later = new Date("2026-09-11T10:45:00Z");
    const result = await svc.upsertBySourceRef({ ...input, actionId: "action-2", endedAt: later, note: "run 2" });

    expect(result.outcome).toBe("updated");
    expect(dbMock.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-1" },
        data: expect.objectContaining({
          actionId: "action-2",
          workspaceId: "ws-2",
          startedAt: WL_START,
          endedAt: later,
          note: "run 2",
        }),
      }),
    );
    expect(dbMock.timeEntry.create).not.toHaveBeenCalled();
    expect(dbMock.action.update).not.toHaveBeenCalled();
  });

  it("leaves a CONFIRMED match untouched (confirmed entries are never re-touched)", async () => {
    arrange([buildProposed({ status: "CONFIRMED" })], []);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.upsertBySourceRef({ ...input, note: "run 3" });

    expect(result.outcome).toBe("left");
    expect(result.entry?.status).toBe("CONFIRMED");
    expect(dbMock.timeEntry.update).not.toHaveBeenCalled();
    expect(dbMock.timeEntry.create).not.toHaveBeenCalled();
    // The manual-time query never runs for a left row.
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it("manual time on the same Action wins: nothing written, the manual note gains the ref, stale proposed rows go", async () => {
    const manual = {
      id: "manual-1",
      actionId: "action-1",
      startedAt: new Date("2026-09-11T09:00:00Z"),
      endedAt: new Date("2026-09-11T10:00:00Z"),
      note: "by hand",
    };
    arrange([buildProposed()], [manual]);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.upsertBySourceRef(input);

    expect(result).toEqual({ entry: null, outcome: "merged", pieces: [], mergedInto: ["manual-1"] });
    expect(dbMock.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "manual-1" },
      data: { note: "by hand · claude-session:s1#0" },
    });
    expect(dbMock.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["entry-1"] } } });
    expect(dbMock.timeEntry.create).not.toHaveBeenCalled();
    expect(dbMock.action.update).not.toHaveBeenCalled();
  });

  it("manual time on another Action splits the proposal into #a/#b pieces and retires the stale whole", async () => {
    const manualOther = {
      id: "manual-2",
      actionId: "action-9",
      startedAt: new Date("2026-09-11T09:40:00Z"),
      endedAt: new Date("2026-09-11T10:00:00Z"),
      note: null,
    };
    // An earlier run wrote the whole segment; now manual time carves a hole.
    arrange([buildProposed()], [manualOther]);
    dbMock.timeEntry.create
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(buildProposed({ id: "piece-a", sourceRef: "claude-session:s1#0#a" }) as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(buildProposed({ id: "piece-b", sourceRef: "claude-session:s1#0#b" }) as any);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.upsertBySourceRef(input);

    expect(result.outcome).toBe("created");
    expect(result.pieces.map((p) => p.id)).toEqual(["piece-a", "piece-b"]);
    expect(dbMock.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["entry-1"] } } });
    expect(dbMock.timeEntry.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          sourceRef: "claude-session:s1#0#a",
          startedAt: WL_START,
          endedAt: new Date("2026-09-11T09:40:00Z"),
        }),
      }),
    );
    expect(dbMock.timeEntry.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          sourceRef: "claude-session:s1#0#b",
          startedAt: new Date("2026-09-11T10:00:00Z"),
          endedAt: WL_END,
        }),
      }),
    );
    expect(dbMock.action.update).not.toHaveBeenCalled();
  });

  it("manual time on another Action covering everything → dropped, nothing written", async () => {
    const manualOther = {
      id: "manual-2",
      actionId: "action-9",
      startedAt: new Date("2026-09-11T09:00:00Z"),
      endedAt: new Date("2026-09-11T11:00:00Z"),
      note: null,
    };
    arrange([], [manualOther]);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.upsertBySourceRef(input);

    expect(result).toEqual({ entry: null, outcome: "dropped", pieces: [], mergedInto: [] });
    expect(dbMock.timeEntry.create).not.toHaveBeenCalled();
    expect(dbMock.timeEntry.update).not.toHaveBeenCalled();
  });

  it("does not reconcile a CONFIRMED (human) write: manual time is not queried", async () => {
    arrange([], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.create.mockResolvedValueOnce(buildProposed({ status: "CONFIRMED", source: "manual" }) as any);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.upsertBySourceRef({ ...input, status: "CONFIRMED", source: "manual", createdByAgentId: null });

    expect(result.outcome).toBe("created");
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it("a sourceRef another user holds is CONFLICT", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findFirst.mockResolvedValue({ id: "theirs" } as any);
    const svc = new TimeEntryService(dbMock);
    await expect(svc.upsertBySourceRef(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(dbMock.timeEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("TimeEntryService.confirmDay", () => {
  const dayStart = new Date("2026-09-11T00:00:00Z");
  const dayEnd = new Date("2026-09-12T00:00:00Z");

  it("confirms every proposed entry in the window and increments each Action once", async () => {
    const rows = [
      buildProposed({ id: "p1", actionId: "action-1", startedAt: new Date("2026-09-11T09:00:00Z"), endedAt: new Date("2026-09-11T09:30:00Z") }),
      buildProposed({ id: "p2", actionId: "action-1", startedAt: new Date("2026-09-11T10:00:00Z"), endedAt: new Date("2026-09-11T10:22:00Z") }),
      buildProposed({ id: "p3", actionId: "action-2", startedAt: new Date("2026-09-11T13:38:00Z"), endedAt: new Date("2026-09-11T14:30:00Z") }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findMany.mockResolvedValueOnce(rows as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.updateMany.mockResolvedValueOnce({ count: 3 } as any);

    const svc = new TimeEntryService(dbMock);
    const result = await svc.confirmDay({ userId: "user-1", dayStart, dayEnd });

    expect(result).toEqual({ confirmed: 3 });
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          status: "PROPOSED",
          startedAt: { gte: dayStart, lt: dayEnd },
        }),
      }),
    );
    expect(dbMock.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1", "p2", "p3"] } },
      data: { status: "CONFIRMED" },
    });
    // One increment per Action: 30 + 22 on action-1, 52 on action-2.
    expect(dbMock.action.update).toHaveBeenCalledTimes(2);
    expect(dbMock.action.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { timeSpentMins: { increment: 52 } },
    });
    expect(dbMock.action.update).toHaveBeenCalledWith({
      where: { id: "action-2" },
      data: { timeSpentMins: { increment: 52 } },
    });
    // One activity event per entry, after commit.
    expect(recordActivity).toHaveBeenCalledTimes(3);
  });

  it("a day with nothing proposed confirms 0 and writes nothing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findMany.mockResolvedValueOnce([] as any);
    const svc = new TimeEntryService(dbMock);
    expect(await svc.confirmDay({ userId: "user-1", dayStart, dayEnd })).toEqual({ confirmed: 0 });
    expect(dbMock.timeEntry.updateMany).not.toHaveBeenCalled();
    expect(dbMock.action.update).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("scopes to a workspace when asked", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findMany.mockResolvedValueOnce([] as any);
    const svc = new TimeEntryService(dbMock);
    await svc.confirmDay({ userId: "user-1", dayStart, dayEnd, workspaceId: "ws-1" });
    expect(dbMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws-1" }) }),
    );
  });
});

describe("edit is confirmation (ADR-0061)", () => {
  it("update on a PROPOSED entry confirms it and increments by the full new duration", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(buildProposed() as any); // 68 min proposed
    const newEnd = new Date("2026-09-11T10:45:00Z"); // 83 min
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildProposed({ status: "CONFIRMED", endedAt: newEnd }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    const result = await svc.update({ userId: "user-1", entryId: "entry-1", endedAt: newEnd });

    expect(result.status).toBe("CONFIRMED");
    expect(dbMock.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CONFIRMED", endedAt: newEnd }),
      }),
    );
    // Old contribution was zero (proposed), so the whole 83 minutes land.
    expect(dbMock.action.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { timeSpentMins: { increment: 83 } },
    });
  });

  it("reassigning a PROPOSED entry increments only the new Action", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(buildProposed() as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.action.findUnique.mockResolvedValueOnce({ id: "action-2", workspaceId: "ws-2" } as any);
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildProposed({ status: "CONFIRMED", actionId: "action-2" }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.update({ userId: "user-1", entryId: "entry-1", actionId: "action-2" });

    expect(dbMock.action.update).toHaveBeenCalledTimes(1);
    expect(dbMock.action.update).toHaveBeenCalledWith({
      where: { id: "action-2" },
      data: { timeSpentMins: { increment: 68 } },
    });
  });

  it("a CONFIRMED entry keeps the signed-delta arithmetic and no status write", async () => {
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildProposed({ status: "CONFIRMED", source: "manual" }) as any,
    );
    const newEnd = new Date("2026-09-11T10:45:00Z");
    dbMock.timeEntry.update.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildProposed({ status: "CONFIRMED", endedAt: newEnd }) as any,
    );

    const svc = new TimeEntryService(dbMock);
    await svc.update({ userId: "user-1", entryId: "entry-1", endedAt: newEnd });

    const data = (dbMock.timeEntry.update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("status");
    expect(dbMock.action.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { timeSpentMins: { increment: 15 } },
    });
  });

  it("deleting a PROPOSED entry decrements nothing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.findUnique.mockResolvedValueOnce(buildProposed() as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.timeEntry.delete.mockResolvedValueOnce(buildProposed() as any);

    const svc = new TimeEntryService(dbMock);
    await svc.delete({ userId: "user-1", entryId: "entry-1" });

    expect(dbMock.timeEntry.delete).toHaveBeenCalledWith({ where: { id: "entry-1" } });
    expect(dbMock.action.update).not.toHaveBeenCalled();
  });
});
