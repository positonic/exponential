import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { Principal } from "~/server/services/access/principal";

/**
 * Record integrity (ADR-0071; audit matrix row 1): an agent never presents a
 * proposal as an accepted decision. Once a person has confirmed a decision,
 * an agent principal (an External agent or Assistant, or Zoe and the
 * gateways acting for a person) cannot move its status or rewrite what it
 * says. It proposes a change as a new draft decision instead. People keep
 * both paths.
 *
 * The rule lives in the service (`setStatus`, `updateDecision`), which takes
 * the verified `Principal`, so every route that reaches it is covered.
 */
const getDecisionAccess = vi.hoisted(() => vi.fn());
const canEditDecision = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/access/resolvers/decisionResolver", () => ({
  getDecisionAccess,
  canEditDecision,
}));
const recordActivity = vi.hoisted(() => vi.fn(async () => true));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity }));

import { confirmDraft, setStatus, updateDecision } from "../decisionService";

const WORKSPACE_ID = "ws-1";
const PERSON_ID = "u-1";

const HUMAN: Principal = { kind: "human", userId: PERSON_ID, surface: "web" };
const AGENT: Principal = {
  kind: "agent",
  userId: "shadow-1",
  agentId: "agent-1",
  ownerId: PERSON_ID,
  surface: "agent-key",
};
const ZOE: Principal = { kind: "agent_for_human", userId: PERSON_ID, surface: "agent-context" };
const AGENT_PRINCIPALS: Array<[string, Principal]> = [
  ["an agent", AGENT],
  ["Zoe acting for a person", ZOE],
];

const ROW = {
  id: "dec-1",
  workspaceId: WORKSPACE_ID,
  number: 1,
  statement: "Use tRPC",
  status: "PROPOSED",
  reviewState: "CONFIRMED",
  decidedAt: null as Date | null,
  supersededById: null as string | null,
  source: "MANUAL",
  transcriptionSessionId: null as string | null,
  deciders: [] as unknown[],
};

describe("record integrity: agents cannot move or rewrite a confirmed decision", () => {
  let db: DeepMockProxy<PrismaClient>;

  function withRow(overrides: Partial<typeof ROW> = {}) {
    const row = { ...ROW, ...overrides };
    db.decision.findFirst.mockResolvedValue(row as never);
    db.decision.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...row, ...args.data, supersededBy: null })) as never);
    return row;
  }

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    recordActivity.mockClear();
    db.user.findUnique.mockResolvedValue({ id: PERSON_ID, name: "James", email: "j@example.test", isAgent: false } as never);
  });

  describe("setStatus", () => {
    it.each(AGENT_PRINCIPALS)("%s cannot move a confirmed decision to any status", async (_label, principal) => {
      for (const status of ["ACCEPTED", "OPEN", "PROPOSED", "DEPRECATED"] as const) {
        withRow();
        await expect(
          setStatus(db, { decisionId: ROW.id, workspaceId: WORKSPACE_ID, userId: principal.userId, principal, status }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(db.decision.update).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("a person still moves a confirmed decision, and accepting makes them the decider", async () => {
      withRow();
      const result = await setStatus(db, {
        decisionId: ROW.id,
        workspaceId: WORKSPACE_ID,
        userId: PERSON_ID,
        principal: HUMAN,
        status: "ACCEPTED",
      });
      expect(result.status).toBe("ACCEPTED");
      const data = (db.decision.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({ status: "ACCEPTED", deciders: { create: [expect.objectContaining({ userId: PERSON_ID })] } });
    });

    it("a draft still answers 'confirm it first', whoever asks", async () => {
      withRow({ reviewState: "DRAFT" });
      await expect(
        setStatus(db, { decisionId: ROW.id, workspaceId: WORKSPACE_ID, userId: PERSON_ID, principal: HUMAN, status: "ACCEPTED" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("confirmDraft", () => {
    it.each(AGENT_PRINCIPALS)("%s can neither confirm a draft nor move a confirmed decision through it", async (_label, principal) => {
      for (const reviewState of ["DRAFT", "CONFIRMED"]) {
        withRow({ reviewState });
        await expect(
          confirmDraft(db, { decisionId: ROW.id, workspaceId: WORKSPACE_ID, userId: principal.userId, principal, status: "ACCEPTED" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(db.decision.update).not.toHaveBeenCalled();
      expect(db.decision.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("updateDecision", () => {
    const update = (principal: Principal, patch: Parameters<typeof updateDecision>[1]["patch"]) =>
      updateDecision(db, { decisionId: ROW.id, workspaceId: WORKSPACE_ID, userId: principal.userId, principal, patch });

    it.each(AGENT_PRINCIPALS)("%s cannot rewrite what a confirmed decision says", async (_label, principal) => {
      withRow({ status: "ACCEPTED" });
      for (const patch of [
        { statement: "Use REST" },
        { body: "We changed our minds" },
        { decidedAt: new Date("2026-01-01T00:00:00.000Z") },
      ]) {
        await expect(update(principal, patch)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(db.decision.update).not.toHaveBeenCalled();
    });

    it.each(AGENT_PRINCIPALS)("%s may still file a confirmed decision under a project or ADR", async (_label, principal) => {
      withRow({ status: "ACCEPTED" });
      db.adrDocument.findFirst.mockResolvedValue({ id: "adr-1" } as never);
      db.project.findFirst.mockResolvedValue({ id: "proj-1" } as never);
      await update(principal, { projectId: "proj-1" });
      expect(db.decision.update).toHaveBeenCalledTimes(1);
    });

    it.each(AGENT_PRINCIPALS)("%s may still edit a draft's statement, and the write is conditional on it staying a draft", async (_label, principal) => {
      withRow({ reviewState: "DRAFT" });
      await update(principal, { statement: "Use tRPC everywhere" });
      const args = db.decision.update.mock.calls[0]![0] as { where: Record<string, unknown> };
      // A person confirming between the read and the write turns this into a
      // miss, not a rewrite of the now-confirmed row.
      expect(args.where).toEqual({ id: ROW.id, workspaceId: WORKSPACE_ID, reviewState: { not: "CONFIRMED" } });
    });

    it("a draft confirmed between the read and the write is refused, not rewritten", async () => {
      withRow({ reviewState: "DRAFT" });
      db.decision.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("No record was found for an update.", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      await expect(update(ZOE, { statement: "Use REST" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("a person still rewrites a confirmed decision", async () => {
      withRow({ status: "ACCEPTED" });
      await update(HUMAN, { statement: "Use tRPC for every API" });
      const args = db.decision.update.mock.calls[0]![0] as { where: Record<string, unknown>; data: Record<string, unknown> };
      expect(args.data.statement).toBe("Use tRPC for every API");
      expect(args.where).toEqual({ id: ROW.id, workspaceId: WORKSPACE_ID });
    });

    it("a decision that is not in the workspace is not found", async () => {
      db.decision.findFirst.mockResolvedValue(null);
      await expect(update(AGENT, { statement: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
