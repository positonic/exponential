/**
 * Unit tests for the Meeting → calendar-surface read path: attendee scoping,
 * confirmed-only, and the provider-payload shape the merge points expect.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { listMeetingCalendarEvents } from "../meetingEventRead";

const RANGE = [new Date("2026-08-17T00:00:00Z"), new Date("2026-08-24T00:00:00Z")] as const;

describe("listMeetingCalendarEvents", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
  });

  it("scopes to meetings the user attends, confirmed only, in range", async () => {
    db.meeting.findMany.mockResolvedValue([] as never);

    await listMeetingCalendarEvents(db, "user-a", RANGE[0], RANGE[1]);

    const arg = db.meeting.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({
      status: "confirmed",
      startsAt: { lt: RANGE[1] },
      endsAt: { gt: RANGE[0] },
      attendees: { some: { userId: "user-a" } },
    });
  });

  it("maps meetings into the multi-calendar payload shape", async () => {
    db.meeting.findMany.mockResolvedValue([
      {
        id: "meeting-1",
        workspaceId: "ws-1",
        title: "Design sync",
        location: "Room 1",
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        workspace: { name: "Syntrofi" },
      },
    ] as never);

    const events = await listMeetingCalendarEvents(db, "user-a", RANGE[0], RANGE[1]);

    expect(events).toEqual([
      {
        accountId: "meetings-ws-1",
        accountEmail: null,
        calendarId: "meetings-ws-1",
        calendarName: "Syntrofi meetings",
        provider: "meeting",
        id: "meeting-1",
        summary: "Design sync",
        start: { dateTime: "2026-08-18T09:00:00.000Z" },
        end: { dateTime: "2026-08-18T10:00:00.000Z" },
        location: "Room 1",
        htmlLink: "",
        status: "confirmed",
      },
    ]);
  });
});
