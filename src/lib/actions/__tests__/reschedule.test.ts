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

describe("resolveQuickReschedule — no wall-clock leak", () => {
  // The heart of this ticket. NOW is mid-afternoon; every option must come back
  // at local midnight, or the value reaches scheduledStart and the agenda rail
  // draws a phantom hour-long block.
  it.each(QUICK_RESCHEDULE_OPTIONS.filter((o) => o.id !== "no-date").map((o) => o.id))(
    "resolves %s to local midnight",
    (id) => {
      const d = resolveQuickReschedule(id, NOW).date!;
      expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()])
        .toEqual([0, 0, 0, 0]);
    },
  );
});

describe("rescheduleUpdateFields", () => {
  // Both fields, together. scheduledStart is what partitionActions buckets on
  // when it is set — writing dueDate alone leaves a past scheduledStart in
  // place and the action never leaves the overdue pile.
  it.each(QUICK_RESCHEDULE_OPTIONS.map((o) => o.id))(
    "writes scheduledStart and dueDate for %s",
    (id) => {
      const fields = rescheduleUpdateFields(resolveQuickReschedule(id, NOW));

      expect(Object.keys(fields).sort()).toEqual(["dueDate", "scheduledStart"]);
      expect(fields.scheduledStart).toEqual(fields.dueDate);
      // Still no fabricated block geometry.
      expect(fields).not.toHaveProperty("scheduledEnd");
      expect(fields).not.toHaveProperty("duration");
    },
  );

  it("carries the chosen date through to both fields", () => {
    const choice = resolveQuickReschedule("tomorrow", NOW);
    const fields = rescheduleUpdateFields(choice);
    expect(fields.dueDate).toBe(choice.date);
    expect(fields.scheduledStart).toBe(choice.date);
  });

  it("clears both dates for No date", () => {
    expect(rescheduleUpdateFields(resolveQuickReschedule("no-date", NOW))).toEqual({
      scheduledStart: null,
      dueDate: null,
    });
  });

  it("writes both fields for a custom calendar pick too", () => {
    const picked = new Date(2026, 7, 20);
    const fields = rescheduleUpdateFields({
      id: "custom",
      label: "Aug 20",
      date: picked,
    });
    expect(fields).toEqual({ scheduledStart: picked, dueDate: picked });
  });

  it("rescheduling in quick succession is idempotent — one block, not six", () => {
    // The regression this ticket fixes: six clicks used to stamp six
    // scheduledStart values seconds apart, each drawn as its own hour-long
    // block. Normalised to midnight, all six land on the identical instant.
    const clicks = Array.from({ length: 6 }, (_, i) =>
      rescheduleUpdateFields(
        resolveQuickReschedule("today", new Date(NOW.getTime() + i * 1000)),
      ),
    );

    const stamps = new Set(clicks.map((c) => c.scheduledStart!.getTime()));
    expect(stamps.size).toBe(1);
    expect(clicks.every((c) => day(c.scheduledStart) === "2026-8-5")).toBe(true);
    expect(clicks.every((c) => day(c.dueDate) === "2026-8-5")).toBe(true);
  });
});
