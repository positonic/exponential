import { describe, expect, it } from "vitest";
import { AGENDA_SECTION_TYPES, CEREMONY_TEMPLATES, DAILY_BRIEF_TEMPLATE, SHUTDOWN_ROUTINE_TEMPLATE, dailyBriefSectionTitle, findTemplate } from "../templates";
import { getSectionModule } from "../agenda/sections";
import { DAILY_SUMMARY_HEADINGS } from "~/server/services/notifications/emit/dailySummary/render";

describe("ceremony templates", () => {
  it("binds every section of every template to a registered query", () => {
    for (const t of CEREMONY_TEMPLATES) {
      for (const s of t.agendaTemplate) {
        expect(getSectionModule(s.type)?.type, `${t.slug}/${s.key}`).toBe(s.type);
      }
    }
  });

  it("lists every section type the templates use in the editor's picker", () => {
    const listed = new Set(AGENDA_SECTION_TYPES.map((t) => t.value));
    for (const t of CEREMONY_TEMPLATES) for (const s of t.agendaTemplate) expect(listed.has(s.type), s.type).toBe(true);
  });

  it("uses unique slugs", () => {
    const slugs = CEREMONY_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("daily brief template", () => {
  it("is a daily, one-person ceremony findable by slug", () => {
    expect(findTemplate("daily-brief")).toBe(DAILY_BRIEF_TEMPLATE);
    expect(DAILY_BRIEF_TEMPLATE.cadenceRule).toBe("FREQ=DAILY;BYHOUR=8;BYMINUTE=0");
    expect(DAILY_BRIEF_TEMPLATE.kind).toBe("CUSTOM");
  });

  it("carries the Daily summary's running order, which the digest renderer reads its headings from", () => {
    expect(DAILY_BRIEF_TEMPLATE.agendaTemplate.map((s) => s.key)).toEqual([
      "yesterday", "todays_meetings", "todays_actions", "cycle_progress", "up_next", "dri_projects",
    ]);
    expect(DAILY_SUMMARY_HEADINGS.yesterday).toBe(`⏪ ${dailyBriefSectionTitle("yesterday")}`);
    expect(DAILY_SUMMARY_HEADINGS.driProjects).toBe(`🧭 ${dailyBriefSectionTitle("dri_projects")}`);
    expect(() => dailyBriefSectionTitle("nope")).toThrow();
  });
});

describe("shutdown routine template", () => {
  it("fires daily at 19:00 with no lead time, so the agenda covers the whole day", () => {
    expect(findTemplate("shutdown-routine")).toBe(SHUTDOWN_ROUTINE_TEMPLATE);
    expect(SHUTDOWN_ROUTINE_TEMPLATE.cadenceRule).toBe("FREQ=DAILY;BYHOUR=19;BYMINUTE=0");
    expect(SHUTDOWN_ROUTINE_TEMPLATE.leadTimeHours).toBe(0);
  });

  it("runs done, moved, meetings, time, left undone, tomorrow, close", () => {
    expect(SHUTDOWN_ROUTINE_TEMPLATE.agendaTemplate.map((s) => s.key)).toEqual([
      "completed_today", "activity_today", "todays_meetings", "time_today", "left_undone", "tomorrow", "close",
    ]);
    expect(SHUTDOWN_ROUTINE_TEMPLATE.agendaTemplate.find((s) => s.key === "todays_meetings")?.config).toEqual({ day: "today" });
  });
});
