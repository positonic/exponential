/**
 * Unit tests for the inbox's "Waiting on me" aggregation. Mocked Prisma —
 * no real DB.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { buildDecisionAccessWhereAcrossWorkspaces } from "~/server/services/access";
import { myOverdueActionsWhere } from "~/server/services/actions/myActionsWhere";
import {
  countWaitingOnMe,
  decisionsAwaitingMeWhere,
  listWaitingOnMe,
  meetingsWithDraftsToReviewWhere,
  qaTicketsWaitingOnMeWhere,
} from "../waitingOnMe";

const USER = "u1";
const TODAY = new Date(2026, 8, 30);

describe("waiting-on-me WHERE builders", () => {
  it("decisions: readable, undecided, and mine as owner or decider", () => {
    expect(decisionsAwaitingMeWhere(USER)).toEqual({
      AND: [
        buildDecisionAccessWhereAcrossWorkspaces(USER),
        { status: { in: ["OPEN", "PROPOSED"] } },
        { OR: [{ ownerId: USER }, { deciders: { some: { userId: USER } } }] },
      ],
    });
  });

  it("drafts: meetings I own with at least one draft decision", () => {
    expect(meetingsWithDraftsToReviewWhere(USER)).toEqual({
      userId: USER,
      decisions: { some: { reviewState: "DRAFT" } },
    });
  });

  it("QA tickets: assigned to me, or mine and unassigned, in workspaces I belong to", () => {
    const where = qaTicketsWaitingOnMeWhere(USER);
    expect(where.status).toBe("QA");
    expect(where.OR).toEqual([
      { assigneeId: USER },
      { assigneeId: null, createdById: USER },
    ]);
    expect(where.product).toHaveProperty("workspace.OR");
  });
});

describe("buildDecisionAccessWhereAcrossWorkspaces", () => {
  it("keeps the resolver's rules but drops the single-workspace scope", () => {
    const where = buildDecisionAccessWhereAcrossWorkspaces(USER);
    expect(where).not.toHaveProperty("workspaceId");
    expect(where.reviewState).toBe("CONFIRMED");
    expect(where.OR).toHaveLength(3);
  });
});

describe("countWaitingOnMe", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("counts each kind with its builder and sums the total", async () => {
    db.decision.count.mockResolvedValue(2);
    db.transcriptionSession.count.mockResolvedValue(1);
    db.ticket.count.mockResolvedValue(3);
    db.action.count.mockResolvedValue(4);

    const counts = await countWaitingOnMe(db, USER, TODAY);

    expect(counts).toEqual({
      decisions: 2,
      draftReviews: 1,
      qaTickets: 3,
      overdueActions: 4,
      total: 10,
    });
    expect(db.action.count).toHaveBeenCalledWith({
      where: myOverdueActionsWhere(USER, TODAY),
    });
  });
});

describe("listWaitingOnMe", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.decision.count.mockResolvedValue(0);
    db.transcriptionSession.count.mockResolvedValue(0);
    db.ticket.count.mockResolvedValue(0);
    db.action.count.mockResolvedValue(0);
    db.decision.findMany.mockResolvedValue([] as never);
    db.transcriptionSession.findMany.mockResolvedValue([] as never);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.action.findMany.mockResolvedValue([] as never);
    db.gitHubActivity.findMany.mockResolvedValue([] as never);
  });

  it("labels decisions and marks the ones I own", async () => {
    const ws = { slug: "acme", name: "Acme" };
    db.decision.findMany.mockResolvedValue([
      { id: "d1", number: 7, statement: "Pick a DB", status: "PROPOSED", ownerId: USER, createdAt: TODAY, workspace: ws },
      { id: "d2", number: 12, statement: "Ship Friday?", status: "OPEN", ownerId: "u2", createdAt: TODAY, workspace: ws },
    ] as never);

    const { decisions } = await listWaitingOnMe(db, USER, TODAY);

    expect(decisions.map((d) => [d.label, d.isOwner])).toEqual([
      ["D-0007", true],
      ["D-0012", false],
    ]);
    expect(decisions[0]).not.toHaveProperty("ownerId");
  });

  it("reports each meeting's draft count", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "m1", title: "Standup", createdAt: TODAY, workspace: null, _count: { decisions: 3 } },
    ] as never);

    const { draftReviews } = await listWaitingOnMe(db, USER, TODAY);

    expect(draftReviews).toEqual([
      { id: "m1", title: "Standup", createdAt: TODAY, workspace: null, draftCount: 3 },
    ]);
  });

  it("flags a merged PR only when the webhook row is in the ticket's own workspace", async () => {
    const product = (workspaceId: string) => ({
      slug: "app",
      name: "App",
      funTicketIds: false,
      workspaceId,
      workspace: { slug: workspaceId, name: workspaceId },
    });
    db.ticket.findMany.mockResolvedValue([
      { id: "t1", shortId: null, number: 1, title: "A", prUrl: "https://gh/pr/1", updatedAt: TODAY, product: product("ws-a") },
      { id: "t2", shortId: null, number: 2, title: "B", prUrl: "https://gh/pr/1", updatedAt: TODAY, product: product("ws-b") },
      { id: "t3", shortId: null, number: 3, title: "C", prUrl: null, updatedAt: TODAY, product: product("ws-a") },
    ] as never);
    db.gitHubActivity.findMany.mockResolvedValue([
      { workspaceId: "ws-a", prUrl: "https://gh/pr/1" },
    ] as never);

    const { qaTickets } = await listWaitingOnMe(db, USER, TODAY);

    expect(qaTickets.map((t) => [t.id, t.prMerged])).toEqual([
      ["t1", true],
      ["t2", false],
      ["t3", false],
    ]);
    expect(qaTickets[0]!.workspace).toEqual({ slug: "ws-a", name: "ws-a" });
    expect(qaTickets[0]).not.toHaveProperty("prUrl");
  });

  it("skips the GitHub lookup when no ticket has a PR", async () => {
    await listWaitingOnMe(db, USER, TODAY);
    expect(db.gitHubActivity.findMany).not.toHaveBeenCalled();
  });

  it("orders overdue actions like /today and falls back to the project's workspace", async () => {
    const base = { status: "ACTIVE", scheduledStart: null, projectId: null, project: null, workspace: null };
    db.action.findMany.mockResolvedValue([
      { ...base, id: "old", name: "Old", priority: "Quick", dueDate: new Date(2026, 8, 1) },
      { ...base, id: "urgent", name: "Urgent", priority: "1st Priority", dueDate: new Date(2026, 8, 29) },
      {
        ...base,
        id: "proj",
        name: "In project",
        priority: "Quick",
        dueDate: new Date(2026, 8, 20),
        projectId: "p1",
        project: { name: "Launch", workspace: { slug: "acme", name: "Acme" } },
      },
    ] as never);

    const { overdueActions } = await listWaitingOnMe(db, USER, TODAY);

    expect(overdueActions.map((a) => a.id)).toEqual(["urgent", "old", "proj"]);
    expect(overdueActions[2]).toMatchObject({
      projectName: "Launch",
      workspace: { slug: "acme", name: "Acme" },
    });
    expect(overdueActions[0]!.workspace).toBeNull();
  });
});
