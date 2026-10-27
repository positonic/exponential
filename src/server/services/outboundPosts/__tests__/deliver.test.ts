/**
 * The primary suite for the outbound-post primitive (ADR-0075): a pending row reaches
 * the right room once, a stale one is cancelled, a failing one is retried under the cap,
 * and nothing here ever throws into the caller.
 *
 * A stub `RoomPoster` is injected through `deps.posters`, so no provider is contacted.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  buildOutboundTxnId,
  deliverOutboundPost,
  deliverPendingOutboundPosts,
  kickOutboundPosts,
  MAX_OUTBOUND_ATTEMPTS,
  OUTBOUND_LEASE_MS,
} from "~/server/services/outboundPosts/deliver";
import {
  registerProducer,
  resetProducersForTests,
} from "~/server/services/outboundPosts/producers";
import type { Producer, OutboundSubject, RoomPoster } from "~/server/services/outboundPosts/types";
import { MatrixEncryptedRoomError } from "~/server/services/matrix/MatrixClient";

const reportHandledError = vi.hoisted(() => vi.fn());
vi.mock("~/lib/reportHandledError", () => ({ reportHandledError }));

const WORKSPACE = "ws-1";
const PROJECT = "proj-1";
const NOW = new Date("2026-10-27T12:00:00Z");

const DECISIONS_ROOM = {
  id: "link-dec",
  provider: "matrix",
  externalId: "!leadership:example.org",
  displayName: "leadership",
  workspaceId: WORKSPACE,
  projectId: null,
  isActive: true,
  direction: "outbound",
  kind: "decision",
  serverIntegrationId: "int-1",
  createdById: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const MEETINGS_ROOM = { ...DECISIONS_ROOM, id: "link-meet", kind: "meeting_summary", externalId: "!meetings:example.org" };

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    kind: "decision",
    subjectId: "dec-1",
    event: "published",
    channelLinkId: DECISIONS_ROOM.id,
    channelLink: DECISIONS_ROOM,
    provider: "matrix",
    externalId: DECISIONS_ROOM.externalId,
    serverIntegrationId: "int-1",
    status: "pending",
    attempts: 1, // after the claim
    attemptAt: NOW,
    lastError: null,
    providerEventId: null,
    sentAt: null,
    requestedById: "user-1",
    createdAt: NOW,
    ...overrides,
  };
}

let db: DeepMockProxy<PrismaClient>;
let poster: RoomPoster & { send: ReturnType<typeof vi.fn> };
let producer: Producer<OutboundSubject & { title: string }>;

function subject(overrides: Partial<OutboundSubject> = {}) {
  return { workspaceId: WORKSPACE, projectId: PROJECT, title: "Bid on the tender?", ...overrides };
}

/** Answer findFirst from a small table on the scalar keys of the where clause. */
function tableOf(rows: Record<string, unknown>[]) {
  return (args?: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    const match = rows.find((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    );
    return Promise.resolve(match ?? null);
  };
}

function deps(extra: Partial<Parameters<typeof deliverOutboundPost>[2]> = {}) {
  return { posters: new Map([["matrix", poster]]), baseUrl: "https://app.test", now: () => NOW, ...extra };
}

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
  reportHandledError.mockReset();
  resetProducersForTests();

  poster = {
    provider: "matrix",
    send: vi.fn().mockResolvedValue({ eventId: "$evt1" }),
    lookupMentions: vi.fn().mockResolvedValue(new Map([["user-1", "@james:example.org"]])),
  };
  producer = {
    kind: "decision",
    load: vi.fn().mockResolvedValue(subject({ mentionUserIds: ["user-1", "user-2"] })),
    render: vi.fn((s, event, ctx) => ({
      html: `<b>${event}</b> ${s.title}`,
      text: `${event} ${s.title}`,
      markdown: `**${event}** ${s.title}`,
      mentions: [...ctx.mentions.values()],
    })),
  };
  registerProducer(producer);

  // Default happy path: claim succeeds, the row is for the workspace decisions room,
  // the project has no own row so resolution falls back to it.
  db.outboundPost.updateMany.mockResolvedValue({ count: 1 });
  db.outboundPost.findUnique.mockResolvedValue(post() as never);
  db.outboundPost.update.mockResolvedValue(post() as never);
  db.project.findUnique.mockResolvedValue({ isRestricted: false } as never);
  db.channelLink.findFirst.mockImplementation(tableOf([DECISIONS_ROOM, MEETINGS_ROOM]) as never);
});

