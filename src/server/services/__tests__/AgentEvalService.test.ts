/**
 * Unit tests for AgentEvalService (ADR-0012, Phase 1) — pure helpers plus the
 * settled-Thread selection logic against a mocked Prisma client. The judge
 * (Anthropic) is never called here.
 */
import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  AgentEvalService,
  buildLaneReport,
  formatTranscriptForJudge,
  isIosPerpetualThread,
  isSettled,
  SETTLED_AFTER_MS,
  type ScoredThreadSummary,
  type TranscriptTurn,
} from "../AgentEvalService";

const NOW = new Date("2026-06-11T12:00:00.000Z");

function summary(
  overrides: Partial<ScoredThreadSummary> & { conversationId: string },
): ScoredThreadSummary {
  return {
    overallScore: 50,
    failureLane: null,
    reasoning: "r",
    expectation: null,
    ...overrides,
  };
}

describe("isSettled", () => {
  it("is settled exactly at the one-hour boundary", () => {
    const lastTurnAt = new Date(NOW.getTime() - SETTLED_AFTER_MS);
    expect(isSettled(lastTurnAt, NOW)).toBe(true);
  });

  it("is NOT settled one millisecond inside the window", () => {
    const lastTurnAt = new Date(NOW.getTime() - SETTLED_AFTER_MS + 1);
    expect(isSettled(lastTurnAt, NOW)).toBe(false);
  });

  it("is settled for an old Thread", () => {
    const lastTurnAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    expect(isSettled(lastTurnAt, NOW)).toBe(true);
  });
});

describe("isIosPerpetualThread", () => {
  it("excludes iOS perpetual voice-${userId} threads (ADR-0006 deferral)", () => {
    expect(isIosPerpetualThread("voice-cm123abc")).toBe(true);
  });

  it("keeps ordinary conversation ids", () => {
    expect(isIosPerpetualThread("conv_1749600000_ab12cd")).toBe(false);
    expect(isIosPerpetualThread("session-user-1749600000")).toBe(false);
  });

  it("keeps ids merely containing 'voice-' later in the string", () => {
    expect(isIosPerpetualThread("web-voice-123")).toBe(false);
  });
});

describe("buildLaneReport", () => {
  it("groups failures by lane, ranked by count, worst examples first", () => {
    const report = buildLaneReport(
      [
        summary({ conversationId: "pass-1", overallScore: 95 }),
        summary({
          conversationId: "behaviour-low",
          overallScore: 10,
          failureLane: "agent_behaviour",
          expectation: "must not deflect",
        }),
        summary({
          conversationId: "behaviour-high",
          overallScore: 40,
          failureLane: "agent_behaviour",
        }),
        summary({
          conversationId: "bug-1",
          overallScore: 30,
          failureLane: "code_bug",
        }),
      ],
      2,
    );

    expect(report.map((entry) => entry.lane)).toEqual([
      "agent_behaviour",
      "code_bug",
    ]);
    expect(report[0]!.count).toBe(2);
    // Worst (lowest score) first within the lane.
    expect(report[0]!.examples.map((example) => example.conversationId)).toEqual(
      ["behaviour-low", "behaviour-high"],
    );
  });

  it("caps examples per lane but keeps the full count", () => {
    const failures = [1, 2, 3, 4, 5].map((i) =>
      summary({
        conversationId: `c${i}`,
        overallScore: i * 10,
        failureLane: "capability_gap",
      }),
    );
    const report = buildLaneReport(failures, 3);
    expect(report).toHaveLength(1);
    expect(report[0]!.count).toBe(5);
    expect(report[0]!.examples).toHaveLength(3);
    expect(report[0]!.examples[0]!.conversationId).toBe("c1");
  });

  it("returns an empty report when every Thread passes", () => {
    expect(
      buildLaneReport([summary({ conversationId: "p", overallScore: 90 })]),
    ).toEqual([]);
  });
});

describe("formatTranscriptForJudge", () => {
  it("renders turns with tools and error annotations", () => {
    const turns: TranscriptTurn[] = [
      {
        userMessage: "what's due today?",
        aiResponse: "You have 2 actions due.",
        toolsUsed: ["retrieveActions"],
        hadError: false,
        responseTime: 1200,
        createdAt: "2026-06-11T10:00:00.000Z",
      },
      {
        userMessage: "complete the first one",
        aiResponse: "Something went wrong.",
        toolsUsed: [],
        hadError: true,
        responseTime: null,
        createdAt: "2026-06-11T10:01:00.000Z",
      },
    ];
    const text = formatTranscriptForJudge(turns);
    expect(text).toContain("--- Turn 1 ");
    expect(text).toContain("TOOLS INVOKED: retrieveActions");
    expect(text).toContain("TOOLS INVOKED: (none)");
    expect(text).toContain("TURN ERRORED: yes");
    expect(text).toContain("USER: complete the first one");
  });
});

describe("findSettledThreadIds (mocked Prisma)", () => {
  function makeService(
    groups: Array<{ conversationId: string | null; lastTurnAt: Date }>,
    alreadyScored: string[] = [],
  ) {
    const db = mockDeep<PrismaClient>();
    db.aiInteractionHistory.groupBy.mockResolvedValue(
      // groupBy's generic return type is awkward to satisfy exactly; the
      // service only reads conversationId and _max.createdAt.
      groups.map((group) => ({
        conversationId: group.conversationId,
        _max: { createdAt: group.lastTurnAt },
      })) as never,
    );
    db.threadScore.findMany.mockResolvedValue(
      alreadyScored.map((conversationId) => ({ conversationId })) as never,
    );
    return { db, service: new AgentEvalService(db) };
  }

  const settledAt = new Date(NOW.getTime() - 2 * SETTLED_AFTER_MS);

  it("returns settled, in-scope, unscored Threads only", async () => {
    const { service } = makeService(
      [
        { conversationId: "settled-1", lastTurnAt: settledAt },
        { conversationId: "active-1", lastTurnAt: NOW }, // not settled
        { conversationId: "voice-user1", lastTurnAt: settledAt }, // iOS perpetual
        { conversationId: "scored-1", lastTurnAt: settledAt }, // already judged
      ],
      ["scored-1"],
    );
    await expect(service.findSettledThreadIds(NOW)).resolves.toEqual([
      "settled-1",
    ]);
  });

  it("scopes the turn query to brain-reasoned platforms", async () => {
    const { db, service } = makeService([
      { conversationId: "settled-1", lastTurnAt: settledAt },
    ]);
    await service.findSettledThreadIds(NOW);
    const groupByArgs = db.aiInteractionHistory.groupBy.mock.calls[0]?.[0];
    expect(groupByArgs?.where?.platform).toEqual({
      in: ["web", "manychat", "slack", "api", "direct"],
    });
  });

  it("returns empty without querying ThreadScore when nothing is settled", async () => {
    const { db, service } = makeService([
      { conversationId: "active-1", lastTurnAt: NOW },
    ]);
    await expect(service.findSettledThreadIds(NOW)).resolves.toEqual([]);
    expect(db.threadScore.findMany).not.toHaveBeenCalled();
  });
});
