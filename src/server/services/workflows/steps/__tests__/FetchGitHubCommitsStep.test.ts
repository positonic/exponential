import { describe, it, expect } from "vitest";

import { resolveCommitWindow } from "../FetchGitHubCommitsStep";

const now = new Date("2026-06-20T10:30:00Z");

describe("resolveCommitWindow", () => {
  it("an explicit since wins", () => {
    const w = resolveCommitWindow(
      { since: "2026-06-01T00:00:00Z", dayRange: 3 },
      { dayRange: 1 },
      now,
    );
    expect(w.since).toBe("2026-06-01T00:00:00Z");
    expect(w.until).toBe(now.toISOString());
  });

  it("a scheduled daily Broadcast covers exactly the day ending at scheduledFor", () => {
    // What the engine hands the first step of a scheduled run: the
    // definition's config spread into input, plus `scheduledFor`.
    const w = resolveCommitWindow(
      {
        schedule: { kind: "daily", hour: 8 },
        collectionId: "c1",
        scheduledFor: "2026-06-20T08:00:00.000Z",
      },
      { dayRange: 1 },
      now,
    );
    expect(w).toEqual({
      since: "2026-06-19T08:00:00.000Z",
      until: "2026-06-20T08:00:00.000Z",
    });
  });

  it("a scheduled weekly Broadcast covers the 7 days ending at scheduledFor", () => {
    const w = resolveCommitWindow(
      {
        schedule: { kind: "weekly", hour: 9, weekday: 5 },
        scheduledFor: "2026-06-19T09:00:00.000Z",
      },
      // Broadcasts created before this fix all carry dayRange: 1 regardless
      // of cadence — the period must win over it.
      { dayRange: 1 },
      now,
    );
    expect(w).toEqual({
      since: "2026-06-12T09:00:00.000Z",
      until: "2026-06-19T09:00:00.000Z",
    });
  });

  it("falls back to the step config's dayRange (previously ignored)", () => {
    const w = resolveCommitWindow({}, { dayRange: 1 }, now);
    expect(w.since).toBe("2026-06-19T10:30:00.000Z");
  });

  it("input dayRange beats config dayRange (test send)", () => {
    const w = resolveCommitWindow({ dayRange: 2 }, { dayRange: 5 }, now);
    expect(w.since).toBe("2026-06-18T10:30:00.000Z");
  });

  it("defaults to 7 days", () => {
    const w = resolveCommitWindow({}, {}, now);
    expect(w.since).toBe("2026-06-13T10:30:00.000Z");
  });
});
