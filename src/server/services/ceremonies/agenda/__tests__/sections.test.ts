import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { blockersSection } from "../sections/blockers";
import { carriedOverSection } from "../sections/carried_over";
import { getSectionModule } from "../sections";
import type { SectionContext } from "../types";

const now = new Date("2026-09-10T08:00:00Z");
function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: null, productId: null } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: null,
    participantUserIds: ["u-1", "u-2"],
    now,
    workspacePath: "/w/ws",
    ...overrides,
  };
}

describe("section registry", () => {
  it("knows okr_review, blockers and carried_over", () => {
    expect(["okr_review", "blockers", "carried_over"].map((t) => getSectionModule(t)?.type)).toEqual(["okr_review", "blockers", "carried_over"]);
    expect(getSectionModule("free_text")).toBeUndefined();
  });
});

describe("blockers section", () => {
  it("queries participants' active overdue or blocked actions in the workspace (and project) and links them", async () => {
    const db = mockDeep<PrismaClient>();
    db.action.findMany.mockResolvedValue([
      { id: "a-1", name: "Fix login", dueDate: new Date("2026-09-08T00:00:00Z"), blockedByIds: [], projectId: "p-1", assignees: [{ user: { id: "u-1", name: "Andi" } }] },
      { id: "a-2", name: "Ship drawer", dueDate: null, blockedByIds: ["a-9"], projectId: "p-1", assignees: [] },
    ] as never);
    const items = await blockersSection.run(ctx(db, { ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: "p-1", productId: null } as Ceremony }), { key: "blk", type: "blockers", title: "Blockers" });
    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ status: "ACTIVE", workspaceId: "ws-1", projectId: "p-1" });
    expect(where.OR).toEqual([{ dueDate: { lt: now } }, { blockedByIds: { isEmpty: false } }]);
    expect(items.map((i) => i.id)).toEqual(["blk:action:a-1", "blk:action:a-2"]);
    expect(items[0]!.detail).toBe("due 8 Sept · Andi");
    expect(items[1]!.detail).toBe("blocked by 1 action · unassigned");
    expect(items[0]!.href).toBe("/w/ws/actions/a-1");
  });
});

describe("carried_over section", () => {
  it("copies the previous occurrence's unresolved items with carriedFromOccurrenceId, skipping resolved ones", async () => {
    const db = mockDeep<PrismaClient>();
    const previous = {
      id: "occ-0",
      scheduledStart: new Date("2026-09-09T08:00:00Z"),
      agenda: {
        version: 1,
        generatedAt: "x",
        sections: [
          { key: "blk", type: "blockers", title: "Blockers", items: [
            { id: "blk:action:a-1", sectionKey: "blk", title: "Fix login", refType: "action", refId: "a-1", order: 0, detail: "due 8 Sept" },
            { id: "blk:action:a-2", sectionKey: "blk", title: "Done one", refType: "action", refId: "a-2", order: 1, resolvedAt: "2026-09-09T09:00:00Z" },
          ] },
          { key: "carry", type: "carried_over", title: "Carried over", items: [
            { id: "carry:carried:key_result:kr-1", sectionKey: "carry", title: "KR", refType: "key_result", refId: "kr-1", order: 0, carriedFromOccurrenceId: "occ--1" },
          ] },
        ],
      },
    } as unknown as CeremonyOccurrence;
    const items = await carriedOverSection.run(ctx(db, { previousOccurrence: previous }), { key: "carry", type: "carried_over", title: "Carried over" });
    expect(items.map((i) => i.id)).toEqual(["carry:carried:action:a-1", "carry:carried:key_result:kr-1"]);
    expect(items[0]).toMatchObject({ sectionKey: "carry", carriedFromOccurrenceId: "occ-0", resolvedAt: null, detail: "due 8 Sept · from Blockers" });
    expect(items[1]!.detail).toBe("carried again");
  });

  it("is empty without a previous agenda", async () => {
    const db = mockDeep<PrismaClient>();
    expect(await carriedOverSection.run(ctx(db), { key: "c", type: "carried_over", title: "C" })).toEqual([]);
  });
});
