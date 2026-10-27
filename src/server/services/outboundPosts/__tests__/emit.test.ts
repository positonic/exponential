/**
 * `emitOutboundPost` is a database write and nothing else: it must never contact a
 * provider, never throw into the producing write, and never post for an agent's act.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

import { emitOutboundPost } from "~/server/services/outboundPosts/emit";
import {
  registerProducer,
  resetProducersForTests,
} from "~/server/services/outboundPosts/producers";
import type { Producer, OutboundSubject } from "~/server/services/outboundPosts/types";

const reportHandledError = vi.hoisted(() => vi.fn());
vi.mock("~/lib/reportHandledError", () => ({ reportHandledError }));

const WORKSPACE = "ws-1";
const PROJECT = "proj-1";
const SUBJECT = "dec-1";

const ROOM_LINK = {
  id: "link-1",
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

let db: DeepMockProxy<PrismaClient>;

/** A stand-in producer; the real decisions producer lands in its own ticket. */
function testProducer(subject: OutboundSubject | null): Producer {
  return {
    kind: "decision",
    load: vi.fn().mockResolvedValue(subject),
    render: vi.fn().mockReturnValue({ html: "<p>x</p>", text: "x", markdown: "x" }),
  };
}

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
  reportHandledError.mockReset();
  resetProducersForTests();
  db.project.findUnique.mockResolvedValue({ isRestricted: false } as never);
});

describe("emitOutboundPost", () => {
  it("inserts one pending row for the resolved destination and returns its id", async () => {
    registerProducer(testProducer({ workspaceId: WORKSPACE, projectId: PROJECT }));
    db.channelLink.findFirst
      .mockResolvedValueOnce(null as never) // no project row
      .mockResolvedValueOnce(ROOM_LINK as never); // workspace default
    db.outboundPost.create.mockResolvedValue({ id: "post-1" } as never);

    const ids = await emitOutboundPost(db, {
      kind: "decision",
      subjectId: SUBJECT,
      event: "published",
      actorUserId: "user-1",
      actorIsAgent: false,
    });

    expect(ids).toEqual(["post-1"]);
    expect(db.outboundPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WORKSPACE,
          kind: "decision",
          subjectId: SUBJECT,
          event: "published",
          channelLinkId: "link-1",
          provider: "matrix",
          externalId: "!leadership:example.org",
          serverIntegrationId: "int-1",
          requestedById: "user-1",
        }),
      }),
    );
  });

  it("never posts for an agent's act, and does not even look up the destination", async () => {
    registerProducer(testProducer({ workspaceId: WORKSPACE, projectId: PROJECT }));

    const ids = await emitOutboundPost(db, {
      kind: "decision",
      subjectId: SUBJECT,
      event: "published",
      actorUserId: "agent-1",
      actorIsAgent: true,
    });

    expect(ids).toEqual([]);
    expect(db.channelLink.findFirst).not.toHaveBeenCalled();
    expect(db.outboundPost.create).not.toHaveBeenCalled();
  });

  it("enqueues nothing when no destination resolves", async () => {
    registerProducer(testProducer({ workspaceId: WORKSPACE, projectId: PROJECT }));
    db.channelLink.findFirst.mockResolvedValue(null as never);

    const ids = await emitOutboundPost(db, {
      kind: "decision",
      subjectId: SUBJECT,
      event: "published",
      actorUserId: "user-1",
      actorIsAgent: false,
    });

    expect(ids).toEqual([]);
    expect(db.outboundPost.create).not.toHaveBeenCalled();
  });

  it("enqueues nothing when the project is Off for this kind", async () => {
    registerProducer(testProducer({ workspaceId: WORKSPACE, projectId: PROJECT }));
    db.channelLink.findFirst.mockResolvedValueOnce({ ...ROOM_LINK, projectId: PROJECT, isActive: false } as never);

    const ids = await emitOutboundPost(db, {
      kind: "decision",
      subjectId: SUBJECT,
      event: "published",
      actorUserId: "user-1",
      actorIsAgent: false,
    });

    expect(ids).toEqual([]);
    expect(db.outboundPost.create).not.toHaveBeenCalled();
  });

  it("treats a duplicate (kind, subject, event, destination) as a no-op", async () => {
    registerProducer(testProducer({ workspaceId: WORKSPACE, projectId: null }));
    db.channelLink.findFirst.mockResolvedValue(ROOM_LINK as never);
    db.outboundPost.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );

    const ids = await emitOutboundPost(db, {
      kind: "decision",
      subjectId: SUBJECT,
      event: "published",
      actorUserId: "user-1",
      actorIsAgent: false,
    });

    expect(ids).toEqual([]);
    expect(reportHandledError).not.toHaveBeenCalled();
  });

  it("enqueues nothing for an unknown producer or a vanished subject", async () => {
    await expect(
      emitOutboundPost(db, {
        kind: "agenda",
        subjectId: "occ-1",
        event: "generated",
        actorUserId: "user-1",
        actorIsAgent: false,
      }),
    ).resolves.toEqual([]);

    registerProducer(testProducer(null));
    await expect(
      emitOutboundPost(db, {
        kind: "decision",
        subjectId: "gone",
        event: "published",
        actorUserId: "user-1",
        actorIsAgent: false,
      }),
    ).resolves.toEqual([]);
    expect(db.outboundPost.create).not.toHaveBeenCalled();
  });

  it("reports and swallows any other failure so the producing write survives", async () => {
    registerProducer(testProducer({ workspaceId: WORKSPACE, projectId: null }));
    db.channelLink.findFirst.mockRejectedValue(new Error("db down"));

    const ids = await emitOutboundPost(db, {
      kind: "decision",
      subjectId: SUBJECT,
      event: "published",
      actorUserId: "user-1",
      actorIsAgent: false,
    });

    expect(ids).toEqual([]);
    expect(reportHandledError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: "outbound-post-emit" }),
    );
  });
});
