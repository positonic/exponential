import { describe, expect, it } from "vitest";
import {
  QUICK_RESCHEDULE_OPTIONS,
  rescheduleUpdateFields,
  resolveQuickReschedule,
} from "~/lib/actions/reschedule";

// A Wednesday, deliberately mid-afternoon so a wall-clock leak would be visible.
const NOW = new Date(2026, 7, 5, 14, 37, 12, 500);

function day(d: Date | null): string {
  return d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : "none";
}

describe("resolveQuickReschedule", () => {
  it("resolves Today to the same day", () => {
    expect(day(resolveQuickReschedule("today", NOW).date)).toBe("2026-8-5");
  });

  it("resolves Tomorrow to the next day", () => {
    expect(day(resolveQuickReschedule("tomorrow", NOW).date)).toBe("2026-8-6");
  });

  it("resolves Next week to seven days out", () => {
    expect(day(resolveQuickReschedule("next-week", NOW).date)).toBe("2026-8-12");
  });

  it("resolves This weekend to the coming Saturday", () => {
    expect(day(resolveQuickReschedule("weekend", NOW).date)).toBe("2026-8-8");
  });

  it("resolves No date to null", () => {
    expect(resolveQuickReschedule("no-date", NOW).date).toBeNull();
  });

  it("does not mutate the `now` it was handed", () => {
    const before = NOW.getTime();
    for (const option of QUICK_RESCHEDULE_OPTIONS) {
      resolveQuickReschedule(option.id, NOW);
    }
    expect(NOW.getTime()).toBe(before);
  });
});

describe("rescheduleUpdateFields", () => {
  // The heart of this ticket: a quick option must never fabricate a time-block.
  it.each(QUICK_RESCHEDULE_OPTIONS.map((o) => o.id))(
    "writes dueDate and nothing else for %s",
    (id) => {
      const fields = rescheduleUpdateFields(resolveQuickReschedule(id, NOW));

      expect(Object.keys(fields)).toEqual(["dueDate"]);
      expect(fields).not.toHaveProperty("scheduledStart");
      expect(fields).not.toHaveProperty("scheduledEnd");
      expect(fields).not.toHaveProperty("duration");
    },
  );

  it("carries the chosen date through as the deadline", () => {
    const choice = resolveQuickReschedule("tomorrow", NOW);
    expect(rescheduleUpdateFields(choice).dueDate).toBe(choice.date);
  });

  it("clears the deadline for No date", () => {
    expect(rescheduleUpdateFields(resolveQuickReschedule("no-date", NOW))).toEqual({
      dueDate: null,
    });
  });

  it("writes dueDate only for a custom calendar pick too", () => {
    const fields = rescheduleUpdateFields({
      id: "custom",
      label: "Aug 20",
      date: new Date(2026, 7, 20),
    });
    expect(Object.keys(fields)).toEqual(["dueDate"]);
  });

  it("rescheduling in quick succession yields distinct deadlines, no time-blocks", () => {
    // The regression this ticket fixes: six clicks used to stamp six
    // scheduledStart values seconds apart, each drawn as an hour-long block.
    const clicks = Array.from({ length: 6 }, (_, i) =>
      rescheduleUpdateFields(
        resolveQuickReschedule("today", new Date(NOW.getTime() + i * 1000)),
      ),
    );

    expect(clicks.every((c) => Object.keys(c).length === 1)).toBe(true);
    expect(clicks.every((c) => day(c.dueDate) === "2026-8-5")).toBe(true);
  });
});
