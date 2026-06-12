/**
 * Unit tests for the `weeklyMeetingStats` aggregation service.
 *
 * Uses `mockDeep<PrismaClient>()` so tests run in milliseconds and can never
 * touch a real DB. Per CLAUDE.md "Test database safety", any test under
 * `src/server/services/` MUST stay mocked — `*.integration.test.ts` files are
 * reserved for tests that genuinely need real DB behaviour.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { weeklyMeetingStats } from "../weeklyMeetingStats";

interface MockSession {
  id: string;
  meetingDate: Date | null;
  createdAt: Date;
  durationSeconds: number | null;
  actions: Array<{ id: string }>;
  participants: Array<{
    id: string;
    email: string;
    name: string | null;
    userId: string | null;
    contactId: string | null;
    user: { name: string | null; image: string | null } | null;
    contact: { firstName: string | null; lastName: string | null } | null;
  }>;
}

function session(overrides: Partial<MockSession> & { id: string }): MockSession {
  return {
    meetingDate: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    durationSeconds: 0,
    actions: [],
    participants: [],
    ...overrides,
  };
}

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

// Anchor every test on Monday 2026-05-11 local midnight to make week math
// readable. (May 11, 2026 is a Monday.)
const WEEK_START = new Date(2026, 4, 11); // month 4 = May (0-indexed)

beforeEach(() => {
  mockReset(dbMock);
});

describe("weeklyMeetingStats — per-day counts", () => {
  it("returns 7 entries, including zero-meeting days", async () => {
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      session({ id: "m1", meetingDate: new Date(2026, 4, 11, 10) }),  // Mon
      session({ id: "m2", meetingDate: new Date(2026, 4, 11, 14) }),  // Mon
      session({ id: "m3", meetingDate: new Date(2026, 4, 13, 9) }),   // Wed
      // No meetings Tue, Thu, Fri, Sat, Sun
    ] as unknown as never);

    const result = await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    expect(result.perDayCounts).toHaveLength(7);
    expect(result.perDayCounts.map((p) => p.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(result.perDayCounts.map((p) => p.date)).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
    ]);
  });

  it("totalMeetings reflects the count returned by Prisma", async () => {
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      session({ id: "m1", meetingDate: new Date(2026, 4, 11, 10) }),
      session({ id: "m2", meetingDate: new Date(2026, 4, 12, 9) }),
    ] as unknown as never);

    const result = await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    expect(result.totalMeetings).toBe(2);
  });
});

describe("weeklyMeetingStats — week boundary uses passed anchor", () => {
  it("uses weekStart as the lower bound when filtering, not server UTC midnight", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    dbMock.transcriptionSession.findMany.mockImplementation(((args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return Promise.resolve([] as never);
    }) as never);

    await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });

    // Whatever the OR-shaped meetingDate filter, the lower bound must be the
    // local Monday 00:00 anchor the caller passed in, not UTC.
    const or = capturedWhere?.OR as Array<{ meetingDate?: { gte: Date; lt: Date } }>;
    const meetingDateFilter = or.find((c) => c.meetingDate)?.meetingDate;
    expect(meetingDateFilter?.gte.getTime()).toBe(WEEK_START.getTime());
    const expectedEnd = new Date(WEEK_START);
    expectedEnd.setDate(expectedEnd.getDate() + 7);
    expect(meetingDateFilter?.lt.getTime()).toBe(expectedEnd.getTime());
  });
});

describe("weeklyMeetingStats — totals", () => {
  it("treats null durationSeconds as zero in totalDurationMinutes", async () => {
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      session({ id: "m1", meetingDate: new Date(2026, 4, 11, 10), durationSeconds: 3600 }),
      session({ id: "m2", meetingDate: new Date(2026, 4, 12, 9), durationSeconds: null }),
      session({ id: "m3", meetingDate: new Date(2026, 4, 13, 8), durationSeconds: 1800 }),
    ] as unknown as never);

    const result = await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    // 60 + 0 + 30 = 90 minutes
    expect(result.totalDurationMinutes).toBe(90);
  });

  it("sums extracted actions across sessions (including zero)", async () => {
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      session({
        id: "m1",
        meetingDate: new Date(2026, 4, 11, 10),
        actions: [{ id: "a1" }, { id: "a2" }],
      }),
      session({ id: "m2", meetingDate: new Date(2026, 4, 12, 9), actions: [] }),
      session({
        id: "m3",
        meetingDate: new Date(2026, 4, 13, 8),
        actions: [{ id: "a3" }],
      }),
    ] as unknown as never);

    const result = await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    expect(result.totalActionsExtracted).toBe(3);
  });
});

describe("weeklyMeetingStats — top participants", () => {
  it("ranks by count descending and resolves ties alphabetically by displayName", async () => {
    const alice = {
      id: "p1",
      email: "alice@example.com",
      name: null,
      userId: "u-alice",
      contactId: null,
      user: { name: "Alice Anderson", image: null },
      contact: null,
    };
    const ben = {
      id: "p2",
      email: "ben@example.com",
      name: null,
      userId: "u-ben",
      contactId: null,
      user: { name: "Ben Bright", image: null },
      contact: null,
    };
    const carla = {
      id: "p3",
      email: "carla@example.com",
      name: null,
      userId: "u-carla",
      contactId: null,
      user: { name: "Carla Carter", image: null },
      contact: null,
    };

    dbMock.transcriptionSession.findMany.mockResolvedValue([
      // Alice: 3 meetings; Ben: 2; Carla: 2 — Ben should come before Carla.
      session({ id: "m1", meetingDate: new Date(2026, 4, 11, 10), participants: [alice, ben] }),
      session({ id: "m2", meetingDate: new Date(2026, 4, 12, 9), participants: [alice, carla] }),
      session({ id: "m3", meetingDate: new Date(2026, 4, 13, 8), participants: [alice, ben, carla] }),
    ] as unknown as never);

    const result = await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    expect(result.topParticipants.map((p) => ({ id: p.participantId, count: p.count }))).toEqual([
      { id: "u:u-alice", count: 3 },
      { id: "u:u-ben", count: 2 },
      { id: "u:u-carla", count: 2 },
    ]);
  });

  it("resolves displayName from linked User, CrmContact, then email fallback", async () => {
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      session({
        id: "m1",
        meetingDate: new Date(2026, 4, 11, 10),
        participants: [
          {
            id: "p1",
            email: "alice@example.com",
            name: null,
            userId: "u-alice",
            contactId: null,
            user: { name: "Alice Anderson", image: null },
            contact: null,
          },
          {
            id: "p2",
            email: "ben@example.com",
            name: null,
            userId: null,
            contactId: "c-ben",
            user: null,
            contact: { firstName: "Benjamin", lastName: "Bright" },
          },
          {
            id: "p3",
            email: "carla.dee@example.com",
            name: null,
            userId: null,
            contactId: null,
            user: null,
            contact: null,
          },
        ],
      }),
    ] as unknown as never);

    const result = await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    const byKey = Object.fromEntries(
      result.topParticipants.map((p) => [p.participantId, p.displayName]),
    );
    expect(byKey["u:u-alice"]).toBe("Alice Anderson");
    expect(byKey["c:c-ben"]).toBe("Benjamin Bright");
    expect(byKey["e:carla.dee@example.com"]).toBe("carla.dee");
  });
});

describe("weeklyMeetingStats — workspace scoping & archive exclusion", () => {
  it("passes archivedAt: null in the Prisma where clause", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    dbMock.transcriptionSession.findMany.mockImplementation(((args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return Promise.resolve([] as never);
    }) as never);

    await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    expect(capturedWhere?.archivedAt).toBeNull();
  });

  it("adds workspace scoping when workspaceId is provided", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    dbMock.transcriptionSession.findMany.mockImplementation(((args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return Promise.resolve([] as never);
    }) as never);

    await weeklyMeetingStats(dbMock, {
      userId: "u1",
      workspaceId: "ws-1",
      weekStart: WEEK_START,
    });
    // workspace scoping is added under AND with both direct workspaceId and
    // project.workspaceId matching.
    const and = capturedWhere?.AND as Array<{ OR?: Array<Record<string, unknown>> }>;
    expect(and).toBeDefined();
    const workspaceClause = and.find(
      (c) => c.OR?.some((o) => o.workspaceId === "ws-1"),
    );
    expect(workspaceClause?.OR).toContainEqual({ workspaceId: "ws-1" });
    expect(workspaceClause?.OR).toContainEqual({
      project: { workspaceId: "ws-1" },
    });
  });

  it("omits workspace scoping when workspaceId is not provided", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    dbMock.transcriptionSession.findMany.mockImplementation(((args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return Promise.resolve([] as never);
    }) as never);

    await weeklyMeetingStats(dbMock, {
      userId: "u1",
      weekStart: WEEK_START,
    });
    const and = capturedWhere?.AND as Array<Record<string, unknown>>;
    // Only the caller-access filter remains — no workspace scoping clause.
    expect(and).toHaveLength(1);
    expect(JSON.stringify(and)).not.toContain("ws-1");
  });
});

describe("weeklyMeetingStats — caller access control", () => {
  it("always ANDs the caller's transcription access filter into the query", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    dbMock.transcriptionSession.findMany.mockImplementation(((args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return Promise.resolve([] as never);
    }) as never);

    await weeklyMeetingStats(dbMock, {
      userId: "u1",
      workspaceId: "ws-1",
      weekStart: WEEK_START,
    });

    // Regression guard: stats must never aggregate Meetings the caller
    // couldn't open. The first AND clause is the centralized access filter —
    // it must mention the caller on the owner and participant paths.
    const and = capturedWhere?.AND as Array<{ OR?: Array<Record<string, unknown>> }>;
    const accessClause = and.find(
      (c) => c.OR?.some((o) => o.userId === "u1"),
    );
    expect(accessClause).toBeDefined();
    expect(accessClause?.OR).toContainEqual({
      participants: { some: { userId: "u1" } },
    });
  });
});
