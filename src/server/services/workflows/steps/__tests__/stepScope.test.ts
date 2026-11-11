/**
 * The PM fetch steps must scope their queries to the run (`context`), never
 * to `userId` / `workspaceId` found in step input. Step input is built from
 * the definition's config and the caller's `overrideConfig`, both of which a
 * user controls, so honouring them let anyone read another user's actions
 * and projects.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const dbHolder = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        return (dbHolder.current as Record<string | symbol, unknown>)[prop];
      },
    },
  ),
}));

import { FetchBlockersStep } from "../FetchBlockersStep";
import { FetchCompletedActionsStep } from "../FetchCompletedActionsStep";
import { FetchPlannedActionsStep } from "../FetchPlannedActionsStep";
import { FetchProjectHealthStep } from "../FetchProjectHealthStep";

const context = { userId: "caller", workspaceId: "caller-ws", runId: "r1" };
const hostileInput = { userId: "victim", workspaceId: "victim-ws" };

describe("PM fetch steps ignore scope in step input", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = mockDeep<PrismaClient>();
    mockReset(dbMock);
    dbHolder.current = dbMock;
    dbMock.action.findMany.mockResolvedValue([]);
    dbMock.action.count.mockResolvedValue(0);
    dbMock.project.findMany.mockResolvedValue([]);
  });

  const steps = [
    new FetchBlockersStep(),
    new FetchCompletedActionsStep(),
    new FetchPlannedActionsStep(),
    new FetchProjectHealthStep(),
  ];

  it.each(steps.map((step) => [step.type, step] as const))(
    "%s queries as the run's user and workspace",
    async (_type, step) => {
      await step.execute(hostileInput, {}, context);

      const queries = JSON.stringify([
        ...dbMock.action.findMany.mock.calls,
        ...dbMock.project.findMany.mock.calls,
      ]);
      expect(queries).toContain('"caller"');
      expect(queries).not.toContain("victim");
    },
  );
});
