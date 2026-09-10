import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { cycleProgressSection } from "../sections/cycle_progress";
import { retroActionsSection } from "../sections/retro_actions";
import { freeTextSection } from "../sections/free_text";
import { decisionsPendingSection } from "../sections/decisions_pending";
import type { SectionContext } from "../types";

const now = new Date("2026-09-10T08:00:00Z");
const prevStart = new Date("2026-09-03T08:00:00Z");
function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: null, productId: "prod-1" } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: { id: "occ-0", scheduledStart: prevStart, agenda: null } as CeremonyOccurrence,
    participantUserIds: [],
    now,
    workspacePath: "/w/ws",
    ...overrides,
  };
}

describe("cycle_progress", () => {
  it("reads the product's active cycle, its latest snapshot and tickets moved since the previous occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    db.list.findMany.mockResolvedValue([
      { id: "cyc-14", name: "Cycle 14", slug: "cycle-14", endDate: new Date("2026-09-17T00:00:00Z"), product: { slug: "clear" }, snapshots: [{ backlogCount: 2, todoCount: 3, inProgressCount: 4, inReviewCount: 1, doneCount: 5, addedEffort: 3 }], _count: { tickets: 15 } },
    ] as never);
    db.ticket.count.mockResolvedValue(7);
    const items = await cycleProgressSection.run(ctx(db), { key: "cyc", type: "cycle_progress", title: "Cycle" });
    const where = db.list.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ workspaceId: "ws-1", listType: "SPRINT", status: "ACTIVE", productId: "prod-1" });
    expect(db.ticket.count).toHaveBeenCalledWith({ where: { cycleId: "cyc-14", updatedAt: { gt: prevStart } } });
    expect(items[0]).toMatchObject({ id: "cyc:cycle:cyc-14", refType: "cycle", title: "Cycle 14", href: "/w/ws/products/clear/cycles" });
    expect(items[0]!.detail).toBe("5/15 done, 4 in progress · +3 effort added mid-cycle · 7 tickets moved since last time · ends 17 Sept");
  });
});

describe("retro_actions", () => {
  it("lists actions from the recordings of the last retrospective occurrence, resolved when completed", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "retro-1", scheduledStart: new Date("2026-08-27T13:00:00Z") } as never);
    db.action.findMany.mockResolvedValue([
      { id: "a-1", name: "Write the runbook", status: "ACTIVE", dueDate: null, completedAt: null, project: null, assignees: [{ user: { name: "Andi" } }] },
      { id: "a-2", name: "Shorten standup", status: "COMPLETED", dueDate: null, completedAt: new Date("2026-09-01T00:00:00Z"), project: { goals: [] }, assignees: [] },
    ] as never);
    const items = await retroActionsSection.run(ctx(db), { key: "retro", type: "retro_actions", title: "Retro" });
    const where = db.ceremonyOccurrence.findFirst.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ workspaceId: "ws-1", ceremony: { kind: "RETROSPECTIVE" }, id: { not: "occ-1" } });
    expect(db.action.findMany.mock.calls[0]![0]!.where).toMatchObject({ transcriptionSession: { occurrenceId: "retro-1" } });
    expect(items.map((i) => [i.refId, i.resolvedAt !== null])).toEqual([["a-1", false], ["a-2", true]]);
    expect(items[0]!.detail).toBe("from the retro on 27 Aug · active · Andi");
  });

  it("is empty when no retrospective has happened", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null);
    expect(await retroActionsSection.run(ctx(db), { key: "r", type: "retro_actions", title: "R" })).toEqual([]);
  });
});

describe("free_text", () => {
  it("turns config.items strings into text items and ignores junk", async () => {
    const db = mockDeep<PrismaClient>();
    const items = await freeTextSection.run(ctx(db), { key: "free", type: "free_text", title: "Else", config: { items: ["Hiring update", "  ", 42, "Offsite dates"] } });
    expect(items.map((i) => [i.id, i.title, i.refType])).toEqual([["free:text:0", "Hiring update", "text"], ["free:text:1", "Offsite dates", "text"]]);
    expect(await freeTextSection.run(ctx(db), { key: "free", type: "free_text", title: "Else" })).toEqual([]);
  });
});

describe("decisions_pending", () => {
  it("lists confirmed OPEN/PROPOSED decisions in scope, oldest first, with labels and carry counts", async () => {
    const db = mockDeep<PrismaClient>();
    db.decision.findMany.mockResolvedValue([
      { id: "d-1", number: 3, statement: "Which vendor?", status: "OPEN", createdAt: new Date("2026-08-01"), owner: { name: "Zineb" }, goal: null, keyResult: { id: "kr-1", title: "100 customers", goalId: 4, goal: { title: "Grow" } } },
      { id: "d-2", number: 7, statement: "Adopt tRPC", status: "PROPOSED", createdAt: new Date("2026-09-01"), owner: null, goal: null, keyResult: null },
    ] as never);
    const previous = { id: "occ-0", scheduledStart: prevStart, agenda: { version: 1, generatedAt: "x", sections: [{ key: "dec", type: "decisions_pending", title: "D", items: [{ id: "dec:decision:d-1", sectionKey: "dec", title: "Which vendor?", refType: "decision", refId: "d-1", order: 0, detail: "D-0003 · open question · carried 1 time" }] }] } } as unknown as CeremonyOccurrence;
    const items = await decisionsPendingSection.run(ctx(db, { previousOccurrence: previous }), { key: "dec", type: "decisions_pending", title: "Decisions" });
    const where = db.decision.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ workspaceId: "ws-1", reviewState: "CONFIRMED", status: { in: ["OPEN", "PROPOSED"] } });
    expect(where.OR).toEqual([{ productId: "prod-1" }, { productId: null }]);
    expect(items[0]).toMatchObject({ id: "dec:decision:d-1", href: "/w/ws/decisions/d/d-1", detail: "D-0003 · open question · owner Zineb · carried 2 times" });
    expect(items[1]!.detail).toBe("D-0007 · proposed");
    expect(items[0]).toMatchObject({ goalId: 4, goalTitle: "Grow", keyResultId: "kr-1", keyResultTitle: "100 customers" });
    expect(items[1]).toMatchObject({ goalId: null, keyResultId: null });
  });
});
