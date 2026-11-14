import { describe, expect, it } from "vitest";
import {
  BUILT_IN_NAV_ITEM_IDS,
  DEFAULT_NAV_LAYOUT,
  DEFAULT_VISIBLE_NAV_ITEM_IDS,
  NAV_ITEM_CONFIG,
  NAV_PRESETS,
  NAV_USE_CASES,
  SHORTCUTS_SECTION_ID,
  addSection,
  addShortcut,
  applyNavVisibility,
  isSafeShortcutHref,
  parseNavLayout,
  removeNavItem,
  removeSection,
  shortcutCandidates,
  visibleNavItemIds,
} from "../navLayout";

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

describe("shortcuts and custom links", () => {
  it("keeps a custom link through parseNavLayout and the shortcuts section at the top", () => {
    const layout = addShortcut(DEFAULT_NAV_LAYOUT, { label: "Docs", href: "https://example.com" });
    expect(layout[0]?.id).toBe(SHORTCUTS_SECTION_ID);
    const parsed = parseNavLayout(layout);
    expect(parsed[0]?.items).toEqual([
      { id: "link-1", hidden: false, label: "Docs", href: "https://example.com" },
    ]);
  });

  it("moves a built-in item into shortcuts instead of duplicating it", () => {
    const layout = addShortcut(DEFAULT_NAV_LAYOUT, { itemId: "pages" });
    const occurrences = layout.flatMap((s) => s.items).filter((i) => i.id === "pages");
    expect(occurrences).toHaveLength(1);
    expect(layout[0]?.items[0]?.id).toBe("pages");
    expect(shortcutCandidates(layout)).not.toContain("pages");
    // Hidden in its old section earlier? Pinning unhides it.
    expect(layout[0]?.items[0]?.hidden).toBe(false);
  });

  it("appends to an existing shortcuts section and gives custom links unique ids", () => {
    let layout = addShortcut(DEFAULT_NAV_LAYOUT, { label: "A", href: "/w/x/a" });
    layout = addShortcut(layout, { label: "B", href: "/w/x/b" });
    expect(layout.filter((s) => s.id === SHORTCUTS_SECTION_ID)).toHaveLength(1);
    expect(layout[0]?.items.map((i) => i.id)).toEqual(["link-1", "link-2"]);
  });

  it("adds, and removes, a user section but never a default section", () => {
    const withSection = addSection(DEFAULT_NAV_LAYOUT, "Ops");
    const added = withSection.at(-1);
    expect(added?.name).toBe("Ops");
    expect(added?.items).toEqual([]);
    expect(removeSection(withSection, added!.id)).toHaveLength(DEFAULT_NAV_LAYOUT.length);
    expect(removeSection(DEFAULT_NAV_LAYOUT, "align")).toBe(DEFAULT_NAV_LAYOUT);
  });

  it("removes a custom link, while a removed built-in item comes back from the defaults", () => {
    const layout = addShortcut(DEFAULT_NAV_LAYOUT, { label: "Docs", href: "/w/x/docs" });
    expect(parseNavLayout(removeNavItem(layout, "link-1"))[0]?.items).toEqual([]);
    const without = parseNavLayout(removeNavItem(DEFAULT_NAV_LAYOUT, "goals"));
    expect(without.find((s) => s.id === "align")?.items.map((i) => i.id)).toContain("goals");
  });

  it("does not re-add an item to its default section once it is placed elsewhere", () => {
    const moved = DEFAULT_NAV_LAYOUT.map((s) => {
      if (s.id === "align") return { ...s, items: s.items.filter((i) => i.id !== "goals") };
      if (s.id === "deliver") return { ...s, items: [{ id: "goals", hidden: false }, ...s.items] };
      return s;
    });
    const parsed = parseNavLayout(moved);
    expect(parsed.find((s) => s.id === "align")?.items.map((i) => i.id)).toEqual(["decisions"]);
    expect(parsed.flatMap((s) => s.items).filter((i) => i.id === "goals")).toHaveLength(1);
  });

  it("rejects an unsafe href in the schema, so the server never stores one", () => {
    const layout = addShortcut(DEFAULT_NAV_LAYOUT, { label: "x", href: "javascript:alert(1)" });
    expect(parseNavLayout(layout)).toBe(DEFAULT_NAV_LAYOUT);
    expect(parseNavLayout(addShortcut(DEFAULT_NAV_LAYOUT, { label: "x", href: "/w/x/pages" }))).not.toBe(DEFAULT_NAV_LAYOUT);
  });

  it("repairs a layout saved with an item duplicated by the old merge", () => {
    const saved = DEFAULT_NAV_LAYOUT.map((s) =>
      s.id === "align" ? { ...s, items: [{ id: "pages", hidden: false }, ...s.items] } : s,
    );
    const parsed = parseNavLayout(saved);
    expect(parsed.flatMap((s) => s.items).filter((i) => i.id === "pages")).toHaveLength(1);
    expect(parsed.find((s) => s.id === "align")?.items.map((i) => i.id)).toEqual(["pages", "goals", "decisions"]);
    expect(parsed.find((s) => s.id === "deliver")?.items.map((i) => i.id)).not.toContain("pages");
  });

  it("accepts app paths and http(s) URLs only", () => {
    expect(isSafeShortcutHref("/w/x/pages")).toBe(true);
    expect(isSafeShortcutHref("https://example.com/a?b=1")).toBe(true);
    expect(isSafeShortcutHref("//evil.com")).toBe(false);
    expect(isSafeShortcutHref("javascript:alert(1)")).toBe(false);
    expect(isSafeShortcutHref("example.com")).toBe(false);
  });
});

