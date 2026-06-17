import { describe, expect, it, vi } from "vitest";

import {
  buildReplayJudgeUserMessage,
  diffRuns,
  formatEvidenceBlock,
  formatPrefixForJudge,
  judgeReplayResults,
  type CaseVerdict,
  type ExportedEvalCase,
  type JudgedRun,
  type ReplayOutput,
} from "~/server/services/evalPromptOrchestrator";
import { JUDGE_MODEL, JUDGE_VERSION } from "~/server/services/AgentEvalService";

const turn = (userMessage: string, aiResponse: string) => ({
  userMessage,
  aiResponse,
  toolsUsed: [],
  hadError: false,
  responseTime: null,
  createdAt: "2026-06-01T10:00:00.000Z",
});

const makeCase = (overrides: Partial<ExportedEvalCase> = {}): ExportedEvalCase => ({
  id: "case-1",
  conversationId: "conv-1",
  transcript: [
    turn("add milk to my list", "Done — created the Action."),
    turn("what's on my list?", "Go check your own list."),
  ],
  violatingTurnIndex: 1,
  expectation: "must not deflect; should call get-project-actions",
  lane: "agent_behaviour",
  ...overrides,
});

const verdict = (caseId: string, passed: boolean): CaseVerdict => ({
  caseId,
  lane: "agent_behaviour",
  passed,
  reasoning: passed ? "satisfies expectation" : "violates expectation",
});

describe("diffRuns", () => {
  it("computes pass counts and finds regressions and fixes", () => {
    const candidate = [verdict("a", true), verdict("b", false), verdict("c", true)];
    const baseline = [verdict("a", true), verdict("b", true), verdict("c", false)];
    expect(diffRuns(candidate, baseline)).toEqual({
      total: 3,
      candidatePasses: 2,
      baselinePasses: 2,
      regressions: ["b"],
      fixes: ["c"],
    });
  });

  it("handles a missing baseline (no diff, no regressions)", () => {
    expect(diffRuns([verdict("a", true), verdict("b", false)], null)).toEqual({
      total: 2,
      candidatePasses: 1,
      baselinePasses: null,
      regressions: [],
      fixes: [],
    });
  });

  it("ignores cases the baseline never saw (suite grew since baseline ran)", () => {
    const candidate = [verdict("a", false), verdict("new-case", false)];
    const baseline = [verdict("a", true)];
    const diff = diffRuns(candidate, baseline);
    expect(diff.regressions).toEqual(["a"]);
    expect(diff.baselinePasses).toBe(1); // counted over the shared case set
  });
});

describe("judgeReplayResults", () => {
  const replayFor = (results: ReplayOutput["results"]): ReplayOutput => ({
    brainVersion: "brain@abc123def456",
    results,
  });

  it("judges each result with the injected judge and stamps judge identity", async () => {
    const judge = vi.fn().mockResolvedValue({ passed: true, reasoning: "called the tool" });
    const evalCase = makeCase();
    const run = await judgeReplayResults(
      [evalCase],
      replayFor([
        {
          caseId: "case-1",
          response: "",
          toolIntents: [{ toolName: "get-project-actions", args: { status: "ACTIVE" } }],
        },
      ]),
      judge,
    );
    expect(judge).toHaveBeenCalledWith({
      evalCase,
      response: "",
      toolIntents: [{ toolName: "get-project-actions", args: { status: "ACTIVE" } }],
    });
    expect(run).toEqual({
      brainVersion: "brain@abc123def456",
      judgeModel: JUDGE_MODEL,
      judgeVersion: JUDGE_VERSION,
      verdicts: [
        {
          caseId: "case-1",
          lane: "agent_behaviour",
          passed: true,
          reasoning: "called the tool",
        },
      ],
    });
  });

  it("auto-fails runner errors and missing results without calling the judge", async () => {
    const judge = vi.fn();
    const run = await judgeReplayResults(
      [makeCase({ id: "errored" }), makeCase({ id: "missing" })],
      replayFor([
        { caseId: "errored", response: "", toolIntents: [], error: "model timeout" },
        null,
      ]),
      judge,
    );
    expect(judge).not.toHaveBeenCalled();
    expect(run.verdicts.map((v) => ({ id: v.caseId, passed: v.passed, error: v.error }))).toEqual([
      { id: "errored", passed: false, error: "model timeout" },
      { id: "missing", passed: false, error: "missing-result" },
    ]);
  });
});

describe("formatPrefixForJudge / buildReplayJudgeUserMessage", () => {
  it("renders the frozen prefix ending at the violating user message", () => {
    const rendered = formatPrefixForJudge(makeCase());
    expect(rendered).toContain("USER: add milk to my list");
    expect(rendered).toContain("ZOE: Done — created the Action.");
    expect(rendered.trim().endsWith("USER: what's on my list?")).toBe(true);
    // the original violating response is what gets regenerated — never shown
    expect(rendered).not.toContain("Go check your own list.");
  });

  it("includes expectation, response placeholder, and tool intents", () => {
    const message = buildReplayJudgeUserMessage({
      evalCase: makeCase(),
      response: "",
      toolIntents: [{ toolName: "get-project-actions", args: { status: "ACTIVE" } }],
    });
    expect(message).toContain("must not deflect; should call get-project-actions");
    expect(message).toContain("(no text — see tool intents)");
    expect(message).toContain('get-project-actions({"status":"ACTIVE"})');
  });
});

describe("formatEvidenceBlock", () => {
  const run = (verdicts: CaseVerdict[], brainVersion: string): JudgedRun => ({
    brainVersion,
    judgeModel: JUDGE_MODEL,
    judgeVersion: JUDGE_VERSION,
    verdicts,
  });

  it("prints the N/M vs K/M headline, regressions, and a per-case table", () => {
    const candidate = run([verdict("a", true), verdict("b", false)], "brain@cand");
    const baseline = run([verdict("a", true), verdict("b", true)], "brain@base");
    const block = formatEvidenceBlock({
      diff: diffRuns(candidate.verdicts, baseline.verdicts),
      candidate,
      baseline,
    });
    expect(block).toContain("Candidate passes **1/2** vs baseline **2/2**");
    expect(block).toContain("**Regressions (1)**: b");
    expect(block).toContain("`brain@cand`");
    expect(block).toContain("`brain@base`");
    expect(block).toContain(`\`${JUDGE_MODEL}\``);
    expect(block).toContain("| a | agent_behaviour | ✅ pass |");
    expect(block).toContain("| b | agent_behaviour | ❌ fail |");
  });

  it("omits the baseline comparison when none was supplied", () => {
    const candidate = run([verdict("a", true)], "brain@cand");
    const block = formatEvidenceBlock({
      diff: diffRuns(candidate.verdicts, null),
      candidate,
      baseline: null,
    });
    expect(block).toContain("Candidate passes **1/1** (no baseline supplied)");
    expect(block).not.toContain("Regressions");
  });
});
