import { describe, it, expect } from "vitest";

import { parseDateFromText } from "../DateParser";
import { matchProject } from "../ProjectMatcher";
import { parseDictation } from "../DictationParser";
import type { ProjectForMatching } from "../types";

// Use a fixed reference date so tests are deterministic
const REF_DATE = new Date("2026-02-22T10:00:00Z");

// ── parseDateFromText ────────────────────────────────────────────────

describe("parseDateFromText", () => {
  it("extracts schedule date from 'tomorrow'", () => {
    const result = parseDateFromText("Call John tomorrow", REF_DATE);
    expect(result.date).not.toBeNull();
    expect(result.dateType).toBe("schedule");
    expect(result.phrase).toBe("tomorrow");
    expect(result.cleanedText).toBe("Call John");
  });

  it("extracts deadline date from 'by Friday'", () => {
    const result = parseDateFromText("Submit report by Friday", REF_DATE);
    expect(result.date).not.toBeNull();
    expect(result.dateType).toBe("deadline");
    expect(result.cleanedText).not.toContain("by Friday");
  });

  it("extracts schedule date from 'next Monday'", () => {
    const result = parseDateFromText("Meeting next Monday", REF_DATE);
    expect(result.date).not.toBeNull();
    expect(result.dateType).toBe("schedule");
  });

  it("returns null when no date is found", () => {
    const result = parseDateFromText("Fix the bug", REF_DATE);
    expect(result.date).toBeNull();
    expect(result.dateType).toBeNull();
    expect(result.phrase).toBeNull();
    expect(result.cleanedText).toBe("Fix the bug");
  });

  it("extracts deadline from 'due tomorrow'", () => {
    const result = parseDateFromText("Report due tomorrow", REF_DATE);
    expect(result.date).not.toBeNull();
    expect(result.dateType).toBe("deadline");
  });

  it("preserves original text", () => {
    const result = parseDateFromText("Call John tomorrow", REF_DATE);
    expect(result.originalText).toBe("Call John tomorrow");
  });
});

// ── matchProject ─────────────────────────────────────────────────────

describe("matchProject", () => {
  const projects: ProjectForMatching[] = [
    { id: "p1", name: "Sales" },
    { id: "p2", name: "Marketing Dashboard" },
    { id: "p3", name: "Backend API" },
  ];

  it("matches 'for sales project'", () => {
    const result = matchProject("Send email for sales project", projects);
    expect(result.project).not.toBeNull();
    expect(result.project!.id).toBe("p1");
    expect(result.project!.name).toBe("Sales");
  });

  it("matches 'add to marketing'", () => {
    const result = matchProject("add to marketing project", projects);
    expect(result.project).not.toBeNull();
    expect(result.project!.name).toBe("Marketing Dashboard");
  });

  it("returns null with no project reference", () => {
    const result = matchProject("Fix the bug", projects);
    expect(result.project).toBeNull();
    expect(result.phrase).toBeNull();
    expect(result.cleanedText).toBe("Fix the bug");
  });

  it("returns null with empty projects list", () => {
    const result = matchProject("for sales project", []);
    expect(result.project).toBeNull();
  });

  it("removes matched phrase from text", () => {
    const result = matchProject("Send email for sales project", projects);
    expect(result.cleanedText).not.toContain("for sales project");
    expect(result.cleanedText).toContain("Send email");
  });
});

// ── parseDictation (integration of DateParser + ProjectMatcher) ──────

describe("parseDictation", () => {
  const projects: ProjectForMatching[] = [
    { id: "p1", name: "Sales" },
    { id: "p2", name: "Marketing" },
  ];

  it("extracts date + project + cleaned name", () => {
    const result = parseDictation("Call John tomorrow for sales project", projects);
    expect(result.scheduledStart).not.toBeNull();
    expect(result.matchedProject).not.toBeNull();
    expect(result.matchedProject!.name).toBe("Sales");
    expect(result.cleanedName).not.toContain("tomorrow");
    expect(result.cleanedName).not.toContain("for sales project");
  });

  it("handles text with no date and no project", () => {
    const result = parseDictation("Fix the bug", projects);
    expect(result.scheduledStart).toBeNull();
    expect(result.dueDate).toBeNull();
    expect(result.matchedProject).toBeNull();
    expect(result.cleanedName).toBe("Fix the bug");
  });

  it("strips filler words like 'please'", () => {
    const result = parseDictation("please update the docs");
    expect(result.cleanedName).toBe("Update the docs");
  });

  it("strips 'remind me to' prefix", () => {
    const result = parseDictation("remind me to buy milk");
    expect(result.cleanedName).toBe("Buy milk");
  });

  it("capitalizes first letter of cleaned name", () => {
    const result = parseDictation("fix the tests");
    expect(result.cleanedName).toBe("Fix the tests");
  });

  it("preserves original input", () => {
    const result = parseDictation("  Call John tomorrow  ");
    expect(result.originalInput).toBe("Call John tomorrow");
  });

  it("separates schedule dates from deadline dates", () => {
    const scheduleResult = parseDictation("Call John tomorrow");
    expect(scheduleResult.scheduledStart).not.toBeNull();
    expect(scheduleResult.dueDate).toBeNull();

    const deadlineResult = parseDictation("Submit report by Friday");
    expect(deadlineResult.dueDate).not.toBeNull();
    expect(deadlineResult.scheduledStart).toBeNull();
  });
});
