import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONE_OFF_PRESET,
  ONE_OFF_PRESETS,
  ONE_OFF_SECTION_TYPES,
  buildOneOffAgendaTemplate,
  oneOffSlug,
} from "../oneOff";
import { getSectionModule } from "../agenda/sections";

describe("one-off presets", () => {
  it.each(ONE_OFF_PRESETS.map((p) => [p.key, p] as const))("%s uses only one-off section types", (_key, preset) => {
    for (const section of preset.sections) {
      expect(ONE_OFF_SECTION_TYPES).toContain(section.type);
    }
    expect(preset.sections.some((s) => s.type === "free_text")).toBe(true);
  });

  it("every one-off section type has a registry module", () => {
    for (const type of ONE_OFF_SECTION_TYPES) expect(getSectionModule(type)).toBeTruthy();
  });

  it("defaults to the Review progress preset", () => {
    expect(ONE_OFF_PRESETS.find((p) => p.key === DEFAULT_ONE_OFF_PRESET)?.label).toBe("Review progress");
  });
});

describe("buildOneOffAgendaTemplate", () => {
  it("uses the default preset, with the purpose as item 1 of the free text section", () => {
    const template = buildOneOffAgendaTemplate({ purpose: "Agree the launch scope" });
    expect(template.map((s) => s.type)).toEqual(["project_state", "okr_review", "blockers", "free_text"]);
    expect(template.at(-1)).toMatchObject({ title: "Discussion", config: { items: ["Agree the launch scope"] } });
  });

  it("titles ticked sections from the preset when it names them", () => {
    const template = buildOneOffAgendaTemplate({
      purpose: "Pick a vendor",
      presetKey: "decide",
      sectionTypes: ["decisions_pending", "free_text", "blockers"],
    });
    expect(template.map((s) => s.title)).toEqual(["Decisions for the room", "The decision", "Blockers"]);
    expect(template[1]!.config).toEqual({ items: ["Pick a vendor"] });
  });

  it("adds a Discussion section to carry the purpose when none is ticked", () => {
    const template = buildOneOffAgendaTemplate({ purpose: "Catch up", sectionTypes: ["project_state"] });
    expect(template).toEqual([
      { key: "project_state", type: "project_state", title: "Project state" },
      { key: "free_text", type: "free_text", title: "Discussion", config: { items: ["Catch up"] } },
    ]);
  });
});

describe("oneOffSlug", () => {
  it("never collides on a repeated title", () => {
    expect(oneOffSlug("Stellar sync", "ab12cd")).toBe("stellar-sync-ab12cd");
    expect(oneOffSlug("Stellar sync")).not.toBe(oneOffSlug("Stellar sync"));
    expect(oneOffSlug("!!!", "x")).toBe("meeting-x");
  });
});
