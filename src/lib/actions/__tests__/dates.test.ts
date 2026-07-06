import { describe, expect, it } from "vitest";
import { formatRelativeDueAge } from "../dates";

// Local-time dates on purpose: the util mirrors the partition's local-day math.
function localDay(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

describe("formatRelativeDueAge", () => {
  const today = localDay(2026, 6, 29);

  it("says 'due yesterday' for a one-day-old anchor", () => {
    expect(formatRelativeDueAge(localDay(2026, 6, 28), today)).toBe(
      "due yesterday",
    );
  });

  it("counts whole days for older anchors", () => {
    expect(formatRelativeDueAge(localDay(2026, 6, 24), today)).toBe(
      "due 5d ago",
    );
  });

  it("ignores time-of-day — compares calendar days only", () => {
    expect(
      formatRelativeDueAge(localDay(2026, 6, 28, 23), localDay(2026, 6, 29, 1)),
    ).toBe("due yesterday");
  });

  it("defensively clamps a same-calendar-day anchor to 'due yesterday'", () => {
    // Callers only pass anchors strictly before today, so a same-day anchor
    // is out of contract; the clamp guarantees we never render "due 0d ago".
    expect(formatRelativeDueAge(localDay(2026, 6, 29, 8), today)).toBe(
      "due yesterday",
    );
  });

  it("rounds correctly across a DST-length day", () => {
    // Late March in most northern-hemisphere zones has a 23-hour day; the
    // day-normalized diff + Math.round keeps this at exactly 7 days.
    expect(formatRelativeDueAge(localDay(2026, 3, 22), localDay(2026, 3, 29))).toBe(
      "due 7d ago",
    );
  });
});
