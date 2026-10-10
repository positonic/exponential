/**
 * `services/positions` — the one mapping from members to the Positions they
 * hold, and the remit-gap rule behind the settings warning (ADR-0068).
 */
import { describe, it, expect } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  hasRemitGap,
  loadPositionCoverage,
  loadPositionsByUser,
  planPositionImport,
  shouldOfferPositionImport,
} from "..";

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
    // One human plus a plain External agent is two members but one eligible:
    // nobody to route to, so no pill.
    { case: "one human and a plain agent", isPersonal: false, memberCount: 2, eligibleCount: 1, coveredCount: 0, expected: false },
    { case: "one human and an Assistant", isPersonal: false, memberCount: 2, eligibleCount: 2, coveredCount: 0, expected: true },
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

describe("planPositionImport", () => {
  const existing = [
    { id: "p-travel", title: "Travel researcher", notAccountableFor: null, holderUserIds: ["aria"] },
    { id: "p-delivery", title: "Delivery lead", notAccountableFor: "Budget", holderUserIds: [] },
  ];

  it("creates a new title with its holders, de-duplicated", () => {
    const plan = planPositionImport(existing, [
      { title: "  Technical Director ", remit: "Owns the architecture", holderUserIds: ["andi", "andi"] },
    ]);

    expect(plan).toEqual([
      {
        outcome: "create",
        title: "Technical Director",
        remit: "Owns the architecture",
        notAccountableFor: null,
        holderUserIds: ["andi"],
      },
    ]);
  });

  it("matches an existing title case-insensitively, keeps its stored title, replaces the prose and only adds holders", () => {
    const plan = planPositionImport(existing, [
      {
        title: "TRAVEL RESEARCHER",
        remit: "Shortlists hotels and flights",
        notAccountableFor: "Booking",
        // aria already holds it; andi is new. Nobody is removed.
        holderUserIds: ["andi", "aria"],
      },
    ]);

    expect(plan).toEqual([
      {
        outcome: "update",
        positionId: "p-travel",
        title: "Travel researcher",
        remit: "Shortlists hotels and flights",
        notAccountableFor: "Booking",
        holderUserIds: ["aria", "andi"],
        addedHolderUserIds: ["andi"],
      },
    ]);
  });

  it("an update with no holders keeps the existing ones and adds none", () => {
    const [row] = planPositionImport(existing, [{ title: "travel researcher", remit: "R", holderUserIds: [] }]);

    expect(row).toMatchObject({ outcome: "update", holderUserIds: ["aria"], addedHolderUserIds: [] });
  });

  it("an update that omits not-accountable-for keeps the stored value", () => {
    const [row] = planPositionImport(existing, [{ title: "Delivery lead", remit: "R", holderUserIds: [] }]);

    expect(row).toMatchObject({ outcome: "update", notAccountableFor: "Budget" });
  });

  it.each(["", "   "])("an update with not-accountable-for %j clears it", (notAccountableFor) => {
    const [row] = planPositionImport(existing, [
      { title: "Delivery lead", remit: "R", notAccountableFor, holderUserIds: [] },
    ]);

    expect(row).toMatchObject({ outcome: "update", notAccountableFor: null });
  });

  it("an update that states not-accountable-for replaces it", () => {
    const [row] = planPositionImport(existing, [
      { title: "Delivery lead", remit: "R", notAccountableFor: " Hiring ", holderUserIds: [] },
    ]);

    expect(row).toMatchObject({ outcome: "update", notAccountableFor: "Hiring" });
  });

  it("a create with no or blank not-accountable-for stores null", () => {
    const plan = planPositionImport(existing, [
      { title: "New one", remit: "R", holderUserIds: [] },
      { title: "Another", remit: "R", notAccountableFor: "  ", holderUserIds: [] },
    ]);

    expect(plan.map((row) => row.notAccountableFor)).toEqual([null, null]);
  });

  it("prefers the exact-case match when titles differ only by case, else the first in title order", () => {
    const cased = [
      { id: "p-lower", title: "travel", notAccountableFor: null, holderUserIds: [] },
      { id: "p-upper", title: "Travel", notAccountableFor: null, holderUserIds: [] },
    ];

    const [exact] = planPositionImport(cased, [{ title: "travel", remit: "R", holderUserIds: [] }]);
    const [folded] = planPositionImport(cased, [{ title: "TRAVEL", remit: "R", holderUserIds: [] }]);

    expect(exact).toMatchObject({ outcome: "update", positionId: "p-lower" });
    expect(folded).toMatchObject({ outcome: "update", positionId: [...cased].sort((a, b) => a.title.localeCompare(b.title))[0]!.id });
  });

  it("keeps input order across creates and updates", () => {
    const plan = planPositionImport(existing, [
      { title: "Zeta", remit: "R", holderUserIds: [] },
      { title: "delivery lead", remit: "R", holderUserIds: [] },
      { title: "Alpha", remit: "R", holderUserIds: [] },
    ]);

    expect(plan.map((row) => [row.title, row.outcome])).toEqual([
      ["Zeta", "create"],
      ["Delivery lead", "update"],
      ["Alpha", "create"],
    ]);
  });
});
