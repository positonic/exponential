import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "~/test/test-utils";

/**
 * These tests exist because of a real outage: an expired GITHUB_TOKEN made both
 * GitHub queries fail, and the page rendered its header over an empty timeline
 * for days. Nobody noticed, because "no commits" and "we couldn't reach GitHub"
 * looked identical on screen.
 *
 * The subtle part — and the reason a naive `if (error)` guard was not enough —
 * is that a failed query does not reliably arrive as `error`. It can also come
 * to rest at `status: "pending" / fetchStatus: "paused"`: no data, no error,
 * and `isLoading === false`, because React Query only reports `isLoading` while
 * a fetch is genuinely in flight. Each case below is one of those resting
 * states.
 */

const mockListCommits = vi.fn();
const mockListReleases = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    github: {
      listCommits: { useQuery: () => mockListCommits() as unknown },
      listReleases: { useQuery: () => mockListReleases() as unknown },
    },
  },
}));

const reportHandledError = vi.fn();
vi.mock("~/lib/reportHandledError", () => ({
  reportHandledError: (...args: unknown[]) => reportHandledError(...args),
}));

import { ProductTimelineClient } from "../ProductTimelineClient";

/** A query result shaped like the fields the component actually reads. */
function queryResult(
  overrides: Partial<{
    data: unknown;
    error: { message: string } | null;
    isLoading: boolean;
    isFetched: boolean;
    fetchStatus: "fetching" | "paused" | "idle";
    refetch: () => void;
  }> = {},
) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isFetched: true,
    fetchStatus: "idle" as const,
    refetch: vi.fn(),
    ...overrides,
  };
}

const ONE_COMMIT = {
  commits: [
    {
      sha: "abc1234",
      message: "feat: something shipped",
      author: "someone",
      date: "2026-08-04T21:44:22Z",
      url: "https://github.com/positonic/exponential/commit/abc1234",
      avatarUrl: null,
    },
  ],
  hasNextPage: false,
};

describe("ProductTimelineClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListReleases.mockReturnValue(queryResult({ data: [] }));
  });

  it("surfaces an explicit error when the commit query fails", () => {
    mockListCommits.mockReturnValue(
      queryResult({ error: { message: "Bad credentials" } }),
    );

    render(<ProductTimelineClient />);

    expect(screen.getByText(/Couldn't load the timeline/i)).toBeDefined();
    // The underlying cause stays on screen — it is what made the production
    // failure diagnosable in seconds rather than hours.
    expect(screen.getByText(/Bad credentials/)).toBeDefined();
  });

  it("surfaces an error when the query settles empty with no error at all", () => {
    // The exact state that produced the outage: settled, no data, no error.
    mockListCommits.mockReturnValue(
      queryResult({ fetchStatus: "paused", isFetched: false }),
    );

    render(<ProductTimelineClient />);

    expect(screen.getByText(/Couldn't load the timeline/i)).toBeDefined();
  });

  it("reports the silent failure, not just the loud one", () => {
    mockListCommits.mockReturnValue(
      queryResult({ fetchStatus: "paused", isFetched: false }),
    );

    render(<ProductTimelineClient />);

    expect(reportHandledError).toHaveBeenCalled();
    const [, options] = reportHandledError.mock.calls[0] as [
      unknown,
      { area: string },
    ];
    expect(options.area).toBe("product-timeline-commits");
  });

  it("shows a loader, not an error, while the first fetch is in flight", () => {
    mockListCommits.mockReturnValue(
      queryResult({ isLoading: true, isFetched: false, fetchStatus: "fetching" }),
    );

    render(<ProductTimelineClient />);

    expect(screen.queryByText(/Couldn't load the timeline/i)).toBeNull();
    expect(reportHandledError).not.toHaveBeenCalled();
  });

  it("renders commits and no error banner on the happy path", () => {
    mockListCommits.mockReturnValue(queryResult({ data: ONE_COMMIT }));

    render(<ProductTimelineClient />);

    expect(screen.getByText(/something shipped/)).toBeDefined();
    expect(screen.queryByText(/Couldn't load the timeline/i)).toBeNull();
    expect(reportHandledError).not.toHaveBeenCalled();
  });
});
