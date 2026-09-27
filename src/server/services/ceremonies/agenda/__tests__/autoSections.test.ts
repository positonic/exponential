import { describe, expect, it } from "vitest";
import { AUTO_PROJECTS_KEY, dropEmptyAutoSections, withAutoProjectsSection } from "../autoSections";
import type { AgendaSnapshot, AgendaTemplateSection } from "../types";

const template: AgendaTemplateSection[] = [
  { key: "cycle", type: "cycle_progress", title: "Cycle progress", minutes: 10 },
  { key: "free", type: "free_text", title: "Anything else" },
];

function snapshot(sections: AgendaSnapshot["sections"]): AgendaSnapshot {
  return { version: 1, generatedAt: "2026-09-27T08:00:00.000Z", sections };
}

describe("withAutoProjectsSection", () => {
  it("appends a linked_projects section when the ceremony includes projects", () => {
    const out = withAutoProjectsSection(template, true);
    expect(out.map((s) => s.key)).toEqual(["cycle", "free", AUTO_PROJECTS_KEY]);
    expect(out[2]).toEqual({ key: AUTO_PROJECTS_KEY, type: "linked_projects", title: "Projects" });
  });

  it("leaves the template alone when the setting is off", () => {
    expect(withAutoProjectsSection(template, false)).toBe(template);
  });

  it("defers to a linked_projects section the template already places", () => {
    const placed = [{ key: "projects", type: "linked_projects", title: "Our projects" }, ...template];
    expect(withAutoProjectsSection(placed, true)).toBe(placed);
  });
});

describe("dropEmptyAutoSections", () => {
  const item = { id: "x", sectionKey: AUTO_PROJECTS_KEY, title: "Website", refType: "project" as const, refId: "p-1", order: 0 };

  it("removes the appended section when it found nothing", () => {
    const agenda = snapshot([
      { key: "cycle", type: "cycle_progress", title: "Cycle progress", items: [], emptyReason: "Nothing to raise" },
      { key: AUTO_PROJECTS_KEY, type: "linked_projects", title: "Projects", items: [], emptyReason: "Nothing to raise" },
    ]);
    expect(dropEmptyAutoSections(agenda).sections.map((s) => s.key)).toEqual(["cycle"]);
  });

  it("keeps it when it has items, and returns the same snapshot when nothing changes", () => {
    const agenda = snapshot([{ key: AUTO_PROJECTS_KEY, type: "linked_projects", title: "Projects", items: [item] }]);
    expect(dropEmptyAutoSections(agenda)).toBe(agenda);
  });

  it("never touches an empty section the template placed itself", () => {
    const agenda = snapshot([{ key: "projects", type: "linked_projects", title: "Projects", items: [], emptyReason: "Nothing to raise" }]);
    expect(dropEmptyAutoSections(agenda)).toBe(agenda);
  });
});
