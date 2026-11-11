import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { enrichAgendaLive } from "../live";
import type { AgendaSnapshot } from "../types";

const agenda: AgendaSnapshot = {
  version: 1,
  generatedAt: "x",
  sections: [
    {
      key: "s",
      type: "free_text",
      title: "S",
      items: [
        { id: "s:hand:1", sectionKey: "s", title: "Respond", refType: "action", refId: "act-1", order: 0, addedByUserId: "u-1" },
        { id: "s:decision:d-1", sectionKey: "s", title: "Vendor?", refType: "decision", refId: "d-1", order: 1 },
        { id: "s:hand:2", sectionKey: "s", title: "A note", refType: "text", refId: "s:hand:2", order: 2, addedByUserId: "u-1" },
      ],
    },
  ],
};

describe("enrichAgendaLive", () => {
  it("attaches each referenced record's current state in one query per type, scoped to the viewer", async () => {
    const db = mockDeep<PrismaClient>();
    db.action.findMany.mockResolvedValue([
      {
        id: "act-1",
        status: "COMPLETED",
        completedAt: new Date("2026-11-09T10:00:00Z"),
        dueDate: new Date("2026-11-14T00:00:00Z"),
        assignees: [{ user: { id: "u-z", name: "Zineb", image: null } }],
      },
    ] as never);
    db.decision.findMany.mockResolvedValue([{ id: "d-1", status: "OPEN", number: 150 }] as never);

    const res = await enrichAgendaLive(db, agenda, { workspaceId: "ws-1", userId: "u-1" });

    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ id: { in: ["act-1"] }, workspaceId: "ws-1" });
    expect(where.AND).toBeDefined();
    // Decisions too are viewer-scoped (meeting, project or workspace access).
    expect(db.decision.findMany.mock.calls[0]![0]!.where).toMatchObject({ AND: [expect.objectContaining({ workspaceId: "ws-1", reviewState: "CONFIRMED" })] });
    const [a, d, note] = res.sections[0]!.items;
    expect(a!.live).toEqual({
      kind: "action",
      status: "COMPLETED",
      completedAt: "2026-11-09T10:00:00.000Z",
      dueDate: "2026-11-14T00:00:00.000Z",
      assignees: [{ id: "u-z", name: "Zineb", image: null }],
    });
    expect(d!.live).toEqual({ kind: "decision", status: "OPEN", number: 150 });
    expect(note!.live).toBeUndefined();
    // The stored snapshot is not mutated.
    expect(agenda.sections[0]!.items[0]!.live).toBeUndefined();
  });

  it("queries nothing when no item references a record", async () => {
    const db = mockDeep<PrismaClient>();
    const plain: AgendaSnapshot = { ...agenda, sections: [{ ...agenda.sections[0]!, items: [agenda.sections[0]!.items[2]!] }] };
    expect(await enrichAgendaLive(db, plain, { workspaceId: "ws-1", userId: "u-1" })).toBe(plain);
    expect(db.action.findMany).not.toHaveBeenCalled();
  });
});
