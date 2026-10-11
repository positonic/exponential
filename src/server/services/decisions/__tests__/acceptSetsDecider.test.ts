import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";

/**
 * A person who accepts or confirms a decision nobody human stands behind
 * becomes its decider (CONTEXT.md "Decision"). Agents log drafts with no
 * decider (ADR-0070), and pre-ADR-0070 rows may name the agent itself, so
 * without this an agent-logged decision a person accepted would end up with
 * no decider, or the agent as one. Also pins `confirmDraft`'s optional
 * `status`: confirm and status change in one write.
 */
const getDecisionAccess = vi.hoisted(() => vi.fn());
const canEditDecision = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/access/resolvers/decisionResolver", () => ({
  getDecisionAccess,
  canEditDecision,
}));
const recordActivity = vi.hoisted(() => vi.fn(async () => true));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity }));

import { confirmDraft, setStatus } from "../decisionService";

const WORKSPACE_ID = "ws-1";
const PERSON = { id: "u-1", name: "James", email: "James@Example.test", isAgent: false };
const AGENT_DECIDER = { userId: "agent-1", user: { isAgent: true } };
const HUMAN_DECIDER = { userId: "u-2", user: { isAgent: false } };
/** An external meeting participant: a person with no account. */
const EXTERNAL_DECIDER = { userId: null, user: null };

const ROW = {
  id: "dec-6",
  workspaceId: WORKSPACE_ID,
  number: 6,
  statement: "Grill answers are logged as drafts",
  status: "PROPOSED",
  reviewState: "CONFIRMED",
  decidedAt: null as Date | null,
  supersededById: null as string | null,
  source: "AGENT",
  transcriptionSessionId: null as string | null,
  body: null,
  evidence: [],
  deciders: [] as Array<{ userId: string | null; user: { isAgent: boolean } | null }>,
};

const PERSON_AS_DECIDER = { userId: "u-1", name: "James", email: "james@example.test" };

