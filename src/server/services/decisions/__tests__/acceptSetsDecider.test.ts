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
const AGENT_DECIDER = { id: "decider-agent", userId: "agent-1", user: { isAgent: true } };
const HUMAN_DECIDER = { id: "decider-human", userId: "u-2", user: { isAgent: false } };
/** An external meeting participant: a person with no account. */
const EXTERNAL_DECIDER = { id: "decider-external", userId: null, user: null };

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
  deciders: [] as Array<{ id: string; userId: string | null; user: { isAgent: boolean } | null }>,
};

const PERSON_AS_DECIDER = { userId: "u-1", name: "James", email: "james@example.test" };

describe("accepting sets the decider", () => {
  let db: DeepMockProxy<PrismaClient>;

  function withRow(overrides: Partial<typeof ROW> = {}) {
    const row = { ...ROW, ...overrides };
    // What the row looks like after this call's writes, for the reads that follow.
    let written: Record<string, unknown> = { ...row, supersededBy: null };
    db.decision.findFirst.mockResolvedValue(row as never);
    db.decision.findUniqueOrThrow.mockImplementation((() => Promise.resolve(written)) as never);
    db.decision.update.mockImplementation(((args: { data: Record<string, unknown> }) => {
      written = { ...written, ...args.data };
      return Promise.resolve(written);
    }) as never);
    // The conditional DRAFT → CONFIRMED write matches (no concurrent confirm).
    db.decision.updateMany.mockImplementation(((args: { data: Record<string, unknown> }) => {
      written = { ...written, ...args.data };
      return Promise.resolve({ count: 1 });
    }) as never);
    db.decision.deleteMany.mockResolvedValue({ count: 1 } as never);
    return row;
  }
  /**
   * Everything written to the decision row, merged: a confirm is a
   * conditional `updateMany` plus, when it claims the decider, an `update`
   * in the same transaction; a status change is one `update`.
   */
  const updateData = () =>
    Object.assign(
      {},
      ...db.decision.updateMany.mock.calls.map((call) => (call[0] as { data: object }).data),
      ...db.decision.update.mock.calls.map((call) => (call[0] as { data: object }).data),
    ) as Record<string, unknown>;
  const clearWrites = () => {
    db.decision.update.mockClear();
    db.decision.updateMany.mockClear();
  };
  const writeCount = () =>
    db.decision.update.mock.calls.length + db.decision.updateMany.mock.calls.length;
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
      // Only the agent rows that were read are deleted, never "all deciders".
      expect(updateData().deciders).toEqual({
        deleteMany: { id: { in: [AGENT_DECIDER.id] } },
        create: [PERSON_AS_DECIDER],
      });
    });

    it("keeps human deciders already named — external participants included", async () => {
      withRow({ deciders: [AGENT_DECIDER, HUMAN_DECIDER] });
      await accept();
      expect(updateData()).not.toHaveProperty("deciders");

      clearWrites();
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
      clearWrites();
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

    it("confirms and accepts in ONE transaction, claims the decider, and records both events", async () => {
      withRow({ reviewState: "DRAFT", status: "PROPOSED", deciders: [] });
      const result = await confirm("ACCEPTED");

      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.decision.updateMany).toHaveBeenCalledTimes(1);
      expect(db.decision.updateMany.mock.calls[0]![0].where).toEqual({
        id: ROW.id,
        workspaceId: WORKSPACE_ID,
        reviewState: "DRAFT",
      });
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

    it("confirming a draft born ACCEPTED, without a status, makes the person the decider", async () => {
      withRow({ reviewState: "DRAFT", status: "ACCEPTED", deciders: [] });
      await confirm();
      expect(updateData()).toMatchObject({ reviewState: "CONFIRMED", deciders: { create: [PERSON_AS_DECIDER] } });
      expect(updateData()).not.toHaveProperty("status");
      expect(activityActions()).toEqual(["confirmed"]);
    });

    it.each(["OPEN", "PROPOSED", "DEPRECATED"] as const)(
      "confirming a draft that ends %s names no decider — confirming is not deciding",
      async (status) => {
        withRow({ reviewState: "DRAFT", status: "PROPOSED", deciders: [] });
        await confirm(status);
        expect(updateData()).not.toHaveProperty("deciders");
        expect(db.user.findUnique).not.toHaveBeenCalled();
      },
    );

    it("stamps decidedAt when confirming a draft that was born ACCEPTED", async () => {
      withRow({ reviewState: "DRAFT", status: "ACCEPTED", decidedAt: null });
      await confirm();
      expect(updateData().decidedAt).toBeInstanceOf(Date);

      // A date the draft already carries is kept.
      clearWrites();
      const decided = new Date("2026-10-01T09:00:00.000Z");
      withRow({ reviewState: "DRAFT", status: "ACCEPTED", decidedAt: decided });
      await confirm("ACCEPTED");
      expect(updateData()).not.toHaveProperty("decidedAt");
    });

    it("an already-confirmed ACCEPTED row with no date gains one, and nothing else", async () => {
      withRow({ reviewState: "CONFIRMED", status: "ACCEPTED", decidedAt: null });
      await confirm("ACCEPTED");
      expect(db.decision.update).toHaveBeenCalledTimes(1);
      expect(updateData()).toEqual({ decidedAt: expect.any(Date) });
      expect(recordActivity).not.toHaveBeenCalled();

      // Dated already: a true no-op.
      clearWrites();
      withRow({ reviewState: "CONFIRMED", status: "ACCEPTED", decidedAt: new Date() });
      await confirm();
      expect(writeCount()).toBe(0);
    });

    describe("concurrent confirms", () => {
      it("the confirm that loses the race settles as an already-confirmed row — no decider insert, no events", async () => {
        const draft = withRow({ reviewState: "DRAFT", status: "PROPOSED", deciders: [] });
        // Another confirm committed between our read and our write.
        db.decision.updateMany.mockResolvedValue({ count: 0 } as never);
        db.decision.findFirst
          .mockResolvedValueOnce(draft as never)
          .mockResolvedValueOnce({ ...draft, reviewState: "CONFIRMED", status: "ACCEPTED", decidedAt: new Date() } as never);

        const result = await confirm("ACCEPTED");

        expect(result.id).toBe(ROW.id);
        expect(db.decision.update).not.toHaveBeenCalled();
        expect(recordActivity).not.toHaveBeenCalled();
      });

      it("a loser that finds the draft rejected meanwhile is refused, not 500", async () => {
        const draft = withRow({ reviewState: "DRAFT", deciders: [] });
        db.decision.updateMany.mockResolvedValue({ count: 0 } as never);
        db.decision.findFirst
          .mockResolvedValueOnce(draft as never)
          .mockResolvedValueOnce({ ...draft, reviewState: "REJECTED" } as never);
        await expect(confirm("ACCEPTED")).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });

      it("never loops: a row still a draft after losing is a CONFLICT", async () => {
        withRow({ reviewState: "DRAFT", deciders: [] });
        db.decision.updateMany.mockResolvedValue({ count: 0 } as never);
        await expect(confirm()).rejects.toMatchObject({ code: "CONFLICT" });
        expect(db.decision.updateMany).toHaveBeenCalledTimes(2);
      });

      it("a resolution draft another confirm already absorbed returns the target untouched", async () => {
        const target = {
          id: "dec-2",
          number: 2,
          statement: "Open question",
          status: "ACCEPTED",
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
        db.decision.deleteMany.mockResolvedValue({ count: 0 } as never);
        db.decision.findUniqueOrThrow.mockResolvedValue({ ...target, supersededBy: null } as never);

        const result = await confirm("ACCEPTED");

        expect(result.id).toBe("dec-2");
        expect(db.decision.deleteMany).toHaveBeenCalledWith({
          where: { id: ROW.id, workspaceId: WORKSPACE_ID, reviewState: "DRAFT" },
        });
        expect(db.decision.update).not.toHaveBeenCalled();
        expect(recordActivity).not.toHaveBeenCalled();
      });
    });

    it("refuses SUPERSEDED, which needs a successor, before reading anything", async () => {
      withRow({ reviewState: "DRAFT" });
      await expect(confirm("SUPERSEDED")).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.decision.findFirst).not.toHaveBeenCalled();
      expect(writeCount()).toBe(0);
    });

    it("an already-confirmed row stays idempotent, but takes a different status as setStatus would", async () => {
      withRow({ reviewState: "CONFIRMED", status: "PROPOSED", deciders: [AGENT_DECIDER] });

      await confirm();
      await confirm("PROPOSED");
      expect(writeCount()).toBe(0);
      expect(recordActivity).not.toHaveBeenCalled();

      await confirm("ACCEPTED");
      expect(db.decision.update).toHaveBeenCalledTimes(1);
      const data = updateData();
      expect(data).toMatchObject({
        status: "ACCEPTED",
        deciders: { deleteMany: { id: { in: [AGENT_DECIDER.id] } }, create: [PERSON_AS_DECIDER] },
      });
      // Not a second confirm: the review stamp is left as it was.
      expect(data).not.toHaveProperty("reviewState");
      expect(activityActions()).toEqual(["accepted"]);
    });

    function withResolution(targetOverrides: Record<string, unknown> = {}) {
      const target = {
        id: "dec-2",
        number: 2,
        statement: "Open question",
        status: "OPEN",
        body: null,
        decidedAt: null,
        transcriptionSessionId: null,
        evidence: [],
        projectId: null,
        workspaceId: WORKSPACE_ID,
        reviewState: "CONFIRMED",
        transcriptionSession: null,
        deciders: [],
        ...targetOverrides,
      };
      db.decision.findFirst
        .mockResolvedValueOnce({ ...ROW, reviewState: "DRAFT", supersededById: "dec-2" } as never)
        .mockResolvedValueOnce(target as never);
      getDecisionAccess.mockResolvedValue({});
      canEditDecision.mockReturnValue(true);
      db.decision.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...target, ...args.data, supersededBy: null })) as never);
      db.decision.deleteMany.mockResolvedValue({ count: 1 } as never);
      return target;
    }

    it.each(["OPEN", "PROPOSED"] as const)(
      "a resolution left %s gets no decided date and no decider",
      async (status) => {
        withResolution({ status: "OPEN" });
        await confirm(status);
        expect(updateData()).not.toHaveProperty("decidedAt");
        expect(updateData()).not.toHaveProperty("deciders");
      },
    );

    it("a resolution that accepts the target dates it", async () => {
      withResolution({ status: "OPEN" });
      await confirm();
      expect(updateData()).toMatchObject({ status: "ACCEPTED", decidedAt: expect.any(Date) });
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
      db.decision.deleteMany.mockResolvedValue({ count: 1 } as never);

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
