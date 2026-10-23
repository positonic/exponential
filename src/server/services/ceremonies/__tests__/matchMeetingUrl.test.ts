import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const getProjectAccess = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/access", () => ({
  getProjectAccess,
  hasProjectAccess: (access: unknown) => access !== null,
}));

import { findCeremonyForMeetingUrl, pickMeetingUrlMatch } from "../matchMeetingUrl";

const at = new Date("2026-10-23T13:40:00.000Z");
const ROOM = "https://talk.syntro.fi/rooms/regulartouchpointja";

function ceremony(overrides: Record<string, unknown> = {}) {
  return {
    id: "cer-1",
    name: "Leadership Weekly",
    meetingUrl: "talk.syntro.fi/rooms/RegularTouchpointJa/",
    workspace: { id: "ws-1", name: "Syntrofi" },
    projects: [{ project: { id: "p-1", name: "Manage Syntrofi" } }],
    occurrences: [
      {
        id: "occ-1",
        scheduledStart: new Date("2026-10-23T13:30:00.000Z"),
        scheduledEnd: new Date("2026-10-23T14:30:00.000Z"),
      },
    ],
    ...overrides,
  };
}

describe("pickMeetingUrlMatch", () => {
  const occ = (id: string, iso: string) => ({ id, scheduledStart: new Date(iso) });

  it("picks the occurrence starting nearest the meeting across ceremonies", () => {
    const pick = pickMeetingUrlMatch(
      [
        { id: "a", occurrences: [occ("a1", "2026-10-23T12:30:00.000Z")] },
        { id: "b", occurrences: [occ("b1", "2026-10-23T13:30:00.000Z")] },
      ],
      at,
    );
    expect(pick).toEqual({ ceremonyId: "b", occurrenceId: "b1" });
  });

  it("falls back to the only ceremony when nothing is on", () => {
    expect(pickMeetingUrlMatch([{ id: "a", occurrences: [] }], at)).toEqual({ ceremonyId: "a", occurrenceId: null });
  });

  it("returns null when several ceremonies share the room and none is on", () => {
    expect(
      pickMeetingUrlMatch(
        [
          { id: "a", occurrences: [] },
          { id: "b", occurrences: [] },
        ],
        at,
      ),
    ).toBeNull();
    expect(pickMeetingUrlMatch([], at)).toBeNull();
  });
});

describe("findCeremonyForMeetingUrl", () => {
  beforeEach(() => {
    getProjectAccess.mockReset();
    getProjectAccess.mockResolvedValue({ role: "member" });
  });

  it("returns the workspace, ceremony, on occurrence and sole project for the room", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremony.findMany.mockResolvedValue([ceremony()] as never);

    const match = await findCeremonyForMeetingUrl(db, { userId: "u-1", url: ROOM, at });

    expect(match).toEqual({
      workspace: { id: "ws-1", name: "Syntrofi" },
      ceremony: { id: "cer-1", name: "Leadership Weekly" },
      project: { id: "p-1", name: "Manage Syntrofi" },
      occurrence: ceremony().occurrences[0],
    });
    const args = db.ceremony.findMany.mock.calls[0]![0]!;
    expect(args.where).toMatchObject({ isActive: true, meetingUrl: { not: null } });
    // Scoped to the caller's workspaces, and to the "on" window with 30 min slack.
    expect(args.where!.workspace).toEqual({
      OR: [{ members: { some: { userId: "u-1" } } }, { teams: { some: { members: { some: { userId: "u-1" } } } } }],
    });
    const occWhere = (args.select!.occurrences as { where: Record<string, unknown> }).where;
    expect(occWhere).toEqual({
      status: { not: "SKIPPED" },
      scheduledStart: { lte: new Date("2026-10-23T14:10:00.000Z") },
      scheduledEnd: { gte: new Date("2026-10-23T13:10:00.000Z") },
    });
    expect(getProjectAccess).toHaveBeenCalledWith(db, "u-1", "p-1");
  });

  it("ignores ceremonies whose link is a different room", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremony.findMany.mockResolvedValue([ceremony({ meetingUrl: "https://talk.syntro.fi/rooms/other" })] as never);
    expect(await findCeremonyForMeetingUrl(db, { userId: "u-1", url: ROOM, at })).toBeNull();
  });

  it("leaves the project out when the ceremony reviews several, or the caller cannot see it", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremony.findMany.mockResolvedValue([
      ceremony({ projects: [{ project: { id: "p-1", name: "A" } }, { project: { id: "p-2", name: "B" } }] }),
    ] as never);
    expect((await findCeremonyForMeetingUrl(db, { userId: "u-1", url: ROOM, at }))?.project).toBeNull();

    db.ceremony.findMany.mockResolvedValue([ceremony()] as never);
    getProjectAccess.mockResolvedValue(null);
    expect((await findCeremonyForMeetingUrl(db, { userId: "u-1", url: ROOM, at }))?.project).toBeNull();
  });

  it("narrows to one workspace when asked", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremony.findMany.mockResolvedValue([] as never);
    await findCeremonyForMeetingUrl(db, { userId: "u-1", url: ROOM, at, workspaceId: "ws-9" });
    expect(db.ceremony.findMany.mock.calls[0]![0]!.where).toMatchObject({ workspaceId: "ws-9" });
  });

  it("does not query for a value that is not a room link", async () => {
    const db = mockDeep<PrismaClient>();
    expect(await findCeremonyForMeetingUrl(db, { userId: "u-1", url: "https://talk.syntro.fi/", at })).toBeNull();
    expect(db.ceremony.findMany).not.toHaveBeenCalled();
  });
});
