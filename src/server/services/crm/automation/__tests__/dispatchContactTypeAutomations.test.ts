/**
 * Unit tests for the impure CRM automation dispatcher's idempotency rule.
 *
 * The pure firing decision lives in `triggerResolver.test.ts`; here we only
 * pin the DB-facing behaviour the resolver can't see: a FAILED prior run must
 * NOT count as "already fired", so a failed onboarding (transient email/Adobe
 * error, missing template) is retried on the next save, while a SUCCESS/RUNNING
 * run keeps firing idempotent.
 *
 * `WorkflowEngine` is mocked so no real step executes and no DB/network is hit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const executeMock = vi.fn().mockResolvedValue({ id: "run-new" });

vi.mock("~/server/services/workflows/WorkflowEngine", () => ({
  WorkflowEngine: class {
    execute = executeMock;
  },
}));

vi.mock("~/server/services/workflows/StepRegistry", () => ({
  createStepRegistry: vi.fn(() => ({})),
}));

import { dispatchContactTypeAutomations } from "../dispatchContactTypeAutomations";
import { CRM_CONTACT_TYPE_TRIGGER } from "../triggerResolver";

const db = mockDeep<PrismaClient>();

const baseInput = {
  contactId: "contact-1",
  workspaceId: "ws-1",
  oldProfileType: null,
  newProfileType: "Channel Partner",
  triggeredById: "user-1",
};

beforeEach(() => {
  mockReset(db);
  executeMock.mockClear();
  db.workflowDefinition.findMany.mockResolvedValue([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "def-cp", config: { targetCustomerType: "Channel Partner" } } as any,
  ]);
});

describe("dispatchContactTypeAutomations idempotency", () => {
  it("excludes FAILED runs from the idempotency check", async () => {
    db.workflowPipelineRun.findMany.mockResolvedValue([]);

    await dispatchContactTypeAutomations(db, baseInput);

    const where = db.workflowPipelineRun.findMany.mock.calls[0]?.[0]?.where;
    expect(where?.status).toEqual({ not: "FAILED" });
  });

  it("retries an automation whose only prior run FAILED", async () => {
    // The query already filters out FAILED rows, so a contact with only a
    // failed run comes back empty here → the automation fires again.
    db.workflowPipelineRun.findMany.mockResolvedValue([]);

    const result = await dispatchContactTypeAutomations(db, baseInput);

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(result.firedDefinitionIds).toEqual(["def-cp"]);
  });

  it("does not re-fire when a non-failed run already exists", async () => {
    db.workflowPipelineRun.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { definitionId: "def-cp" } as any,
    ]);

    const result = await dispatchContactTypeAutomations(db, baseInput);

    expect(executeMock).not.toHaveBeenCalled();
    expect(result.firedDefinitionIds).toEqual([]);
  });

  it("queries only this contact's runs for the active CRM trigger", async () => {
    db.workflowPipelineRun.findMany.mockResolvedValue([]);

    await dispatchContactTypeAutomations(db, baseInput);

    const defWhere = db.workflowDefinition.findMany.mock.calls[0]?.[0]?.where;
    expect(defWhere?.triggerType).toBe(CRM_CONTACT_TYPE_TRIGGER);
    expect(defWhere?.isActive).toBe(true);

    const runWhere = db.workflowPipelineRun.findMany.mock.calls[0]?.[0]?.where;
    expect(runWhere?.input).toEqual({
      path: ["contactId"],
      equals: "contact-1",
    });
  });
});
