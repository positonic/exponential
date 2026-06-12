import { describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { type PrismaClient } from "@prisma/client";

import {
  buildFiling,
  clusterFailures,
  routeCluster,
  type FailureToFile,
} from "~/server/services/failureFiling";
import {
  fileFailures,
  MAX_FILINGS_PER_RUN,
  type DestinationFilers,
} from "~/server/services/failureFilingService";
import { JUDGE_VERSION } from "~/server/services/AgentEvalService";

const failure = (overrides: Partial<FailureToFile>): FailureToFile => ({
  conversationId: "conv-1",
  lane: "agent_behaviour",
  overallScore: 30,
  reasoning: "Zoe deflected instead of fetching the list.",
  expectation: "must not deflect; should call get-project-actions",
  agentId: "zoeAgent",
  ...overrides,
});

describe("clusterFailures", () => {
  it("collapses near-identical failures in the same lane into one cluster", () => {
    const clusters = clusterFailures([
      failure({ conversationId: "a", expectation: "must not deflect; should call get-project-actions" }),
      failure({ conversationId: "b", expectation: "should call get-project-actions, must not deflect" }),
      failure({
        conversationId: "c",
        expectation: "must call createCalendarEvent when asked to schedule a meeting",
      }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.failures.map((f) => f.conversationId).sort()).toEqual(["a", "b"]);
  });

  it("never clusters across lanes, even with identical text", () => {
    const clusters = clusterFailures([
      failure({ conversationId: "a", lane: "code_bug" }),
      failure({ conversationId: "b", lane: "agent_behaviour" }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("orders failures within a cluster worst-first", () => {
    const clusters = clusterFailures([
      failure({ conversationId: "mild", overallScore: 55 }),
      failure({ conversationId: "worst", overallScore: 10 }),
    ]);
    expect(clusters[0]!.failures[0]!.conversationId).toBe("worst");
  });
});

describe("routeCluster", () => {
  it("routes code_bug to exponential beads and capability_gap to a product Ticket", () => {
    expect(routeCluster({ lane: "code_bug", failures: [failure({ lane: "code_bug" })] })).toBe(
      "exponential-beads",
    );
    expect(
      routeCluster({ lane: "capability_gap", failures: [failure({ lane: "capability_gap" })] }),
    ).toBe("product-ticket");
  });

  it("routes agent_behaviour to ../mastra by default, to this repo when reasoning points at the router/voice catalog", () => {
    expect(
      routeCluster({ lane: "agent_behaviour", failures: [failure({})] }),
    ).toBe("mastra-beads");
    expect(
      routeCluster({
        lane: "agent_behaviour",
        failures: [
          failure({
            reasoning: "The voice router persona told the user to check their own list.",
          }),
        ],
      }),
    ).toBe("exponential-beads");
  });
});

describe("buildFiling", () => {
  it("includes judge reasoning, expectation, and example Threads in the body", () => {
    const filing = buildFiling({
      lane: "agent_behaviour",
      failures: [
        failure({ conversationId: "worst", overallScore: 10 }),
        failure({ conversationId: "second", overallScore: 40 }),
      ],
    });
    expect(filing.title).toContain("[agent-quality:agent_behaviour]");
    expect(filing.title).toContain("(2 Threads)");
    expect(filing.body).toContain("`worst` — judge score 10/100");
    expect(filing.body).toContain("Judge reasoning:");
    expect(filing.body).toContain("Violated expectation:");
    expect(filing.conversationIds).toEqual(["worst", "second"]);
  });

  it("caps examples and notes the omitted count", () => {
    const filing = buildFiling({
      lane: "code_bug",
      failures: Array.from({ length: 5 }, (_, i) =>
        failure({ conversationId: `t-${i}`, lane: "code_bug" }),
      ),
    });
    expect(filing.body).toContain("(+2 more Thread(s)");
    expect(filing.conversationIds).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Service: gate + idempotency
// ---------------------------------------------------------------------------

const OPEN_GATE_PAIRS = {
  // 10 directional agreeing pairs → gate open at >=80%/min 10
  threadScores: Array.from({ length: 10 }, (_, i) => ({
    conversationId: `cal-${i}`,
    failureLane: null,
    judgeVersion: "v1",
  })),
  ratedTurns: Array.from({ length: 10 }, (_, i) => ({
    conversationId: `cal-${i}`,
    feedback: [{ rating: 5 }],
  })),
};

function mockDb(options: {
  gateOpen: boolean;
  unfiled: Array<{
    conversationId: string;
    failureLane: string;
    overallScore: number;
    reasoning: string;
    agentId: string | null;
    evalCase: { expectation: string | null } | null;
  }>;
}) {
  const db = mockDeep<PrismaClient>();
  // First threadScore.findMany call = calibration pairs; second = unfiled failures.
  db.threadScore.findMany
    .mockResolvedValueOnce(
      (options.gateOpen ? OPEN_GATE_PAIRS.threadScores : []) as never,
    )
    .mockResolvedValueOnce(options.unfiled as never);
  db.aiInteractionHistory.findMany.mockResolvedValue(
    (options.gateOpen ? OPEN_GATE_PAIRS.ratedTurns : []) as never,
  );
  db.threadScore.updateMany.mockResolvedValue({ count: 1 } as never);
  return db;
}

const unfiledRow = (conversationId: string) => ({
  conversationId,
  failureLane: "code_bug",
  overallScore: 20,
  reasoning: "createAction returned 405",
  agentId: "zoeAgent",
  evalCase: { expectation: "tool must not error" },
});

const filers = (): DestinationFilers => ({
  "exponential-beads": vi.fn().mockResolvedValue("beads:exponential-x1"),
  "mastra-beads": vi.fn().mockResolvedValue("beads:mastra-x1"),
  "product-ticket": vi.fn().mockResolvedValue("ticket:cuid1"),
});

describe("fileFailures", () => {
  it("closed gate ⇒ no filings, with a clear log message", async () => {
    const db = mockDb({ gateOpen: false, unfiled: [unfiledRow("a")] });
    const log = vi.fn();
    const f = filers();
    const result = await fileFailures(db, { filers: f, log });

    expect(result.filed).toEqual([]);
    expect(f["exponential-beads"]).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Calibration gate CLOSED"));
    // never even queried for unfiled failures
    expect(db.threadScore.findMany).toHaveBeenCalledTimes(1);
  });

  it("open gate ⇒ files each cluster and marks every covered Thread as filed", async () => {
    const db = mockDb({
      gateOpen: true,
      unfiled: [unfiledRow("a"), unfiledRow("b")], // identical → one cluster
    });
    const f = filers();
    const now = new Date("2026-06-11T12:00:00Z");
    const result = await fileFailures(db, { filers: f, log: vi.fn(), now: () => now });

    expect(result.filed).toHaveLength(1);
    expect(result.filed[0]!.ref).toBe("beads:exponential-x1");
    expect(db.threadScore.updateMany).toHaveBeenCalledWith({
      where: { conversationId: { in: ["a", "b"] } },
      data: { filedAt: now, filedRef: "beads:exponential-x1" },
    });
  });

  it("re-runs file nothing new when no unfiled failures exist", async () => {
    const db = mockDb({ gateOpen: true, unfiled: [] });
    const f = filers();
    const log = vi.fn();
    const result = await fileFailures(db, { filers: f, log });

    expect(result.filed).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("No unfiled failures"));
    // only queries failures with filedAt: null — the idempotency filter —
    // scoped to the judge version the gate actually calibrated
    expect(db.threadScore.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { failureLane: { not: null }, filedAt: null, judgeVersion: JUDGE_VERSION },
      }),
    );
  });

  it("caps filings per run and logs the deferred cluster count", async () => {
    // Disjoint expectations → every failure is its own cluster.
    const db = mockDb({
      gateOpen: true,
      unfiled: Array.from({ length: MAX_FILINGS_PER_RUN + 2 }, (_, i) => ({
        ...unfiledRow(`t-${i}`),
        evalCase: { expectation: `distinct${i} clause${i} violation${i}` },
      })),
    });
    const f = filers();
    const log = vi.fn();
    const result = await fileFailures(db, { filers: f, log });

    expect(result.filed).toHaveLength(MAX_FILINGS_PER_RUN);
    expect(f["exponential-beads"]).toHaveBeenCalledTimes(MAX_FILINGS_PER_RUN);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("2 cluster(s) deferred"));
  });

  it("dry-run reports filings but neither files nor marks", async () => {
    const db = mockDb({ gateOpen: true, unfiled: [unfiledRow("a")] });
    const f = filers();
    const result = await fileFailures(db, { filers: f, log: vi.fn(), dryRun: true });

    expect(result.filed[0]!.ref).toBe("(dry-run)");
    expect(f["exponential-beads"]).not.toHaveBeenCalled();
    expect(db.threadScore.updateMany).not.toHaveBeenCalled();
  });

  it("override flag files despite a closed gate and is flagged in the result", async () => {
    const db = mockDb({ gateOpen: false, unfiled: [unfiledRow("a")] });
    const f = filers();
    const log = vi.fn();
    const result = await fileFailures(db, { filers: f, log, overrideGate: true });

    expect(result.gateOverridden).toBe(true);
    expect(result.filed).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("--override-gate"));
  });
});
