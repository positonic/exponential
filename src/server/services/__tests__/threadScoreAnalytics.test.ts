import { describe, expect, it } from "vitest";

import {
  buildLaneBreakdown,
  buildPromptVersionBreakdown,
  buildScoreTrend,
  lastPromptVersionByConversation,
  type ScoredThreadRow,
} from "~/server/services/threadScoreAnalytics";

const row = (overrides: Partial<ScoredThreadRow>): ScoredThreadRow => ({
  conversationId: "c1",
  agentId: "zoeAgent",
  overallScore: 80,
  failureLane: null,
  createdAt: new Date("2026-06-10T12:00:00Z"),
  ...overrides,
});

describe("buildScoreTrend", () => {
  const from = new Date("2026-06-08T00:00:00Z");
  const to = new Date("2026-06-10T23:00:00Z");

  it("buckets by UTC day with no gaps and rounds the mean", () => {
    const { overall } = buildScoreTrend(
      [
        row({ createdAt: new Date("2026-06-08T01:00:00Z"), overallScore: 90 }),
        row({ createdAt: new Date("2026-06-08T23:00:00Z"), overallScore: 75 }),
        row({ createdAt: new Date("2026-06-10T12:00:00Z"), overallScore: 50 }),
      ],
      from,
      to,
    );
    expect(overall).toEqual([
      { date: "2026-06-08", count: 2, avgScore: 83 },
      { date: "2026-06-09", count: 0, avgScore: null },
      { date: "2026-06-10", count: 1, avgScore: 50 },
    ]);
  });

  it("splits series per agent, grouping null agents under unknown", () => {
    const { byAgent } = buildScoreTrend(
      [
        row({ agentId: "zoeAgent", overallScore: 90 }),
        row({ agentId: null, overallScore: 40 }),
      ],
      from,
      to,
    );
    expect(byAgent.map((s) => s.agentId)).toEqual(["unknown", "zoeAgent"]);
    expect(byAgent.find((s) => s.agentId === "unknown")?.points[2]).toEqual({
      date: "2026-06-10",
      count: 1,
      avgScore: 40,
    });
  });
});

describe("buildLaneBreakdown", () => {
  it("ranks failure lanes by count and appends passing last", () => {
    const breakdown = buildLaneBreakdown([
      row({ failureLane: "agent_behaviour", overallScore: 30 }),
      row({ failureLane: "agent_behaviour", overallScore: 50 }),
      row({ failureLane: "code_bug", overallScore: 20 }),
      row({ failureLane: null, overallScore: 90 }),
    ]);
    expect(breakdown).toEqual([
      { lane: "agent_behaviour", count: 2, avgScore: 40 },
      { lane: "code_bug", count: 1, avgScore: 20 },
      { lane: "passing", count: 1, avgScore: 90 },
    ]);
  });

  it("returns empty for no scores", () => {
    expect(buildLaneBreakdown([])).toEqual([]);
  });
});

describe("lastPromptVersionByConversation", () => {
  it("keeps the latest stamped turn per Thread and ignores unstamped turns", () => {
    const map = lastPromptVersionByConversation([
      {
        conversationId: "c1",
        promptVersion: "router@aaa",
        createdAt: new Date("2026-06-01T10:00:00Z"),
      },
      {
        conversationId: "c1",
        promptVersion: "router@aaa+brain@bbb",
        createdAt: new Date("2026-06-01T11:00:00Z"),
      },
      // A later turn from an older (unstamped) deploy must not erase the stamp.
      {
        conversationId: "c1",
        promptVersion: null,
        createdAt: new Date("2026-06-01T12:00:00Z"),
      },
      {
        conversationId: "c2",
        promptVersion: null,
        createdAt: new Date("2026-06-01T10:00:00Z"),
      },
    ]);
    expect(map.get("c1")).toBe("router@aaa+brain@bbb");
    expect(map.has("c2")).toBe(false);
  });
});

describe("buildPromptVersionBreakdown", () => {
  it("groups by attributed version with unstamped fallback, counting failures", () => {
    const scores = [
      row({ conversationId: "c1", overallScore: 90 }),
      row({ conversationId: "c2", overallScore: 50, failureLane: "code_bug" }),
      row({ conversationId: "c3", overallScore: 70 }),
    ];
    const versions = new Map([
      ["c1", "router@aaa+brain@bbb"],
      ["c2", "router@aaa+brain@bbb"],
    ]);
    expect(buildPromptVersionBreakdown(scores, versions)).toEqual([
      {
        promptVersion: "router@aaa+brain@bbb",
        count: 2,
        avgScore: 70,
        failureCount: 1,
      },
      { promptVersion: "unstamped", count: 1, avgScore: 70, failureCount: 0 },
    ]);
  });
});