describe("deliverOutboundPost", () => {
  it("sends a published post to the workspace decisions room, never the meeting-summary room", async () => {
    const result = await deliverOutboundPost(db, "post-1", deps());

    expect(result).toEqual({ kind: "sent", eventId: "$evt1" });
    expect(poster.send).toHaveBeenCalledTimes(1);
    const [destination, message, opts] = poster.send.mock.calls[0]!;
    expect(destination.link.externalId).toBe("!leadership:example.org");
    expect(message.text).toBe("published Bid on the tender?");
    expect(message.html).toContain("Bid on the tender?");
    expect(opts.txnId).toBe(buildOutboundTxnId("post-1"));
    expect(db.outboundPost.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "sent", providerEventId: "$evt1", sentAt: NOW }),
      }),
    );
  });

  it("claims with a lease and the attempt cap before touching anything", async () => {
    await deliverOutboundPost(db, "post-1", deps());

    expect(db.outboundPost.updateMany).toHaveBeenCalledWith({
      where: {
        id: "post-1",
        status: { in: ["pending", "failed"] },
        attempts: { lt: MAX_OUTBOUND_ATTEMPTS },
        OR: [{ attemptAt: null }, { attemptAt: { lt: new Date(NOW.getTime() - OUTBOUND_LEASE_MS) } }],
      },
      data: { attemptAt: NOW, attempts: { increment: 1 } },
    });
  });

  it("hands mentions from the poster's identity lookup to the renderer", async () => {
    await deliverOutboundPost(db, "post-1", deps());

    expect(poster.lookupMentions).toHaveBeenCalledWith(db, ["user-1", "user-2"]);
    const ctx = (producer.render as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(ctx.mentions.get("user-1")).toBe("@james:example.org");
    expect(ctx.baseUrl).toBe("https://app.test");
    expect(poster.send.mock.calls[0]![1].mentions).toEqual(["@james:example.org"]);
  });

  it("is a no-op while another attempt holds the lease", async () => {
    db.outboundPost.updateMany.mockResolvedValue({ count: 0 });
    db.outboundPost.findUnique.mockResolvedValue({ status: "pending", attempts: 1, attemptAt: NOW } as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toEqual({ kind: "busy" });
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("never redelivers a sent row", async () => {
    db.outboundPost.updateMany.mockResolvedValue({ count: 0 });
    db.outboundPost.findUnique.mockResolvedValue({ status: "sent", attempts: 1, attemptAt: NOW } as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toEqual({ kind: "done" });
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("refuses a sixth attempt", async () => {
    db.outboundPost.updateMany.mockResolvedValue({ count: 0 });
    db.outboundPost.findUnique.mockResolvedValue({ status: "failed", attempts: 5, attemptAt: null } as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toEqual({ kind: "done" });
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("cancels when the project went Off since enqueue", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([{ ...DECISIONS_ROOM, id: "link-off", projectId: PROJECT, isActive: false }, DECISIONS_ROOM]) as never,
    );

    const result = await deliverOutboundPost(db, "post-1", deps());

    expect(result).toMatchObject({ kind: "cancelled" });
    expect(poster.send).not.toHaveBeenCalled();
    expect(db.outboundPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "cancelled" }) }),
    );
  });

  it("cancels a restricted project's post that would only have inherited the workspace room", async () => {
    db.project.findUnique.mockResolvedValue({ isRestricted: true } as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toMatchObject({ kind: "cancelled" });
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("sends for a restricted project through its own explicit binding", async () => {
    const own = { ...DECISIONS_ROOM, id: "link-own", projectId: PROJECT, externalId: "!private:example.org" };
    db.project.findUnique.mockResolvedValue({ isRestricted: true } as never);
    db.outboundPost.findUnique.mockResolvedValue(post({ channelLinkId: own.id, channelLink: own }) as never);
    db.channelLink.findFirst.mockImplementation(tableOf([own, DECISIONS_ROOM]) as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toEqual({ kind: "sent", eventId: "$evt1" });
    expect(poster.send.mock.calls[0]![0].link.externalId).toBe("!private:example.org");
  });

  it("cancels when the binding moved to a different room since enqueue", async () => {
    const moved = { ...DECISIONS_ROOM, id: "link-new", externalId: "!elsewhere:example.org" };
    db.channelLink.findFirst.mockImplementation(tableOf([moved]) as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toMatchObject({ kind: "cancelled" });
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("cancels when the binding was removed (link nulled) or the subject is gone", async () => {
    db.outboundPost.findUnique.mockResolvedValue(post({ channelLinkId: null, channelLink: null }) as never);
    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toMatchObject({ kind: "cancelled" });

    db.outboundPost.findUnique.mockResolvedValue(post() as never);
    (producer.load as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toMatchObject({ kind: "cancelled" });
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("records a provider failure as failed, reports it, and does not throw", async () => {
    poster.send.mockRejectedValue(new Error("homeserver unreachable"));

    const result = await deliverOutboundPost(db, "post-1", deps());

    expect(result).toEqual({ kind: "failed", reason: "homeserver unreachable", terminal: false });
    expect(db.outboundPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "failed", lastError: "homeserver unreachable" },
      }),
    );
    expect(reportHandledError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: "outbound-post", context: expect.objectContaining({ postId: "post-1" }) }),
    );
  });

  it("treats an encrypted room as terminal: no retries will help", async () => {
    poster.send.mockRejectedValue(new MatrixEncryptedRoomError("!leadership:example.org"));

    const result = await deliverOutboundPost(db, "post-1", deps());

    expect(result).toMatchObject({ kind: "failed", terminal: true });
    expect(db.outboundPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", attempts: MAX_OUTBOUND_ATTEMPTS }),
      }),
    );
  });

  it("sends every attempt with the same transaction id, so a retry is the same Matrix event", async () => {
    // A send that reached the homeserver but was never recorded must not become a
    // second message on the next claim: the id is the post, not the attempt.
    await deliverOutboundPost(db, "post-1", deps());
    db.outboundPost.findUnique.mockResolvedValue(post({ attempts: 2, status: "failed" }) as never);
    await deliverOutboundPost(db, "post-1", deps());
    db.outboundPost.findUnique.mockResolvedValue(post({ attempts: 3, status: "failed" }) as never);
    await deliverOutboundPost(db, "post-1", deps());

    const ids = poster.send.mock.calls.map((c) => c[2].txnId);
    expect(ids).toEqual(["expo-post-post-1", "expo-post-post-1", "expo-post-post-1"]);
  });

  it("turns an unexpected throw into a retryable failure on the row instead of escaping", async () => {
    (producer.render as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("renderer choked");
    });

    const result = await deliverOutboundPost(db, "post-1", deps());

    expect(result).toEqual({ kind: "failed", reason: "renderer choked", terminal: false });
    expect(db.outboundPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "failed", lastError: "renderer choked" } }),
    );
    expect(poster.send).not.toHaveBeenCalled();
  });

  it("fails terminally when no poster exists for the provider", async () => {
    db.outboundPost.findUnique.mockResolvedValue(post({ provider: "slack" }) as never);

    await expect(deliverOutboundPost(db, "post-1", deps())).resolves.toMatchObject({ kind: "failed", terminal: true });
  });
});

describe("deliverPendingOutboundPosts", () => {
  it("scans pending and lapsed-lease failed rows under the cap, oldest first, and delivers each", async () => {
    db.outboundPost.findMany.mockResolvedValue([{ id: "post-1" }, { id: "post-2" }] as never);

    const counts = await deliverPendingOutboundPosts(db, deps());

    expect(db.outboundPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["pending", "failed"] },
          attempts: { lt: MAX_OUTBOUND_ATTEMPTS },
          OR: [{ attemptAt: null }, { attemptAt: { lt: new Date(NOW.getTime() - OUTBOUND_LEASE_MS) } }],
        },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(counts).toEqual({ scanned: 2, sent: 2, failed: 0, cancelled: 0 });
  });

  it("keeps sweeping when one row's claim throws", async () => {
    db.outboundPost.findMany.mockResolvedValue([{ id: "post-bad" }, { id: "post-1" }] as never);
    db.outboundPost.updateMany
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValue({ count: 1 });

    const counts = await deliverPendingOutboundPosts(db, deps());

    expect(counts).toEqual({ scanned: 2, sent: 1, failed: 1, cancelled: 0 });
    expect(reportHandledError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: "outbound-post-sweep", context: { postId: "post-bad" } }),
    );
  });
});

describe("kickOutboundPosts", () => {
  it("delivers every id and swallows individual failures", async () => {
    poster.send.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ eventId: "$evt2" });

    await expect(kickOutboundPosts(db, ["post-1", "post-1"], deps())).resolves.toBeUndefined();
    expect(poster.send).toHaveBeenCalledTimes(2);
  });
});