describe("the short default menu", () => {
  it("shows the everyday places and keeps the rest switched off", () => {
    expect(DEFAULT_VISIBLE_NAV_ITEM_IDS).toEqual([
      "goals",
      "decisions",
      "projects",
      "products",
      "pages",
      "meetings",
    ]);
    const hidden = BUILT_IN_NAV_ITEM_IDS.filter((id) => !DEFAULT_VISIBLE_NAV_ITEM_IDS.includes(id));
    expect(hidden).toEqual(["actions", "metrics", "shipped", "crm", "agents", "knowledge"]);
  });

  it("still lists every built-in item, so a switched-off one keeps its place", () => {
    expect([...BUILT_IN_NAV_ITEM_IDS].sort()).toEqual(Object.keys(NAV_ITEM_CONFIG).sort());
  });

  it("gives an item added to the defaults later its default visibility in a saved layout", () => {
    // Saved before Shipped and Knowledge existed.
    const saved = [
      { id: "deliver", name: "Work", hidden: false, items: [{ id: "projects", hidden: false }] },
      { id: "amplify", name: "Tools", hidden: false, items: [{ id: "meetings", hidden: false }] },
    ];
    const items = parseNavLayout(saved).flatMap((s) => s.items);
    expect(items.find((i) => i.id === "shipped")?.hidden).toBe(true);
    expect(items.find((i) => i.id === "knowledge")?.hidden).toBe(true);
    expect(items.find((i) => i.id === "pages")?.hidden).toBe(false);
  });

  it("leaves a saved layout's own choices alone", () => {
    const saved = [
      { id: "connect", name: "People", hidden: false, items: [{ id: "crm", hidden: false }] },
    ];
    const crm = parseNavLayout(saved).flatMap((s) => s.items).find((i) => i.id === "crm");
    expect(crm?.hidden).toBe(false);
  });

  it("describes every item in one short, plain sentence", () => {
    for (const [id, config] of Object.entries(NAV_ITEM_CONFIG)) {
      expect(config.description, id).toMatch(/^[A-Z].{15,45}\.$/);
    }
  });
});

describe("use case presets", () => {
  it("only name real items", () => {
    for (const useCase of NAV_USE_CASES) {
      for (const id of NAV_PRESETS[useCase]) {
        expect(Object.hasOwn(NAV_ITEM_CONFIG, id), `${useCase}: ${id}`).toBe(true);
      }
    }
  });

  it("make 'with a team' the default menu, so skipping the question lands in the same place", () => {
    expect(NAV_PRESETS.team).toEqual(DEFAULT_VISIBLE_NAV_ITEM_IDS);
  });

  it("give a to-do list its task list, and 'both' the team menu plus the task list", () => {
    expect(NAV_PRESETS.personal).toContain("actions");
    expect(NAV_PRESETS.personal).not.toContain("decisions");
    expect([...NAV_PRESETS.both].sort()).toEqual([...NAV_PRESETS.team, "actions"].sort());
  });
});

describe("applyNavVisibility", () => {
  it("shows exactly the chosen built-in items", () => {
    const next = applyNavVisibility(DEFAULT_NAV_LAYOUT, ["actions", "crm"]);
    expect(visibleNavItemIds(next)).toEqual(["actions", "crm"]);
  });

  it("changes nothing when given a layout's own visible items", () => {
    const saved = parseNavLayout([
      { id: "deliver", name: "Build", hidden: false, collapsed: true, items: [{ id: "pages", hidden: false }, { id: "actions", hidden: true }] },
      { id: "amplify", name: "Tools", hidden: true, items: [{ id: "agents", hidden: false }] },
    ]);
    expect(applyNavVisibility(saved, visibleNavItemIds(saved)).map((s) => s.items.filter((i) => !i.hidden).map((i) => i.id)))
      .toEqual(saved.map((s) => (s.hidden ? [] : s.items.filter((i) => !i.hidden).map((i) => i.id))));
  });

  it("keeps order, names, folds and custom shortcuts", () => {
    const saved = parseNavLayout(
      addShortcut(
        [
          { id: "deliver", name: "Build", hidden: false, collapsed: true, items: [{ id: "pages", hidden: false }, { id: "projects", hidden: false }] },
        ],
        { label: "Docs", href: "https://example.com" },
      ),
    );
    const next = applyNavVisibility(saved, ["projects"]);
    expect(next.map((s) => s.id)).toEqual(saved.map((s) => s.id));
    expect(next[0]?.items).toEqual([{ id: "link-1", hidden: false, label: "Docs", href: "https://example.com" }]);
    const build = next.find((s) => s.id === "deliver");
    expect(build).toMatchObject({ name: "Build", collapsed: true });
    expect(build?.items.slice(0, 2)).toEqual([
      { id: "pages", hidden: true },
      { id: "projects", hidden: false },
    ]);
  });

  it("unhides a hidden section when an item inside it is switched on", () => {
    const saved = parseNavLayout([
      { id: "connect", name: "People", hidden: true, items: [{ id: "crm", hidden: true }] },
    ]);
    const next = applyNavVisibility(saved, ["crm"]);
    expect(next.find((s) => s.id === "connect")).toMatchObject({ hidden: false });
    expect(visibleNavItemIds(next)).toEqual(["crm"]);
  });

  it("does not count an item inside a hidden section as visible", () => {
    const saved = parseNavLayout([
      { id: "align", name: "Plan", hidden: true, items: [{ id: "goals", hidden: false }] },
    ]);
    expect(visibleNavItemIds(saved)).not.toContain("goals");
  });
});
