import { describe, expect, it } from "vitest";
import { hasUserChosenTime } from "~/lib/actions/scheduling";

const START = new Date(2026, 7, 5, 10, 30, 0, 0);
const END = new Date(2026, 7, 5, 10, 40, 0, 0);

describe("hasUserChosenTime", () => {
  it("is false with no scheduledStart at all", () => {
    expect(hasUserChosenTime({})).toBe(false);
    expect(hasUserChosenTime({ scheduledStart: null })).toBe(false);
  });

  it("is false for a bare scheduledStart — the stamped-instant case", () => {
    expect(hasUserChosenTime({ scheduledStart: START })).toBe(false);
    expect(
      hasUserChosenTime({ scheduledStart: START, scheduledEnd: null, duration: null }),
    ).toBe(false);
  });

  it("is true when a duration states the length", () => {
    expect(hasUserChosenTime({ scheduledStart: START, duration: 25 })).toBe(true);
  });

  it("is true when a scheduledEnd states the length", () => {
    expect(hasUserChosenTime({ scheduledStart: START, scheduledEnd: END })).toBe(true);
  });

  it("accepts ISO strings on both ends", () => {
    expect(
      hasUserChosenTime({
        scheduledStart: START.toISOString(),
        scheduledEnd: END.toISOString(),
      }),
    ).toBe(true);
  });

  it("ignores a non-positive duration but still honours a scheduledEnd", () => {
    expect(hasUserChosenTime({ scheduledStart: START, duration: 0 })).toBe(false);
    expect(
      hasUserChosenTime({ scheduledStart: START, duration: 0, scheduledEnd: END }),
    ).toBe(true);
  });

  it("is false without a start even when a length is stated", () => {
    expect(hasUserChosenTime({ duration: 30 })).toBe(false);
    expect(hasUserChosenTime({ scheduledEnd: END })).toBe(false);
  });

  it("narrows scheduledStart for the caller", () => {
    const action: { scheduledStart?: Date | null; duration?: number | null } = {
      scheduledStart: START,
      duration: 30,
    };
    if (hasUserChosenTime(action)) {
      // Compiles without an assertion — that is the point of the type guard.
      expect(new Date(action.scheduledStart).getHours()).toBe(10);
    } else {
      throw new Error("expected the predicate to hold");
    }
  });
});
