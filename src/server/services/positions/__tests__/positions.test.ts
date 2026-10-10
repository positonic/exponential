/**
 * `services/positions` — the one mapping from members to the Positions they
 * hold, and the remit-gap rule behind the settings warning (ADR-0068).
 */
import { describe, it, expect } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { hasRemitGap, loadPositionsByUser } from "..";

describe("hasRemitGap", () => {
  it.each([
    // A human needs a Position.
    { isAgent: false, positionCount: 0, agentDescription: null, expected: true },
    { isAgent: false, positionCount: 1, agentDescription: null, expected: false },
    // A human's description (there is none) never counts.
    { isAgent: false, positionCount: 0, agentDescription: "x", expected: true },
    // An agent falls back on its description.
    { isAgent: true, positionCount: 0, agentDescription: null, expected: true },
    { isAgent: true, positionCount: 0, agentDescription: "   ", expected: true },
    { isAgent: true, positionCount: 0, agentDescription: "Books travel", expected: false },
    { isAgent: true, positionCount: 2, agentDescription: null, expected: false },
  ])(
    "isAgent=$isAgent positions=$positionCount description=$agentDescription → $expected",
    ({ expected, ...member }) => {
      expect(hasRemitGap(member)).toBe(expected);
    },
  );
});

describe("loadPositionsByUser", () => {
  const summary = (id: string, title: string) => ({ id, title, remit: `${title} remit`, notAccountableFor: null });

  it("runs no query when there is nobody to look up", async () => {
    const db = mockDeep<PrismaClient>();

    const byUser = await loadPositionsByUser(db, "ws-1", []);

    expect(byUser.size).toBe(0);
    expect(db.positionHolder.findMany).not.toHaveBeenCalled();
  });

  it("groups holdings by userId, scoped to the one workspace, in title order", async () => {
    const db = mockDeep<PrismaClient>();
    db.positionHolder.findMany.mockResolvedValue([
      { workspaceUser: { userId: "u1" }, position: summary("p1", "Delivery lead") },
      { workspaceUser: { userId: "u2" }, position: summary("p2", "Technical Director") },
      { workspaceUser: { userId: "u1" }, position: summary("p3", "Travel researcher") },
    ] as never);

    const byUser = await loadPositionsByUser(db, "ws-1", ["u1", "u2", "u1", "u3"]);

    expect(db.positionHolder.findMany).toHaveBeenCalledTimes(1);
    expect(db.positionHolder.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        position: { workspaceId: "ws-1" },
        workspaceUser: { userId: { in: ["u1", "u2", "u3"] } },
      },
      orderBy: { position: { title: "asc" } },
    });
    expect(byUser.get("u1")?.map((p) => p.title)).toEqual(["Delivery lead", "Travel researcher"]);
    expect(byUser.get("u2")?.map((p) => p.title)).toEqual(["Technical Director"]);
    // Holding nothing means absent, so callers default to [].
    expect(byUser.has("u3")).toBe(false);
  });
});
