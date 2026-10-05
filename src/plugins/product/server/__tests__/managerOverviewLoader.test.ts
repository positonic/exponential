/**
 * Unit tests for the PR-state fold in the Overview loader. Pure: no DB.
 */
import { describe, expect, it } from "vitest";
import { foldPrEvents } from "../managerOverviewLoader";

const URL = "https://github.com/acme/app/pull/7";
const at = (iso: string) => new Date(iso);

function row(over: Partial<Parameters<typeof foldPrEvents>[0][number]>) {
  return {
    eventType: "pull_request",
    eventAction: "opened",
    prUrl: URL,
    prNumber: 7,
    prTitle: "Add filters",
    prState: "open",
    prAuthor: "mia",
    prMergedAt: null,
    prReviewState: null,
    repoFullName: "acme/app",
    eventTimestamp: at("2026-10-01T10:00:00Z"),
    ...over,
  };
}

describe("foldPrEvents", () => {
  it("tracks open -> closed -> reopened", () => {
    const pr = foldPrEvents([
      row({}),
      row({ eventAction: "closed", prState: "closed", eventTimestamp: at("2026-10-02T10:00:00Z") }),
      row({ eventAction: "reopened", prState: "open", eventTimestamp: at("2026-10-03T10:00:00Z") }),
    ]).get(URL);
    expect(pr?.state).toBe("open");
    expect(pr?.openedAt).toEqual(at("2026-10-01T10:00:00Z"));
  });

  it("keeps a merged PR merged whatever arrives after", () => {
    const pr = foldPrEvents([
      row({}),
      row({
        eventAction: "closed",
        prState: "merged",
        prMergedAt: at("2026-10-02T10:00:00Z"),
        eventTimestamp: at("2026-10-02T10:00:00Z"),
      }),
      row({ eventAction: "reopened", prState: "open", eventTimestamp: at("2026-10-03T10:00:00Z") }),
    ]).get(URL);
    expect(pr?.state).toBe("merged");
  });

  it("does not invent an open time for a PR whose opened event was never stored", () => {
    const pr = foldPrEvents([
      row({
        eventAction: "closed",
        prState: "merged",
        prMergedAt: at("2026-10-02T10:00:00Z"),
        eventTimestamp: at("2026-10-02T10:00:00Z"),
      }),
    ]).get(URL);
    // A merge time of ~0 would drag the median time-to-merge down.
    expect(pr?.openedAt).toBeNull();
    expect(pr?.firstSeenAt).toEqual(at("2026-10-02T10:00:00Z"));
  });

  it("takes review state from reviews on an open PR", () => {
    const pr = foldPrEvents([
      row({}),
      row({
        eventType: "pull_request_review",
        eventAction: "submitted",
        prReviewState: "CHANGES_REQUESTED",
        eventTimestamp: at("2026-10-02T10:00:00Z"),
      }),
    ]).get(URL);
    expect(pr).toMatchObject({ state: "changes", reviewed: true });
  });
});
