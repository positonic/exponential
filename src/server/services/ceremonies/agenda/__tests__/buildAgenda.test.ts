import { describe, expect, it } from "vitest";
import { buildAgenda } from "../buildAgenda";
import type { AgendaItem, AgendaSnapshot, AgendaTemplateSection } from "../types";

const template: AgendaTemplateSection[] = [
  { key: "okr", type: "okr_review", title: "OKRs", minutes: 10 },
  { key: "free", type: "free_text", title: "Anything else" },
];
const item = (id: string, sectionKey: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id,
  sectionKey,
  title: id,
  refType: "key_result",
  refId: id,
  order: 0,
  ...extra,
});
const now = new Date("2026-09-10T08:00:00Z");

describe("buildAgenda", () => {
  it("keeps template order and reports empty sections with a reason", () => {
    const snap = buildAgenda(
      template,
      [
        { section: template[1]!, items: [], emptyReason: 'No query for "free_text" yet' },
        { section: template[0]!, items: [item("kr-1", "okr"), item("kr-2", "okr", { order: 1 })] },
      ],
      null,
      now,
    );
    expect(snap.sections.map((s) => s.key)).toEqual(["okr", "free"]);
    expect(snap.sections[0]!.items.map((i) => i.id)).toEqual(["kr-1", "kr-2"]);
    expect(snap.sections[1]!.emptyReason).toBe('No query for "free_text" yet');
    expect(snap.generatedAt).toBe(now.toISOString());
  });

  it("preserves hand-added items, resolutions and explicit order across regeneration", () => {
    const previous: AgendaSnapshot = {
      version: 1,
      generatedAt: "2026-09-09T08:00:00Z",
      sections: [
        {
          key: "okr",
          type: "okr_review",
          title: "OKRs",
          items: [
            item("kr-1", "okr", { order: 1, resolvedAt: "2026-09-09T09:00:00Z" }),
            item("hand-1", "okr", { order: 0, refType: "text", addedByUserId: "u-1", title: "Talk about hiring" }),
            item("kr-gone", "okr", { order: 2 }),
          ],
        },
      ],
      narrative: "old narrative",
    };
    const snap = buildAgenda(template, [{ section: template[0]!, items: [item("kr-1", "okr"), item("kr-3", "okr", { order: 5 })] }], previous, now);
    const items = snap.sections[0]!.items;
    // Hand item first (order 0 kept), kr-1 keeps its resolution and order 1, kr-3 after; kr-gone (query item no longer returned) is dropped.
    expect(items.map((i) => i.id)).toEqual(["hand-1", "kr-1", "kr-3"]);
    expect(items[1]!.resolvedAt).toBe("2026-09-09T09:00:00Z");
    expect(items.map((i) => i.order)).toEqual([0, 1, 2]);
    expect(snap.narrative).toBe("old narrative");
  });

  it("keeps carried-over items that no query re-derives", () => {
    const previous: AgendaSnapshot = {
      version: 1,
      generatedAt: "x",
      sections: [{ key: "okr", type: "okr_review", title: "OKRs", items: [item("carried", "okr", { carriedFromOccurrenceId: "occ-0" })] }],
    };
    const snap = buildAgenda(template, [{ section: template[0]!, items: [] }], previous, now);
    expect(snap.sections[0]!.items.map((i) => i.id)).toEqual(["carried"]);
    expect(snap.sections[0]!.emptyReason).toBeNull();
  });
});
