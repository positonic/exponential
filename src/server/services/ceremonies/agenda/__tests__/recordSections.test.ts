import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { occurrenceActionsSection } from "../sections/occurrence_actions";
import { buildWorkspaceAudienceActionWhere } from "~/server/services/access/resolvers/actionResolver";
import { decisionsMadeSection } from "../sections/decisions_made";
import { buildWorkspaceAudienceDecisionWhere } from "~/server/services/access/resolvers/decisionResolver";
import type { SectionContext } from "../types";

const now = new Date("2026-11-17T10:00:00Z");
const prevStart = new Date("2026-11-10T10:00:00Z");
const previous = { id: "occ-0", scheduledStart: prevStart, agenda: null } as unknown as CeremonyOccurrence;

function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", productId: null } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: previous,
    participantUserIds: ["u-1", "u-2"],
    projectIds: [],
    now,
    workspacePath: "/w/clear",
    ...overrides,
  };
}

describe("occurrence_actions", () => {
  it("lists the previous occurrence's Actions with owner, due date and status, resolved from completedAt", async () => {
    const db = mockDeep<PrismaClient>();
    db.action.findMany.mockResolvedValue([
      { id: "a-1", name: "Respond to stakeholders", status: "COMPLETED", dueDate: new Date("2026-11-14T00:00:00Z"), completedAt: new Date("2026-11-13T09:00:00Z"), project: null, assignees: [{ user: { name: "Zineb" } }] },
      { id: "a-2", name: "Send the deck", status: "ACTIVE", dueDate: new Date("2026-11-12T00:00:00Z"), completedAt: null, project: null, assignees: [] },
      { id: "a-3", name: "Draft the memo", status: "ACTIVE", dueDate: null, completedAt: null, project: null, assignees: [{ user: { name: "Andi" } }] },
    ] as never);

    const items = await occurrenceActionsSection.run(ctx(db), { key: "status", type: "occurrence_actions", title: "Status on action points" });

    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ workspaceId: "ws-1", status: { notIn: ["DRAFT", "DELETED", "CANCELLED"] } });
    // No project: only the occurrence's own actions, never participants' personal ones.
    expect(where.OR).toEqual([{ occurrenceId: "occ-0" }]);
    expect(items.map((i) => [i.id, i.detail, i.resolvedAt])).toEqual([
      ["status:action:a-1", "Zineb · due 14 Nov · done", "2026-11-13T09:00:00.000Z"],
      ["status:action:a-2", "unassigned · due 12 Nov · overdue", null],
      ["status:action:a-3", "Andi · open", null],
    ]);
    expect(items[0]).toMatchObject({ refType: "action", refId: "a-1", href: "/w/clear/actions/a-1" });
  });

  it("inside the ceremony's projects, also lists participants' actions due since the previous occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    db.action.findMany.mockResolvedValue([] as never);
    await occurrenceActionsSection.run(ctx(db, { projectIds: ["prj-1"] }), { key: "status", type: "occurrence_actions", title: "S" });
    expect(db.action.findMany.mock.calls[0]![0]!.where!.OR).toEqual([
      { occurrenceId: "occ-0" },
      {
        ...buildWorkspaceAudienceActionWhere("ws-1"),
        projectId: { in: ["prj-1"] },
        assignees: { some: { userId: { in: ["u-1", "u-2"] } } },
        dueDate: { gte: prevStart, lte: now },
      },
    ]);
  });

  it("is empty with its own reason when there is no previous occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    expect(await occurrenceActionsSection.run(ctx(db, { previousOccurrence: null }), { key: "s", type: "occurrence_actions", title: "S" })).toEqual([]);
    expect(db.action.findMany).not.toHaveBeenCalled();
    expect(occurrenceActionsSection.emptyReason).toBe("No action points from the last occurrence.");
  });
});

describe("decisions_made", () => {
  it("lists confirmed Decisions accepted since the previous occurrence started, in scope", async () => {
    const db = mockDeep<PrismaClient>();
    db.decision.findMany.mockResolvedValue([
      { id: "d-160", number: 160, statement: "Drop the CSV export", decidedAt: new Date("2026-11-12T00:00:00Z"), owner: { name: "Zineb" }, goal: null, keyResult: null },
    ] as never);

    const items = await decisionsMadeSection.run(ctx(db, { ceremony: { id: "cer-1", workspaceId: "ws-1", productId: "prod-1" } as Ceremony }), {
      key: "made",
      type: "decisions_made",
      title: "Decisions made",
    });

    const where = db.decision.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ status: "ACCEPTED" });
    expect(where.AND).toEqual([
      // Audience-safe: only what every workspace member may read.
      buildWorkspaceAudienceDecisionWhere("ws-1"),
      { OR: [{ decidedAt: { gte: prevStart, lte: now } }, { decidedAt: null, updatedAt: { gte: prevStart, lte: now } }] },
      { OR: [{ productId: "prod-1" }, { productId: null }] },
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        id: "made:decision:d-160",
        refType: "decision",
        refId: "d-160",
        title: "Drop the CSV export",
        detail: "D-0160 · accepted · owner Zineb",
        href: "/w/clear/decisions/d/d-160",
      }),
    ]);
  });

  it("scopes to the ceremony's projects when it has some, and is empty without a previous occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    db.decision.findMany.mockResolvedValue([] as never);
    await decisionsMadeSection.run(ctx(db, { projectIds: ["prj-1"] }), { key: "m", type: "decisions_made", title: "M" });
    expect(db.decision.findMany.mock.calls[0]![0]!.where!.AND).toContainEqual({ projectId: { in: ["prj-1"] } });

    const db2 = mockDeep<PrismaClient>();
    expect(await decisionsMadeSection.run(ctx(db2, { previousOccurrence: null }), { key: "m", type: "decisions_made", title: "M" })).toEqual([]);
    expect(db2.decision.findMany).not.toHaveBeenCalled();
  });
});

describe("buildWorkspaceAudienceDecisionWhere", () => {
  it("admits only confirmed Decisions reachable through a workspace-wide path", () => {
    expect(buildWorkspaceAudienceDecisionWhere("ws-1")).toEqual({
      workspaceId: "ws-1",
      reviewState: "CONFIRMED",
      OR: [
        { transcriptionSessionId: null, projectId: null },
        { transcriptionSessionId: null, project: { OR: [{ isRestricted: false }, { isPublic: true }] } },
        {
          transcriptionSessionId: { not: null },
          transcriptionSession: { OR: [{ projectId: null, workspaceId: "ws-1" }, { project: { OR: [{ isRestricted: false }, { isPublic: true }] } }] },
        },
      ],
    });
  });
});
