/**
 * `services/positions` — the one mapping from members to the Positions they
 * hold, and the remit-gap rule behind the settings warning (ADR-0068).
 */
import { describe, it, expect } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { hasRemitGap, loadPositionCoverage, loadPositionsByUser, shouldOfferPositionImport } from "..";

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

describe("shouldOfferPositionImport", () => {
  it.each([
    { case: "team, nobody covered", isPersonal: false, memberCount: 3, eligibleCount: 3, coveredCount: 0, expected: true },
    { case: "team, under half covered", isPersonal: false, memberCount: 4, eligibleCount: 4, coveredCount: 1, expected: true },
    { case: "team, exactly half covered", isPersonal: false, memberCount: 4, eligibleCount: 4, coveredCount: 2, expected: false },
    { case: "team, over half covered", isPersonal: false, memberCount: 3, eligibleCount: 3, coveredCount: 2, expected: false },
    { case: "team of one", isPersonal: false, memberCount: 1, eligibleCount: 1, coveredCount: 0, expected: false },
    { case: "personal workspace", isPersonal: true, memberCount: 3, eligibleCount: 3, coveredCount: 0, expected: false },
    // Plain External agents count as members but not in the ratio: two humans,
    // one covered, plus three uncovered plain agents → exactly half, no pill.
    { case: "plain External agents excluded from the ratio", isPersonal: false, memberCount: 5, eligibleCount: 2, coveredCount: 1, expected: false },
    // One human plus a plain External agent is two members but one eligible.
    { case: "one human and a plain agent", isPersonal: false, memberCount: 2, eligibleCount: 1, coveredCount: 0, expected: true },
  ])("$case → $expected", ({ expected, case: _case, ...coverage }) => {
    expect(shouldOfferPositionImport(coverage)).toBe(expected);
  });
});

describe("loadPositionCoverage", () => {
  const human = (covered: boolean) => ({
    user: { isAgent: false, externalAgentShadow: null },
    positionHolders: covered ? [{ positionId: "p1" }] : [],
  });
  const assistant = (covered: boolean) => ({
    user: { isAgent: true, externalAgentShadow: { assistant: { id: "a1" } } },
    positionHolders: covered ? [{ positionId: "p1" }] : [],
  });
  const plainAgent = (covered: boolean) => ({
    user: { isAgent: true, externalAgentShadow: { assistant: null } },
    positionHolders: covered ? [{ positionId: "p1" }] : [],
  });

  it("counts every member, but only humans and Assistants as eligible", async () => {
    const db = mockDeep<PrismaClient>();
    db.workspace.findUnique.mockResolvedValue({ type: "team" } as never);
    db.workspaceUser.findMany.mockResolvedValue([
      human(true),
      human(false),
      assistant(true),
      assistant(false),
      plainAgent(true),
      plainAgent(false),
    ] as never);

    const coverage = await loadPositionCoverage(db, "ws-1");

    expect(coverage).toEqual({ isPersonal: false, memberCount: 6, eligibleCount: 4, coveredCount: 2 });
    // Holdings are scoped to this workspace's Positions.
    expect(db.workspaceUser.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { workspaceId: "ws-1" },
      select: { positionHolders: { where: { position: { workspaceId: "ws-1" } } } },
    });
  });

  it("flags a personal workspace", async () => {
    const db = mockDeep<PrismaClient>();
    db.workspace.findUnique.mockResolvedValue({ type: "personal" } as never);
    db.workspaceUser.findMany.mockResolvedValue([human(false)] as never);

    const coverage = await loadPositionCoverage(db, "ws-1");

    expect(coverage).toEqual({ isPersonal: true, memberCount: 1, eligibleCount: 1, coveredCount: 0 });
  });
});
