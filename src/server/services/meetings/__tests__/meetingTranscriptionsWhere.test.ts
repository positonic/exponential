/**
 * Unit tests for `buildMeetingTranscriptionsWhere` — the scope behind
 * `mastra.getMeetingTranscriptions` (zoe's get-meeting-transcriptions tool).
 *
 * Regression: zoe answered "what meetings did I have yesterday?" with "none"
 * while the Daily summary listed two recordings. Both were Granola imports owned
 * by the agent user (the human only a Participant), and imported the day after
 * the meeting — so an owner-only filter on `createdAt` found neither.
 */

import { describe, it, expect } from "vitest";
import { buildTranscriptionAccessWhere } from "~/server/services/access";
import {
  buildMeetingTranscriptionsWhere,
  meetingRangeEnd,
  meetingRangeStart,
} from "../meetingTranscriptionsWhere";

const USER = "user-1";

describe("buildMeetingTranscriptionsWhere", () => {
  it("scopes by the shared Meeting access rule, not ownership alone", () => {
    const where = buildMeetingTranscriptionsWhere(USER, {});
    expect(where).toEqual({ AND: [buildTranscriptionAccessWhere(USER)] });
    // Participants (e.g. of an agent-imported Meeting) are included.
    expect(JSON.stringify(where)).toContain('"participants"');
  });

  it("adds workspace and project filters when given", () => {
    const where = buildMeetingTranscriptionsWhere(USER, { workspaceId: "ws-1", projectId: "p-1" });
    expect(where.AND).toEqual([
      buildTranscriptionAccessWhere(USER),
      { workspaceId: "ws-1" },
      { projectId: "p-1" },
    ]);
  });

  it("filters the date range on meetingDate, falling back to createdAt when it is missing", () => {
    const where = buildMeetingTranscriptionsWhere(USER, {
      startDate: "2026-09-15T00:00:00.000Z",
      endDate: "2026-09-15T23:59:59.999Z",
    });
    const range = {
      gte: new Date("2026-09-15T00:00:00.000Z"),
      lte: new Date("2026-09-15T23:59:59.999Z"),
    };
    expect((where.AND as unknown[])[1]).toEqual({
      OR: [{ meetingDate: range }, { meetingDate: null, createdAt: range }],
    });
  });

  it("leaves the date out entirely when no range is given", () => {
    expect(JSON.stringify(buildMeetingTranscriptionsWhere(USER, {}))).not.toContain("meetingDate");
  });
});

describe("meetingRangeEnd", () => {
  it("treats a date-only end as the end of that day, so a one-day range is not empty", () => {
    expect(meetingRangeEnd("2026-09-15").toISOString()).toBe("2026-09-15T23:59:59.999Z");
  });

  it("reads an unpadded date-only end the same way, in UTC", () => {
    expect(meetingRangeEnd("2026-9-5").toISOString()).toBe("2026-09-05T23:59:59.999Z");
    expect(meetingRangeStart("2026-9-5").toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });

  it("covers the whole day when start and end name the same date", () => {
    const where = buildMeetingTranscriptionsWhere(USER, { startDate: "2026-09-15", endDate: "2026-09-15" });
    const range = { gte: new Date("2026-09-15T00:00:00.000Z"), lte: new Date("2026-09-15T23:59:59.999Z") };
    expect((where.AND as unknown[])[1]).toEqual({
      OR: [{ meetingDate: range }, { meetingDate: null, createdAt: range }],
    });
  });

  it("keeps an explicit timestamp as given", () => {
    expect(meetingRangeEnd("2026-09-15T10:00:00Z").toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });
});
