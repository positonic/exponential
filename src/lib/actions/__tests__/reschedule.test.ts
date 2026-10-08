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
  // Mirrors action.bulkReschedule: scheduledStart always moves (partitionActions
  // buckets on it when set, so leaving a past one in place keeps the action in
  // the overdue pile); dueDate is a real deadline and only moves forward when
  // it would otherwise fall before the new do-date.
  const TOMORROW = resolveQuickReschedule("tomorrow", NOW);
  const YESTERDAY = new Date(2026, 7, 4);
  const FRIDAY = new Date(2026, 7, 7);

  it.each(QUICK_RESCHEDULE_OPTIONS.filter((o) => o.id !== "no-date").map((o) => o.id))(
    "moves scheduledStart for %s",
    (id) => {
      const choice = resolveQuickReschedule(id, NOW);
      const fields = rescheduleUpdateFields(choice, null);

      expect(fields.scheduledStart).toBe(choice.date);
      // Still no fabricated block geometry.
      expect(fields).not.toHaveProperty("scheduledEnd");
      expect(fields).not.toHaveProperty("duration");
    },
  );

  it("keeps a later deadline — Friday-due moved to Tomorrow stays due Friday", () => {
    expect(rescheduleUpdateFields(TOMORROW, FRIDAY)).toEqual({
      scheduledStart: TOMORROW.date,
    });
  });

  it("pushes an earlier deadline forward to the new date", () => {
    expect(rescheduleUpdateFields(TOMORROW, YESTERDAY)).toEqual({
      scheduledStart: TOMORROW.date,
      dueDate: TOMORROW.date,
    });
  });

  it("leaves a deadline on the same instant alone", () => {
    const sameDay = new Date(TOMORROW.date!.getTime());
    expect(rescheduleUpdateFields(TOMORROW, sameDay)).toEqual({
      scheduledStart: TOMORROW.date,
    });
  });

  it("keeps a later-same-day deadline — the do-date is midnight, the deadline isn't", () => {
    const tomorrowEvening = new Date(2026, 7, 6, 17, 0);
    expect(rescheduleUpdateFields(TOMORROW, tomorrowEvening)).toEqual({
      scheduledStart: TOMORROW.date,
    });
  });

  it.each([null, undefined])("never invents a deadline when the current one is %s", (current) => {
    const fields = rescheduleUpdateFields(TOMORROW, current);
    expect(fields).toEqual({ scheduledStart: TOMORROW.date });
    expect(fields).not.toHaveProperty("dueDate");
  });

  it.each([null, FRIDAY, YESTERDAY])("clears both dates for No date (current deadline %s)", (current) => {
    expect(rescheduleUpdateFields(resolveQuickReschedule("no-date", NOW), current)).toEqual({
      scheduledStart: null,
      dueDate: null,
    });
  });

  it("applies the same rule to a custom calendar pick", () => {
    const picked = new Date(2026, 7, 20);
    const choice = { id: "custom", label: "Aug 20", date: picked };
    expect(rescheduleUpdateFields(choice, FRIDAY)).toEqual({
      scheduledStart: picked,
      dueDate: picked,
    });
    expect(rescheduleUpdateFields(choice, new Date(2026, 7, 31))).toEqual({
      scheduledStart: picked,
    });
  });

  it("rescheduling in quick succession is idempotent — one block, not six", () => {
    // Six clicks used to stamp six scheduledStart values seconds apart, each
    // drawn as its own hour-long block. Normalised to midnight, all six land
    // on the identical instant.
    const clicks = Array.from({ length: 6 }, (_, i) =>
      rescheduleUpdateFields(
        resolveQuickReschedule("today", new Date(NOW.getTime() + i * 1000)),
        YESTERDAY,
      ),
    );

    const stamps = new Set(clicks.map((c) => c.scheduledStart!.getTime()));
    expect(stamps.size).toBe(1);
    expect(clicks.every((c) => day(c.scheduledStart) === "2026-8-5")).toBe(true);
    expect(clicks.every((c) => day(c.dueDate ?? null) === "2026-8-5")).toBe(true);
  });
});
