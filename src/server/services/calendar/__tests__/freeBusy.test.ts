/**
 * Unit tests for the free/busy contract. The load-bearing assertions are the
 * privacy ones: the Prisma select must request ONLY the four busy fields (+
 * userId for grouping), and the returned blocks must not carry event details
 * even if the db hands extra columns back.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { listBusyBlocksByUser } from "../freeBusy";

const RANGE = {
  from: new Date("2026-08-17T00:00:00Z"),
  to: new Date("2026-08-24T00:00:00Z"),
};

describe("listBusyBlocksByUser", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
  });

  it("selects ONLY the free/busy fields — title/location/attendee columns are never requested", async () => {
    db.calendarEvent.findMany.mockResolvedValue([] as never);

    await listBusyBlocksByUser(db, ["user-a"], RANGE);

    const arg = db.calendarEvent.findMany.mock.calls[0]![0] as {
      select: Record<string, boolean>;
    };
    expect(arg.select).toEqual({
      userId: true,
      startsAt: true,
      endsAt: true,
      isAllDay: true,
      sourceType: true,
    });
  });

  it("strips any extra fields a sloppy caller-side row might carry", async () => {
    // Simulate a row that (wrongly) includes details — the mapped output
    // must still be details-free.
    db.calendarEvent.findMany.mockResolvedValue([
      {
        userId: "user-a",
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        isAllDay: false,
        sourceType: "microsoft",
        title: "SECRET board meeting",
        location: "SECRET room",
      },
    ] as never);

    const result = await listBusyBlocksByUser(db, ["user-a"], RANGE);
    const block = result.get("user-a")![0]!;

    expect(block).toEqual({
      startsAt: new Date("2026-08-18T09:00:00Z"),
      endsAt: new Date("2026-08-18T10:00:00Z"),
      isAllDay: false,
      sourceType: "microsoft",
    });
    expect(JSON.stringify(result.get("user-a"))).not.toMatch(/SECRET/);
  });

  it("groups blocks per user and includes empty entries for block-less users", async () => {
    db.calendarEvent.findMany.mockResolvedValue([
      {
        userId: "user-a",
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        isAllDay: false,
        sourceType: "ics",
      },
    ] as never);

    const result = await listBusyBlocksByUser(db, ["user-a", "user-b"], RANGE);

    expect(result.get("user-a")).toHaveLength(1);
    // Present-but-empty ≠ missing: "free all week" is an answer.
    expect(result.get("user-b")).toEqual([]);
  });

  it("scopes to the requested users and range, counting only enabled ICS feeds", async () => {
    db.calendarEvent.findMany.mockResolvedValue([] as never);

    await listBusyBlocksByUser(db, ["user-a", "user-b"], RANGE);

    const arg = db.calendarEvent.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({
      userId: { in: ["user-a", "user-b"] },
      startsAt: { lt: RANGE.to },
      endsAt: { gt: RANGE.from },
      OR: [{ sourceType: { not: "ics" } }, { calendarFeed: { isEnabled: true } }],
    });
  });

  it("returns empty map without querying when no users are requested", async () => {
    const result = await listBusyBlocksByUser(db, [], RANGE);

    expect(result.size).toBe(0);
    expect(db.calendarEvent.findMany).not.toHaveBeenCalled();
  });
});
