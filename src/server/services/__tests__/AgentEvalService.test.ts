/**
 * Unit tests for AgentEvalService (ADR-0012, Phase 1) — pure helpers plus the
 * settled-Thread selection logic against a mocked Prisma client. The judge
 * (Anthropic) is never called here.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
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

// ---------------------------------------------------------------------------
// Judgement parsing + backlog resilience (exponential-3jpn)
// ---------------------------------------------------------------------------

const settledAt2 = new Date(NOW.getTime() - 2 * SETTLED_AFTER_MS);

function turnRow(conversationId: string) {
  return {
    userMessage: "what's on my list?",
    aiResponse: "Here is your list.",
    toolsUsed: ["get-project-actions"],
    hadError: false,
    responseTime: 1200,
    createdAt: settledAt2,
    systemUserId: "user-1",
    agentId: "zoeAgent",
  };
}

function judgementInput(overrides: Record<string, unknown> = {}) {
  return {
    resolved: true,
    grounded: true,
    toolSuccess: true,
    noDeflection: true,
    overallScore: 90,
    failureLane: null,
    reasoning: "fine",
    expectation: null,
    violatingTurn: null,
    ...overrides,
  };
}

function fakeAnthropic(
  responses: Array<Record<string, unknown> | Error>,
): Anthropic {
  let call = 0;
  return {
    messages: {
      create: async () => {
        const next = responses[Math.min(call++, responses.length - 1)]!;
        if (next instanceof Error) throw next;
        return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "record_judgement", input: next }],
        };
      },
    },
  } as unknown as Anthropic;
}

describe("judgeTranscript coercion", () => {
  it("accepts numeric judge fields returned as JSON strings", async () => {
    const db = mockDeep<PrismaClient>();
    const service = new AgentEvalService(
      db,
      fakeAnthropic([
        judgementInput({
          overallScore: "35",
          failureLane: "agent_behaviour",
          violatingTurn: "2",
        }),
      ]),
    );
    const judgement = await service.judgeTranscript([]);
    expect(judgement.overallScore).toBe(35);
    expect(judgement.violatingTurn).toBe(2);
  });

  it("still rejects garbage numerics", async () => {
    const db = mockDeep<PrismaClient>();
    const service = new AgentEvalService(
      db,
      fakeAnthropic([judgementInput({ violatingTurn: "second turn" })]),
    );
    await expect(service.judgeTranscript([])).rejects.toThrow();
  });
});

describe("scoreBacklog resilience", () => {
  function makeBacklogDb(ids: string[]) {
    const db = mockDeep<PrismaClient>();
    db.aiInteractionHistory.groupBy.mockResolvedValue(
      ids.map((conversationId) => ({
        conversationId,
        _max: { createdAt: settledAt2 },
      })) as never,
    );
    db.threadScore.findMany.mockResolvedValue([] as never);
    db.threadScore.findUnique.mockResolvedValue(null as never);
    db.aiInteractionHistory.findMany.mockImplementation(((args: {
      where: { conversationId: string };
    }) => Promise.resolve([turnRow(args.where.conversationId)])) as never);
    db.threadScore.create.mockResolvedValue({} as never);
    return db;
  }

  it("skips a Thread whose judgement fails and keeps draining", async () => {
    const db = makeBacklogDb(["bad-1", "good-1"]);
    const service = new AgentEvalService(
      db,
      fakeAnthropic([new Error("model returned garbage"), judgementInput()]),
    );
    const errored: string[] = [];
    const { results, errors } = await service.scoreBacklog({
      now: NOW,
      onThreadError: (conversationId) => errored.push(conversationId),
    });

    expect(results.map((r) => r.conversationId)).toEqual(["good-1"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.conversationId).toBe("bad-1");
    expect(errored).toEqual(["bad-1"]);
    // the failed Thread was never persisted — it stays unscored for retry
    expect(db.threadScore.create).toHaveBeenCalledTimes(1);
  });

  it("persists a coerced string violatingTurn as a 0-based index on the EvalCase", async () => {
    const db = makeBacklogDb(["fail-1"]);
    const service = new AgentEvalService(
      db,
      fakeAnthropic([
        judgementInput({
          resolved: false,
          overallScore: "20",
          failureLane: "agent_behaviour",
          expectation: "must not deflect",
          violatingTurn: "1",
        }),
      ]),
    );
    const { results, errors } = await service.scoreBacklog({ now: NOW });
    expect(errors).toEqual([]);
    expect(results).toHaveLength(1);
    const createArgs = db.threadScore.create.mock.calls[0]?.[0] as {
      data: { overallScore: number; evalCase: { create: { violatingTurnIndex: number } } };
    };
    expect(createArgs.data.overallScore).toBe(20);
    expect(createArgs.data.evalCase.create.violatingTurnIndex).toBe(0);
  });
});
