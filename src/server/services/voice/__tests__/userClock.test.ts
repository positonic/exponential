/**
 * `userClockNote` — the system note that tells zoe the user's local date, so
 * "yesterday" / "on Friday" resolve to the user's days, not UTC ones.
 *
 * Regression: at 23:54 in Berlin (21:54 UTC) zoe's "yesterday" depended on the
 * UTC date, and for anyone east of UTC after midnight local it named the wrong day.
 */

import { describe, it, expect } from "vitest";
import { userClockNote } from "../userClock";

describe("userClockNote", () => {
  it("states the user's LOCAL date and offset, not the UTC one", () => {
    // 00:30 on the 17th in Berlin is still the 16th in UTC.
    const note = userClockNote("Europe/Berlin", new Date("2026-09-16T22:30:00Z"));
    expect(note).toContain("Europe/Berlin (UTC+02:00)");
    expect(note).toContain("Thursday 17 September 2026, 00:30");
    expect(note).not.toContain("16 September");
  });

  it("works west of UTC too", () => {
    const note = userClockNote("America/Los_Angeles", new Date("2026-09-17T03:00:00Z"));
    expect(note).toContain("America/Los_Angeles (UTC-07:00)");
    expect(note).toContain("Wednesday 16 September 2026, 20:00");
  });

  it("tells zoe to resolve relative days against the local date", () => {
    expect(userClockNote("UTC", new Date("2026-09-17T10:00:00Z"))).toMatch(/yesterday.*THIS local date, not UTC/s);
  });
});
