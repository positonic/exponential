/**
 * The Action dependency rules over a mocked Prisma client: no self-links, no
 * cycles, the set replace, and containment of blockers to readable actions
 * in the same workspace (ADR-0062).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  assertLinkableBlockers,
  setActionBlockers,
  wouldCreateActionCycle,
} from "../dependencies";

let db: DeepMockProxy<PrismaClient>;

/** Wire `actionDependency.findMany` to a static edge list: actionId → dependsOnIds. */
function graph(edges: Record<string, string[]>) {
  db.actionDependency.findMany.mockImplementation(((args: { where: { actionId: string } }) =>
    Promise.resolve((edges[args.where.actionId] ?? []).map((dependsOnId) => ({ dependsOnId })))) as never);
}

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
});

describe("wouldCreateActionCycle", () => {
  it("a self-link is a cycle", async () => {
    expect(await wouldCreateActionCycle(db, "a", "a")).toBe(true);
  });

  it("finds a transitive path back to the target", async () => {
    // b → c → a: adding a → b would close the loop.
    graph({ b: ["c"], c: ["a"] });
    expect(await wouldCreateActionCycle(db, "b", "a")).toBe(true);
  });

  it("returns false for a DAG and terminates on shared ancestors", async () => {
    graph({ b: ["c", "d"], c: ["e"], d: ["e"], e: [] });
    expect(await wouldCreateActionCycle(db, "b", "a")).toBe(false);
  });
});

describe("setActionBlockers", () => {
  it("refuses a self-dependency before touching the graph", async () => {
    await expect(setActionBlockers(db, "a", ["a"], "u1")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.actionDependency.findMany).not.toHaveBeenCalled();
  });

  it("removes edges no longer listed and adds the new ones with the actor", async () => {
    db.actionDependency.findMany
      .mockResolvedValueOnce([{ dependsOnId: "old" }, { dependsOnId: "keep" }] as never)
      // cycle-check BFS from "new" finds nothing
      .mockResolvedValue([] as never);
    expect(await setActionBlockers(db, "a", ["keep", "new", "new"], "u1")).toBe(true);
    expect(db.actionDependency.deleteMany).toHaveBeenCalledWith({
      where: { actionId: "a", dependsOnId: { in: ["old"] } },
    });
    expect(db.actionDependency.create).toHaveBeenCalledTimes(1);
    expect(db.actionDependency.create).toHaveBeenCalledWith({
      data: { actionId: "a", dependsOnId: "new", createdById: "u1" },
    });
  });

  it("refuses an edge that would create a cycle", async () => {
    // a currently has no blockers; b is blocked by a, so a ← b is a loop.
    db.actionDependency.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ dependsOnId: "a" }] as never);
    await expect(setActionBlockers(db, "a", ["b"], "u1")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This would create a dependency cycle.",
    });
    expect(db.actionDependency.create).not.toHaveBeenCalled();
  });
});

describe("setActionBlockers (unchanged)", () => {
  it("reports false when the list already matches", async () => {
    db.actionDependency.findMany.mockResolvedValueOnce([{ dependsOnId: "keep" }] as never);
    expect(await setActionBlockers(db, "a", ["keep"], "u1")).toBe(false);
    expect(db.actionDependency.deleteMany).not.toHaveBeenCalled();
    expect(db.actionDependency.create).not.toHaveBeenCalled();
  });
});

describe("assertLinkableBlockers", () => {
  it("passes when every id resolves inside the workspace", async () => {
    db.action.findMany.mockResolvedValue([{ id: "x" }, { id: "y" }] as never);
    await expect(assertLinkableBlockers(db, "u1", "w1", ["x", "y", "y"])).resolves.toBeUndefined();
    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where.id).toEqual({ in: ["x", "y"] });
    expect(where.AND).toMatchObject([{ OR: [{ workspaceId: "w1" }, { project: { workspaceId: "w1" } }] }, {}]);
  });

  it("falls back to the actor's own actions when there is no workspace", async () => {
    db.action.findMany.mockResolvedValue([{ id: "x" }] as never);
    await assertLinkableBlockers(db, "u1", null, ["x"]);
    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where.AND).toMatchObject([{ createdById: "u1" }, {}]);
  });

  it("is NOT_FOUND when any id is missing or unreadable", async () => {
    db.action.findMany.mockResolvedValue([{ id: "x" }] as never);
    const err = await assertLinkableBlockers(db, "u1", "w1", ["x", "hidden"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("NOT_FOUND");
  });

  it("is a no-op for an empty list", async () => {
    await assertLinkableBlockers(db, "u1", "w1", []);
    expect(db.action.findMany).not.toHaveBeenCalled();
  });
});
