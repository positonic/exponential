import { describe, expect, it } from "vitest";
import { DEFAULT_NAV_LAYOUT, NAV_ITEM_CONFIG, parseNavLayout } from "../navLayout";

describe("parseNavLayout", () => {
  it("returns the defaults for null or invalid input", () => {
    expect(parseNavLayout(null)).toBe(DEFAULT_NAV_LAYOUT);
    expect(parseNavLayout({ not: "a layout" })).toBe(DEFAULT_NAV_LAYOUT);
  });

  it("drops a retired item id and appends the item that replaced it", () => {
    // A layout persisted before Alignment was replaced by Decisions.
    const saved = [
      {
        id: "align",
        name: "Align",
        hidden: false,
        items: [
          { id: "goals", hidden: false },
          { id: "alignment", hidden: false },
        ],
      },
    ];
    const [align] = parseNavLayout(saved);
    expect(align?.items.map((i) => i.id)).toEqual(["goals", "decisions"]);
  });

  it("does not let an inherited object key pose as a nav item", () => {
    const saved = [
      {
        id: "align",
        name: "Align",
        hidden: false,
        items: [
          { id: "constructor", hidden: false },
          { id: "goals", hidden: false },
        ],
      },
    ];
    const [align] = parseNavLayout(saved);
    expect(align?.items.map((i) => i.id)).toEqual(["goals", "decisions"]);
  });

  it("keeps the user's order and visibility while appending new defaults", () => {
    const saved = [
      {
        id: "deliver",
        name: "Build",
        hidden: true,
        items: [
          { id: "projects", hidden: true },
          { id: "actions", hidden: false },
        ],
      },
    ];
    const layout = parseNavLayout(saved);
    expect(layout[0]).toMatchObject({ id: "deliver", name: "Build", hidden: true });
    expect(layout[0]?.items.slice(0, 2)).toEqual([
      { id: "projects", hidden: true },
      { id: "actions", hidden: false },
    ]);
    expect(layout.map((s) => s.id)).toEqual(["deliver", "align", "connect", "amplify"]);
  });

  it("names the default sections after what they hold, not a verb", () => {
    expect(DEFAULT_NAV_LAYOUT.map((s) => s.name)).toEqual(["Plan", "Work", "People", "Tools"]);
  });

  it("keeps a section's fold, and reads a layout saved before folds as open", () => {
    const saved = [
      { id: "align", name: "Plan", hidden: false, collapsed: true, items: [{ id: "goals", hidden: false }] },
      { id: "deliver", name: "Work", hidden: false, items: [{ id: "actions", hidden: false }] },
    ];
    const [align, deliver] = parseNavLayout(saved);
    expect(align?.collapsed).toBe(true);
    expect(deliver?.collapsed).toBeUndefined();
  });

  it("links Goals to the bare goals route and Decisions to the decisions route", () => {
    expect(NAV_ITEM_CONFIG.goals?.href("clear")).toBe("/w/clear/goals");
    expect(NAV_ITEM_CONFIG.decisions?.href("clear")).toBe("/w/clear/decisions");
    expect(NAV_ITEM_CONFIG.alignment).toBeUndefined();
  });
});
