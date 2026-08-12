/**
 * The primary suite for this feature: everything that decides whether a summary reaches
 * a room goes through `postMeetingSummaryToMatrix`.
 *
 * Assertions are about external behaviour — which room got the payload, what the caller
 * is told, whether a log row exists — not about how the destination was queried. Mocked
 * Prisma and an injected client; no DB, no network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  buildTransactionId,
  postMeetingSummaryToMatrix,
} from "~/server/services/matrix/postMeetingSummary";
import {
  MatrixApiError,
  MatrixEncryptedRoomError,
} from "~/server/services/matrix/MatrixClient";

const ACTOR = "user-1";
const MEETING_ID = "meeting-1";
const ROOM = "!eng:example.org";
const SERVER = "int-server-1";

type SendArgs = { html: string; text: string; txnId: string };

/** A stand-in for MatrixClient with only the surface the seam uses. */
function stubClient(
  behaviour: { send?: (roomId: string, args: SendArgs) => Promise<{ eventId: string }> } = {},
) {
  const send = vi.fn(
    behaviour.send ??
      ((_roomId: string, _args: SendArgs) => Promise.resolve({ eventId: "$evt:example.org" })),
  );
  return { send } as unknown as Parameters<typeof postMeetingSummaryToMatrix>[1]["client"] & {
    send: typeof send;
  };
}

function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEETING_ID,
    title: "Weekly sync",
    summary: JSON.stringify({ overview: "We agreed to ship on Friday." }),
    meetingDate: new Date("2026-08-10T10:00:00Z"),
    createdAt: new Date("2026-08-10T10:00:00Z"),
    userId: ACTOR,
    projectId: "proj-1",
    workspaceId: "ws-1",
    project: { id: "proj-1", name: "Apollo" },
    actions: [{ id: "a1" }, { id: "a2" }],
    ...overrides,
  };
}

function outboundLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    provider: "matrix",
    externalId: ROOM,
    displayName: "Engineering",
    workspaceId: "ws-1",
    projectId: "proj-1",
    isActive: true,
    direction: "outbound",
    serverIntegrationId: SERVER,
    createdById: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let db: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
  db.transcriptionSession.findUnique.mockResolvedValue(meetingRow() as never);
  // Owner of the meeting → edit access, without needing project/workspace lookups.
  db.transcriptionSessionParticipant.findFirst.mockResolvedValue(null as never);
  db.channelLink.findFirst.mockResolvedValue(outboundLink() as never);
  db.matrixPostLog.findFirst.mockResolvedValue(null as never);
  db.matrixPostLog.create.mockResolvedValue({ id: "log-1" } as never);
});