describe("accepting sets the decider", () => {
  let db: DeepMockProxy<PrismaClient>;

  function withRow(overrides: Partial<typeof ROW> = {}) {
    const row = { ...ROW, ...overrides };
    db.decision.findFirst.mockResolvedValue(row as never);
    db.decision.findUniqueOrThrow.mockResolvedValue({ ...row, supersededBy: null } as never);
    db.decision.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...row, ...args.data, supersededBy: null })) as never);
    return row;
  }
  const updateData = (call = 0) =>
    (db.decision.update.mock.calls[call]![0] as { data: Record<string, unknown> }).data;
  const activityActions = () =>
    recordActivity.mock.calls.map((call) => (call as unknown as [unknown, { action: string }])[1].action);

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    recordActivity.mockClear();
    getDecisionAccess.mockReset();
    canEditDecision.mockReset();
    db.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: PrismaClient) => Promise<unknown>)(db));
    db.user.findUnique.mockResolvedValue(PERSON as never);
  });

  describe("setStatus", () => {
    const accept = (extra: { actorIsAgent?: boolean } = {}) =>
      setStatus(db, { decisionId: ROW.id, workspaceId: WORKSPACE_ID, userId: PERSON.id, status: "ACCEPTED", ...extra });

    it("a person accepting a decision with no deciders becomes its sole decider, in the same write", async () => {
      withRow({ deciders: [] });
      await accept();

      expect(db.decision.update).toHaveBeenCalledTimes(1);
      expect(updateData()).toMatchObject({
        status: "ACCEPTED",
        deciders: { create: [PERSON_AS_DECIDER] },
      });
      // Nothing to replace, so nothing is deleted.
      expect(updateData().deciders).not.toHaveProperty("deleteMany");
    });

    it("replaces deciders that are only agent principals (pre-ADR-0070 rows)", async () => {
      withRow({ deciders: [AGENT_DECIDER] });
      await accept();
      expect(updateData().deciders).toEqual({ deleteMany: {}, create: [PERSON_AS_DECIDER] });
    });

    it("keeps human deciders already named — external participants included", async () => {
      withRow({ deciders: [AGENT_DECIDER, HUMAN_DECIDER] });
      await accept();
      expect(updateData()).not.toHaveProperty("deciders");

      db.decision.update.mockClear();
      withRow({ deciders: [EXTERNAL_DECIDER] });
      await accept();
      expect(updateData()).not.toHaveProperty("deciders");
    });

    it("an agent principal accepting never becomes the decider", async () => {
      db.user.findUnique.mockResolvedValue({ ...PERSON, isAgent: true } as never);
      withRow({ deciders: [] });
      await accept();
      expect(updateData()).not.toHaveProperty("deciders");

      // An agent-key caller is known to be an agent before any lookup.
      db.decision.update.mockClear();
      db.user.findUnique.mockClear();
      await accept({ actorIsAgent: true });
      expect(updateData()).not.toHaveProperty("deciders");
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it("other transitions leave the deciders alone", async () => {
      withRow({ status: "ACCEPTED", deciders: [] });
      await setStatus(db, {
        decisionId: ROW.id,
        workspaceId: WORKSPACE_ID,
        userId: PERSON.id,
        status: "DEPRECATED",
      });
      expect(updateData()).not.toHaveProperty("deciders");
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("confirmDraft", () => {
    const confirm = (status?: "OPEN" | "PROPOSED" | "ACCEPTED" | "SUPERSEDED" | "DEPRECATED") =>
      confirmDraft(db, { decisionId: ROW.id, workspaceId: WORKSPACE_ID, userId: PERSON.id, status });

    it("confirms and accepts in ONE write, claims the decider, and records both events", async () => {
      withRow({ reviewState: "DRAFT", status: "PROPOSED", deciders: [] });
      const result = await confirm("ACCEPTED");

      expect(db.decision.update).toHaveBeenCalledTimes(1);
      const data = updateData();
      expect(data).toMatchObject({
        reviewState: "CONFIRMED",
        confirmedById: PERSON.id,
        status: "ACCEPTED",
        deciders: { create: [PERSON_AS_DECIDER] },
      });
      expect(data.decidedAt).toBeInstanceOf(Date);
      expect(result.status).toBe("ACCEPTED");
      // The confirm, then the lifecycle entry `setStatus` would have written.
      expect(activityActions()).toEqual(["confirmed", "accepted"]);
    });

    it("confirming without a status still makes the person the decider", async () => {
      withRow({ reviewState: "DRAFT", status: "ACCEPTED", deciders: [] });
      await confirm();
      expect(updateData()).toMatchObject({ reviewState: "CONFIRMED", deciders: { create: [PERSON_AS_DECIDER] } });
      expect(updateData()).not.toHaveProperty("status");
      expect(activityActions()).toEqual(["confirmed"]);
    });

    it("confirming an OPEN question names no decider — nobody has decided it yet", async () => {
      withRow({ reviewState: "DRAFT", status: "OPEN", deciders: [] });
      await confirm();
      expect(updateData()).not.toHaveProperty("deciders");
    });

    it("refuses SUPERSEDED, which needs a successor, before reading anything", async () => {
      withRow({ reviewState: "DRAFT" });
      await expect(confirm("SUPERSEDED")).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.decision.findFirst).not.toHaveBeenCalled();
      expect(db.decision.update).not.toHaveBeenCalled();
    });

    it("an already-confirmed row stays idempotent, but takes a different status as setStatus would", async () => {
      withRow({ reviewState: "CONFIRMED", status: "PROPOSED", deciders: [AGENT_DECIDER] });

      await confirm();
      await confirm("PROPOSED");
      expect(db.decision.update).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();

      await confirm("ACCEPTED");
      expect(db.decision.update).toHaveBeenCalledTimes(1);
      const data = updateData();
      expect(data).toMatchObject({ status: "ACCEPTED", deciders: { deleteMany: {}, create: [PERSON_AS_DECIDER] } });
      // Not a second confirm: the review stamp is left as it was.
      expect(data).not.toHaveProperty("reviewState");
      expect(activityActions()).toEqual(["accepted"]);
    });

    it("applies the status to the decision a resolution draft resolves", async () => {
      const target = {
        id: "dec-2",
        number: 2,
        statement: "Old answer",
        status: "DEPRECATED",
        body: null,
        decidedAt: null,
        transcriptionSessionId: null,
        evidence: [],
        projectId: null,
        workspaceId: WORKSPACE_ID,
        reviewState: "CONFIRMED",
        transcriptionSession: null,
        deciders: [],
      };
      db.decision.findFirst
        .mockResolvedValueOnce({ ...ROW, reviewState: "DRAFT", supersededById: "dec-2" } as never)
        .mockResolvedValueOnce(target as never);
      getDecisionAccess.mockResolvedValue({});
      canEditDecision.mockReturnValue(true);
      db.decision.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...target, ...args.data, supersededBy: null })) as never);
      db.decision.delete.mockResolvedValue({} as never);

      const result = await confirm("ACCEPTED");

      expect(result.id).toBe("dec-2");
      expect(db.decision.update.mock.calls[0]![0].where).toEqual({ id: "dec-2", workspaceId: WORKSPACE_ID });
      expect(updateData()).toMatchObject({
        status: "ACCEPTED",
        supersededById: null,
        deciders: { create: [PERSON_AS_DECIDER] },
      });
      expect(activityActions()).toEqual(["accepted"]);
    });
  });
});
