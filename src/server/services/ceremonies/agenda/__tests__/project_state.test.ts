import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { projectStateSection } from "../sections/project_state";
import type { SectionContext } from "../types";

const now = new Date("2026-09-10T08:00:00Z");
const prevStart = new Date("2026-09-03T08:00:00Z");
const section = { key: "state", type: "project_state", title: "Where the project stands" };

function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: "p-1", productId: null } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: { id: "occ-0", scheduledStart: prevStart } as CeremonyOccurrence,
    participantUserIds: [],
    now,
    workspacePath: "/w/ws",
    ...overrides,
  };
}

describe("project_state section", () => {
  it("fails closed without a project", async () => {
    const db = mockDeep<PrismaClient>();
    const items = await projectStateSection.run(
      ctx(db, { ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: null, productId: null } as Ceremony }),
      section,
    );
    expect(items).toEqual([]);
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("opens with a status line, then movement since the previous occurrence, then upcoming dates", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ scheduledStart: new Date("2026-09-17T08:00:00Z") } as never);
    db.project.findUnique.mockResolvedValue({
      id: "p-1",
      name: "Grant applications",
      slug: "grant-applications",
      status: "ACTIVE",
      priority: "HIGH",
      progress: 42.4,
      endDate: new Date("2026-10-15T00:00:00Z"),
      reviewDate: new Date("2026-09-12T00:00:00Z"),
      nextActionDate: new Date("2026-11-01T00:00:00Z"),
      goals: [
        { id: 1, title: "Secure funding", health: "on-track", healthOverride: null },
        { id: 2, title: "Hire two engineers", health: "on-track", healthOverride: "at-risk" },
      ],
    } as never);
    db.action.findMany
      .mockResolvedValueOnce([
        { id: "a-1", name: "Draft budget", completedAt: new Date("2026-09-05T00:00:00Z") },
        { id: "a-2", name: "Collect letters", completedAt: new Date("2026-09-06T00:00:00Z") },
      ] as never)
      .mockResolvedValueOnce([{ id: "a-3", name: "Submit form B", dueDate: new Date("2026-09-08T00:00:00Z") }] as never);
    db.projectActivity.findMany.mockResolvedValue([] as never);

    const items = await projectStateSection.run(ctx(db), section);

    expect(items.map((i) => i.id)).toEqual([
      "state:text:project-p-1",
      "state:text:completed",
      "state:action:a-3",
      "state:goal:2",
      "state:text:review-date",
    ]);
    expect(items[0]).toMatchObject({
      title: "Grant applications",
      detail: "Active · high priority · 42% complete · due 15 Oct",
      href: "/w/ws/projects/grant-applications-p-1",
    });
    expect(items[1]).toMatchObject({ title: "2 actions completed since 3 Sept", detail: "Draft budget, Collect letters" });
    expect(items[2]).toMatchObject({ refType: "action", detail: "fell overdue · due 8 Sept", href: "/w/ws/actions/a-3" });
    expect(items[3]).toMatchObject({ refType: "goal", goalId: 2, detail: "objective at risk" });
    expect(items[4]).toMatchObject({ title: "Review date lands 12 Sept" });
    // Next action date is after the following occurrence, so it is not raised yet.
    expect(items.some((i) => i.refId === "Next action date")).toBe(false);

    const [completedCall, overdueCall] = db.action.findMany.mock.calls;
    expect(completedCall![0]!.where).toMatchObject({ projectId: "p-1", status: "COMPLETED", completedAt: { gte: prevStart, lte: now } });
    expect(overdueCall![0]!.where).toMatchObject({ projectId: "p-1", status: "ACTIVE", dueDate: { gte: prevStart, lt: now } });
    expect(items.map((i) => i.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("raises what else shifted from the activity log, one line per action, skipping ones already raised", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null);
    db.project.findUnique.mockResolvedValue({
      id: "p-1", name: "P", slug: "p", status: "ACTIVE", priority: "NONE", progress: 10,
      endDate: null, reviewDate: null, nextActionDate: null, goals: [],
    } as never);
    db.action.findMany
      .mockResolvedValueOnce([{ id: "a-done", name: "Done thing", completedAt: now }] as never)
      .mockResolvedValueOnce([] as never);
    db.projectActivity.findMany.mockResolvedValue([
      // newest first: the reschedule wins for a-1, the earlier status move is folded away
      { id: "ev-1", actionId: "a-1", type: "DUE_DATE_CHANGED", fromValue: "2026-09-12T00:00:00Z", toValue: "2026-09-19T00:00:00Z", action: { name: "Draft budget" }, changedBy: { name: "Andi" } },
      { id: "ev-2", actionId: "a-1", type: "STATUS_CHANGED", fromValue: "TODO", toValue: "IN_PROGRESS", action: { name: "Draft budget" }, changedBy: { name: "Andi" } },
      { id: "ev-3", actionId: "a-done", type: "STATUS_CHANGED", fromValue: "ACTIVE", toValue: "COMPLETED", action: { name: "Done thing" }, changedBy: null },
      { id: "ev-4", actionId: null, type: "ACTION_DELETED", fromValue: "Old idea", toValue: null, action: null, changedBy: { name: "Sam" } },
      { id: "ev-5", actionId: "a-2", type: "ACTION_CREATED", fromValue: null, toValue: "New task", action: { name: "New task" }, changedBy: null },
    ] as never);

    const items = await projectStateSection.run(ctx(db), section);

    expect(items.map((i) => i.id)).toEqual([
      "state:text:project-p-1",
      "state:text:completed",
      "state:shift:a-1",
      "state:shift:ev-4",
      "state:shift:a-2",
    ]);
    expect(items[2]).toMatchObject({ refType: "action", title: "Draft budget", detail: "rescheduled 12 Sept → 19 Sept · Andi", href: "/w/ws/actions/a-1" });
    expect(items[3]).toMatchObject({ refType: "text", title: "Old idea", detail: "deleted · Sam", href: null });
    expect(items[4]).toMatchObject({ refType: "action", title: "New task", detail: "created" });
    const where = db.projectActivity.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ projectId: "p-1", changedAt: { gte: prevStart, lte: now } });
    expect((where.type as { in: string[] }).in).not.toContain("ASSIGNEE_CHANGED");
  });

  it("looks back seven days when there is no previous occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null);
    db.project.findUnique.mockResolvedValue({
      id: "p-1", name: "P", slug: "p", status: "ON_HOLD", priority: "NONE", progress: 0,
      endDate: null, reviewDate: null, nextActionDate: null, goals: [],
    } as never);
    db.action.findMany.mockResolvedValue([] as never);
    db.projectActivity.findMany.mockResolvedValue([] as never);

    const items = await projectStateSection.run(ctx(db, { previousOccurrence: null }), section);

    expect(items).toHaveLength(1);
    expect(items[0]!.detail).toBe("On hold · 0% complete");
    const since = db.action.findMany.mock.calls[0]![0]!.where!.completedAt as { gte: Date };
    expect(since.gte).toEqual(new Date("2026-09-03T08:00:00Z"));
  });
});
