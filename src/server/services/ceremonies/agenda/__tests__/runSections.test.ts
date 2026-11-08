import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { runAgendaSections } from "../runSections";
import type { AgendaTemplateSection, SectionContext } from "../types";

const now = new Date("2026-11-10T08:00:00Z");
const prevStart = new Date("2026-11-03T08:00:00Z");

function ctx(db: PrismaClient, previousAgenda: unknown): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", productId: null } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: { id: "occ-0", scheduledStart: prevStart, agenda: previousAgenda } as unknown as CeremonyOccurrence,
    participantUserIds: ["u-1"],
    projectIds: [],
    now,
    workspacePath: "/w/ws",
  };
}

describe("runAgendaSections", () => {
  it("runs carried_over last and leaves a record to the section that re-derived it", async () => {
    const db = mockDeep<PrismaClient>();
    db.decision.findMany.mockResolvedValue([
      { id: "d-150", number: 150, statement: "Ship CSV export?", status: "OPEN", owner: null, goal: null, keyResult: null, createdAt: prevStart },
    ] as never);
    const previous = {
      version: 1,
      generatedAt: "x",
      sections: [
        {
          key: "dec",
          type: "decisions_pending",
          title: "Decisions pending",
          items: [{ id: "dec:decision:d-150", sectionKey: "dec", title: "Ship CSV export?", refType: "decision", refId: "d-150", order: 0, carryCount: 3 }],
        },
        {
          key: "free",
          type: "free_text",
          title: "Risks",
          items: [{ id: "free:hand:1", sectionKey: "free", title: "Vendor risk", refType: "text", refId: "free:hand:1", order: 0, addedByUserId: "u-1" }],
        },
      ],
    };
    // carried_over first in the template: it must still see what decisions_pending produced.
    const template: AgendaTemplateSection[] = [
      { key: "carry", type: "carried_over", title: "Carried over" },
      { key: "dec", type: "decisions_pending", title: "Decisions pending" },
    ];
    const results = await runAgendaSections(ctx(db, previous), template);
    expect(results.map((r) => r.section.key)).toEqual(["carry", "dec"]);
    expect(results[1]!.items.map((i) => i.refId)).toEqual(["d-150"]);
    expect(results[0]!.items.map((i) => i.id)).toEqual(["carry:carried:text:free:hand:1"]);
  });

  it("reports a section type with no module as empty with a reason", async () => {
    const db = mockDeep<PrismaClient>();
    const results = await runAgendaSections(ctx(db, null), [{ key: "x", type: "nope", title: "X" }]);
    expect(results[0]).toMatchObject({ items: [], emptyReason: 'No query for "nope" yet' });
  });
});