describe("postMeetingSummaryToMatrix", () => {
  it("posts to the project's bound room and records the post", async () => {
    const client = stubClient();

    const result = await postMeetingSummaryToMatrix(db, {
      meetingId: MEETING_ID,
      actorUserId: ACTOR,
      client,
    });

    expect(result).toMatchObject({ kind: "posted", roomId: ROOM });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0]![0]).toBe(ROOM);

    const logged = db.matrixPostLog.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(logged.data).toMatchObject({
      transcriptionSessionId: MEETING_ID,
      roomId: ROOM,
      serverIntegrationId: SERVER,
      eventId: "$evt:example.org",
      postedById: ACTOR,
      channelLinkId: "link-1",
    });
  });

  it("sends the title, date, summary, action count and an absolute link", async () => {
    const client = stubClient();

    await postMeetingSummaryToMatrix(db, {
      meetingId: MEETING_ID,
      actorUserId: ACTOR,
      client,
    });

    const [, payload] = client.send.mock.calls[0]! as [string, SendArgs];
    expect(payload.text).toContain("Weekly sync");
    expect(payload.text).toContain("2026-08-10");
    expect(payload.text).toContain("We agreed to ship on Friday.");
    expect(payload.text).toContain("2 action items");
    // Absolute, because most readers are in a Matrix client, not in the app.
    expect(payload.text).toMatch(/https?:\/\/[^\s]+\/recording\/meeting-1/);
    expect(payload.html).toContain("<a href=");
  });

  it("blocks and says so when the project's binding is Off", async () => {
    db.channelLink.findFirst.mockResolvedValue(
      outboundLink({ isActive: false }) as never,
    );
    const client = stubClient();

    const result = await postMeetingSummaryToMatrix(db, {
      meetingId: MEETING_ID,
      actorUserId: ACTOR,
      client,
    });

    expect(result).toEqual({ kind: "blocked-off" });
    expect(client.send).not.toHaveBeenCalled();
    expect(db.matrixPostLog.create).not.toHaveBeenCalled();
  });

  it("reports no destination rather than failing, so the caller can offer a picker", async () => {
    db.channelLink.findFirst.mockResolvedValue(null as never);
    const client = stubClient();

    const result = await postMeetingSummaryToMatrix(db, {
      meetingId: MEETING_ID,
      actorUserId: ACTOR,
      client,
    });

    expect(result).toEqual({ kind: "no-destination" });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("refuses to post a meeting that has no summary", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue(
      meetingRow({ summary: null }) as never,
    );
    const client = stubClient();

    const result = await postMeetingSummaryToMatrix(db, {
      meetingId: MEETING_ID,
      actorUserId: ACTOR,
      client,
    });

    expect(result).toEqual({ kind: "no-summary" });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("refuses a user without edit access to the meeting", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue(
      meetingRow({ userId: "someone-else", projectId: null, workspaceId: null }) as never,
    );
    const client = stubClient();

    const result = await postMeetingSummaryToMatrix(db, {
      meetingId: MEETING_ID,
      actorUserId: ACTOR,
      client,
    });

    expect(result).toEqual({ kind: "no-access" });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("reports a missing meeting", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue(null as never);

    await expect(
      postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        client: stubClient(),
      }),
    ).resolves.toEqual({ kind: "not-found" });
  });

  describe("repost guard", () => {
    it("refuses a second post to the same room without confirmation", async () => {
      const lastPostedAt = new Date("2026-08-11T09:00:00Z");
      db.matrixPostLog.findFirst.mockResolvedValue({
        id: "log-old",
        postedAt: lastPostedAt,
      } as never);
      const client = stubClient();

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        client,
      });

      expect(result).toEqual({ kind: "needs-confirm", roomId: ROOM, lastPostedAt });
      expect(client.send).not.toHaveBeenCalled();
    });

    it("posts once confirmed", async () => {
      db.matrixPostLog.findFirst.mockResolvedValue({
        id: "log-old",
        postedAt: new Date("2026-08-11T09:00:00Z"),
      } as never);
      const client = stubClient();

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        confirmRepost: true,
        client,
      });

      expect(result).toMatchObject({ kind: "posted" });
      expect(client.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("failures", () => {
    it("writes no log row when the send fails", async () => {
      const client = stubClient({
        send: () => Promise.reject(new MatrixApiError("nope", 403, "M_FORBIDDEN")),
      });

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        client,
      });

      expect(result).toMatchObject({ kind: "failed" });
      expect((result as { reason: string }).reason).toMatch(/not in that room/i);
      // The log is the record of what actually reached a room. A phantom row here
      // would make the repost guard refuse a post that never happened.
      expect(db.matrixPostLog.create).not.toHaveBeenCalled();
    });

    it("explains an encrypted room specifically", async () => {
      const client = stubClient({
        send: () => Promise.reject(new MatrixEncryptedRoomError(ROOM)),
      });

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        client,
      });

      expect((result as { reason: string }).reason).toMatch(/encrypted/i);
      expect(db.matrixPostLog.create).not.toHaveBeenCalled();
    });

    it("distinguishes an unreachable homeserver from a permission problem", async () => {
      const client = stubClient({
        send: () => Promise.reject(new MatrixApiError("down", 0)),
      });

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        client,
      });

      expect((result as { reason: string }).reason).toMatch(/could not reach/i);
    });
  });

  describe("explicit room override", () => {
    it("posts to the picked room and persists no binding", async () => {
      const client = stubClient();

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        roomId: "!picked:example.org",
        serverId: SERVER,
        client,
      });

      expect(result).toMatchObject({ kind: "posted", roomId: "!picked:example.org" });
      expect(client.send.mock.calls[0]![0]).toBe("!picked:example.org");
      // A one-off post is not a configuration change.
      expect(db.channelLink.create).not.toHaveBeenCalled();
      expect(db.channelLink.upsert).not.toHaveBeenCalled();

      const logged = db.matrixPostLog.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(logged.data.channelLinkId).toBeNull();
    });

    it("cannot route around Off by picking a room in the picker", async () => {
      // Off is the confidential-project escape hatch; a picked room must not defeat it.
      db.channelLink.findFirst.mockResolvedValue(
        outboundLink({ isActive: false }) as never,
      );
      const client = stubClient();

      const result = await postMeetingSummaryToMatrix(db, {
        meetingId: MEETING_ID,
        actorUserId: ACTOR,
        roomId: "!picked:example.org",
        serverId: SERVER,
        client,
      });

      expect(result).toEqual({ kind: "blocked-off" });
      expect(client.send).not.toHaveBeenCalled();
    });
  });
});

describe("buildTransactionId", () => {
  it("is stable across retries of the same post, so Matrix deduplicates them", () => {
    const first = buildTransactionId(MEETING_ID, ROOM, 0);
    const second = buildTransactionId(MEETING_ID, ROOM, 0);
    expect(first).toBe(second);
  });

  it("differs per room and per attempt", () => {
    expect(buildTransactionId(MEETING_ID, ROOM, 0)).not.toBe(
      buildTransactionId(MEETING_ID, "!other:example.org", 0),
    );
    expect(buildTransactionId(MEETING_ID, ROOM, 0)).not.toBe(
      buildTransactionId(MEETING_ID, ROOM, 1),
    );
  });

  it("contains no characters that need escaping in a URL path segment", () => {
    expect(buildTransactionId(MEETING_ID, ROOM, 0)).toMatch(/^[A-Za-z0-9-]+$/);
  });
});
