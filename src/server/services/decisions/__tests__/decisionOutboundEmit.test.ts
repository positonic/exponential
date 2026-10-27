/**
 * The decision service emits an outbound post on a person's act and on nothing else
 * (ADR-0075, D-0056): a confirmed create, a confirm, an accept / supersede /
 * deprecate. Drafts and agent actors emit nothing, and a failing emit never fails the
 * write.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";

const emitOutboundPost = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("~/server/services/outboundPosts/emit", () => ({ emitOutboundPost }));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity: vi.fn(async () => true) }));
vi.mock("~/server/services/access/resolvers/decisionResolver", () => ({
  getDecisionAccess: vi.fn(),
  canEditDecision: vi.fn(() => true),
}));

import { confirmDraft, createDecision, setStatus } from "../decisionService";

const WORKSPACE_ID = "ws-1";
const USER = "user-1";

const CONFIRMED = {
  id: "dec-1",
  workspaceId: WORKSPACE_ID,
  number: 7,
  statement: "Use tRPC",
  status: "PROPOSED",
  reviewState: "CONFIRMED",
  decidedAt: null,
  supersededById: null,
  source: "MANUAL",
  transcriptionSessionId: null,
  projectId: null,
  deciders: [],
  supersededBy: null,
};

let db: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
  emitOutboundPost.mockClear();
  emitOutboundPost.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ id: USER, name: "Dev", email: "dev@example.test", isAgent: false } as never);
  // The agent-principal existence check: nobody is an agent unless a test says so.
  db.user.findFirst.mockResolvedValue(null as never);
});

describe("decision service → outbound posts", () => {
  it("a person's confirmed create emits `published`", async () => {
    db.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(db)) as never);
    db.workspace.update.mockResolvedValue({ decisionCounter: 7 } as never);
    db.decision.create.mockResolvedValue(CONFIRMED as never);

    await createDecision(db, { workspaceId: WORKSPACE_ID, createdById: USER, statement: "Use tRPC" });

    expect(emitOutboundPost).toHaveBeenCalledWith(db, {
      kind: "decision",
      subjectId: "dec-1",
      event: "published",
      actorUserId: USER,
      actorIsAgent: false,
    });
  });

  it("a draft create emits nothing", async () => {
    db.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(db)) as never);
    db.workspace.update.mockResolvedValue({ decisionCounter: 8 } as never);
    db.decision.create.mockResolvedValue({ ...CONFIRMED, id: "draft-1", reviewState: "DRAFT" } as never);

    await createDecision(db, {
      workspaceId: WORKSPACE_ID,
      createdById: "agent-1",
      statement: "x",
      asDraft: true,
      creatorIsAgent: true,
    });

    expect(emitOutboundPost).not.toHaveBeenCalled();
  });

  it("accepting emits `accepted`; an agent actor's status change emits with actorIsAgent", async () => {
    db.decision.findFirst.mockResolvedValue(CONFIRMED as never);
    db.decision.update.mockResolvedValue({ ...CONFIRMED, status: "ACCEPTED" } as never);

    await setStatus(db, { decisionId: "dec-1", workspaceId: WORKSPACE_ID, userId: USER, status: "ACCEPTED" });
    expect(emitOutboundPost).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ event: "accepted", actorIsAgent: false }),
    );

    await setStatus(db, {
      decisionId: "dec-1",
      workspaceId: WORKSPACE_ID,
      userId: USER,
      status: "DEPRECATED",
      actorIsAgent: true,
    });
    expect(emitOutboundPost).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ event: "deprecated", actorIsAgent: true }),
    );
  });

  it("an agent principal's login counts as an agent actor even without the token flag", async () => {
    db.user.findUnique.mockResolvedValue({ id: "agent-1", name: "Bot", email: null, isAgent: true } as never);
    db.user.findFirst.mockResolvedValue({ id: "agent-1" } as never);
    db.decision.findFirst.mockResolvedValue(CONFIRMED as never);
    db.decision.update.mockResolvedValue({ ...CONFIRMED, status: "ACCEPTED" } as never);

    await setStatus(db, { decisionId: "dec-1", workspaceId: WORKSPACE_ID, userId: "agent-1", status: "ACCEPTED" });

    expect(emitOutboundPost).toHaveBeenLastCalledWith(db, expect.objectContaining({ actorIsAgent: true }));
  });

  it("confirming a draft emits `published`, plus the transition when confirmed as accepted", async () => {
    const draft = { ...CONFIRMED, id: "draft-2", reviewState: "DRAFT", status: "OPEN", body: null, evidence: [] };
    db.decision.findFirst.mockResolvedValue(draft as never);
    db.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(db)) as never);
    db.decision.updateMany.mockResolvedValue({ count: 1 });
    db.decision.findUniqueOrThrow.mockResolvedValue({ ...draft, reviewState: "CONFIRMED" } as never);
    db.decision.update.mockResolvedValue({ ...draft, reviewState: "CONFIRMED", status: "ACCEPTED" } as never);

    await confirmDraft(db, { decisionId: "draft-2", workspaceId: WORKSPACE_ID, userId: USER });
    expect(emitOutboundPost.mock.calls.map((c) => (c[1] as { event: string }).event)).toEqual(["published"]);

    emitOutboundPost.mockClear();
    await confirmDraft(db, { decisionId: "draft-2", workspaceId: WORKSPACE_ID, userId: USER, status: "ACCEPTED" });
    expect(emitOutboundPost.mock.calls.map((c) => (c[1] as { event: string }).event)).toEqual([
      "published",
      "accepted",
    ]);
  });

  it("a failing emit never fails the write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    emitOutboundPost.mockRejectedValue(new Error("emit exploded"));
    db.decision.findFirst.mockResolvedValue(CONFIRMED as never);
    db.decision.update.mockResolvedValue({ ...CONFIRMED, status: "ACCEPTED" } as never);

    await expect(
      setStatus(db, { decisionId: "dec-1", workspaceId: WORKSPACE_ID, userId: USER, status: "ACCEPTED" }),
    ).resolves.toMatchObject({ status: "ACCEPTED" });
  });
});
