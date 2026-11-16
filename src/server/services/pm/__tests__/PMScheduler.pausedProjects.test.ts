/**
 * A paused (On hold, Completed, Cancelled) project's actions are off the
 * person's plate. PMScheduler's daily overdue check must not count them, and
 * the standup summary it runs (`pm-standup-summary`: planned today + blockers
 * and overdue) must not list them. Project-less actions are never paused.
 *
 * Prisma never runs here: each `findMany` evaluates the real `where` against
 * in-memory rows with `matchesWhere`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { matchesWhere } from "~/test/prismaWhere";

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});
// The scheduler's workflow side is not under test; keep its imports light.
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("~/server/services/workflows/WorkflowEngine", () => ({ WorkflowEngine: class {} }));
vi.mock("~/server/services/workflows/StepRegistry", () => ({ createStepRegistry: vi.fn() }));
vi.mock("~/server/services/workflows/seedTemplates", () => ({ seedWorkflowTemplates: vi.fn() }));

import { db as dbSingleton } from "~/server/db";
import { pmScheduler } from "../PMScheduler";
import { FetchBlockersStep } from "~/server/services/workflows/steps/FetchBlockersStep";
import { FetchPlannedActionsStep } from "~/server/services/workflows/steps/FetchPlannedActionsStep";

type Row = Record<string, unknown>;

const db = dbSingleton as unknown as DeepMockProxy<PrismaClient>;

const serveFrom = (rows: Row[]) =>
  ((args: { where?: Record<string, unknown> }) =>
    Promise.resolve(rows.filter((r) => matchesWhere(r, args.where ?? {})))) as never;

const now = new Date();
const daysFromToday = (days: number, hour: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** An ACTIVE action created by u1, in a project with `projectStatus` (or none). */
function action(id: string, projectStatus: string | null, scheduledStart: Date): Row {
  return {
    id,
    name: id,
    createdById: "u1",
    status: "ACTIVE",
    priority: "Quick",
    duration: 30,
    scheduledStart,
    projectId: projectStatus ? `p-${id}` : null,
    project: projectStatus ? { status: projectStatus, name: `Project ${id}`, workspaceId: "w1" } : null,
    depsOut: [],
  };
}

const PAUSED = ["ON_HOLD", "COMPLETED", "CANCELLED"];

/** Two live actions and one per paused status, all scheduled at `when`. */
function rowsAt(when: Date, prefix: string): Row[] {
  return [
    action(`${prefix}-active`, "ACTIVE", when),
    action(`${prefix}-loose`, null, when),
    ...PAUSED.map((s) => action(`${prefix}-${s.toLowerCase()}`, s, when)),
  ];
}

const context = { userId: "u1", workspaceId: "", runId: "run-1" };

beforeEach(() => {
  mockReset(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PMScheduler daily overdue check", () => {
  it("does not count a paused project's overdue actions", async () => {
    db.action.findMany.mockImplementation(serveFrom(rowsAt(daysFromToday(-2, 10), "overdue")));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await pmScheduler.runTask("daily-overdue-check");

    expect(log).toHaveBeenCalledWith("[PMScheduler] User u1 has 2 overdue actions");
  });
});

describe("standup summary steps", () => {
  it("planned actions for today leave out a paused project's actions", async () => {
    db.action.findMany.mockImplementation(serveFrom(rowsAt(daysFromToday(0, 11), "today")));

    const out = await new FetchPlannedActionsStep().execute({}, {}, context);

    const ids = (out.plannedActions as Array<{ id: string }>).map((a) => a.id).sort();
    expect(ids).toEqual(["today-active", "today-loose"]);
  });

  it("blockers and overdue leave out a paused project's actions", async () => {
    db.action.findMany.mockImplementation(serveFrom(rowsAt(daysFromToday(-2, 10), "overdue")));

    const out = await new FetchBlockersStep().execute({}, {}, context);

    expect(out.overdueCount).toBe(2);
    const ids = (out.blockers as Array<{ id: string }>).map((b) => b.id).sort();
    expect(ids).toEqual(["overdue-active", "overdue-loose"]);
  });

  it("scoped to a workspace, the steps still drop paused projects", async () => {
    db.action.findMany.mockImplementation(serveFrom(rowsAt(daysFromToday(0, 11), "today")));

    const out = await new FetchPlannedActionsStep().execute({}, {}, { ...context, workspaceId: "w1" });

    // Workspace scoping goes through the project, so project-less actions drop out too.
    const ids = (out.plannedActions as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toEqual(["today-active"]);
  });
});
